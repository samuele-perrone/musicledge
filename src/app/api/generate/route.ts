import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, getTodaysMusicEvent, getBreakingMusicNews } from "@/lib/claude";
import { generateImage, fetchImageAsBase64, ImageStyle } from "@/lib/imagegen";
import { searchAlbum, fetchAlbumArtAsBase64, searchArtistInfo, fetchImageAsBase64FromUrl, searchAdditionalImages } from "@/lib/musicapi";
import { composeImage, composeStorySlide, composeFollowSlideVertical } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createKaraokeReelVideo } from "@/lib/video";
import { savePost, getRecentArtists, getRecentPostSummaries } from "@/lib/store";
import { GeneratedPost, defaultPlatforms, PostCategory } from "@/types";
import crypto from "crypto";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const forceArtist: string | undefined = body?.artist;
    const forceCategory: PostCategory | undefined = body?.category;
    const forceStyle: ImageStyle | undefined = body?.imageStyle;
    const manualNews: string | undefined = body?.breakingNews;

    const [todayEvent, autoNews] = await Promise.all([
      getTodaysMusicEvent(new Date()),
      manualNews ? Promise.resolve(null) : getBreakingMusicNews(),
    ]);
    const breakingNews = manualNews ?? autoNews ?? undefined;

    const usedArtists = await getRecentArtists(40);
    const recentSummaries = await getRecentPostSummaries(40);
    const category = forceCategory ?? todayEvent?.suggestedCategory;
    const content = await generateStoryContent(
      forceArtist ? [] : usedArtists,
      category,
      breakingNews ? undefined : (todayEvent ?? undefined),
      recentSummaries,
      breakingNews
    );
    if (forceArtist) content.artist = forceArtist;

    const affiliateUrl = buildAffiliateUrl(content.amazonSearchTerms);

    const post: GeneratedPost = {
      id: crypto.randomUUID(),
      content,
      affiliateUrl,
      todayEvent: todayEvent?.event,
      platforms: defaultPlatforms(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await savePost(post);

    // Fetch real image: always use real photos/artwork, never AI-generated fallback
    let imageBase64: string;
    if (!forceStyle && content.category === "vinyl_art" && content.albumName) {
      // Try exact album, then artist's most popular album, then artist photo
      const albumInfo = await searchAlbum(content.artist, content.albumName).catch(() => null);
      if (albumInfo) {
        imageBase64 = await fetchAlbumArtAsBase64(albumInfo.artworkUrl);
        post.albumInfo = albumInfo;
      } else {
        const artistInfo = await searchArtistInfo(content.artist).catch(() => null);
        if (!artistInfo) throw new Error(`No real image found for ${content.artist} — skipping AI fallback`);
        imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
        post.artistInfo = artistInfo;
      }
    } else if (!forceStyle) {
      const artistInfo = await searchArtistInfo(content.artist).catch(() => null);
      if (!artistInfo) throw new Error(`No real image found for ${content.artist} — skipping AI fallback`);
      imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
      post.artistInfo = artistInfo;
    } else {
      imageBase64 = await generateImage(content.imagePrompt, forceStyle);
    }

    // Compose cover image (square, used as thumbnail in dashboard)
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;

    // Compose story slides (1080×1920): slide 1-3 content + follow slide
    // Keep buffers in memory to reuse for video (avoid double-composing)
    const slides = content.carouselSlides ?? [];
    const storySlideUrls: string[] = [];
    const slideBuffers: Buffer[] = [];
    for (let i = 0; i < slides.length; i++) {
      try {
        const slideBuffer = await composeStorySlide(imageBase64, content, slides[i], i + 1, slides.length);
        slideBuffers.push(slideBuffer);
        const slideUrl = await uploadImageToBlob(slideBuffer, `posts/${post.id}-story-slide${i + 1}.jpg`);
        storySlideUrls.push(slideUrl);
      } catch (e) {
        console.warn(`[generate] Story slide ${i + 1} failed:`, e);
      }
    }
    let followBuffer: Buffer | null = null;
    try {
      followBuffer = await composeFollowSlideVertical(content);
      const followUrl = await uploadImageToBlob(followBuffer, `posts/${post.id}-follow.jpg`);
      storySlideUrls.push(followUrl);
    } catch (e) {
      console.warn("[generate] Follow slide failed:", e);
    }
    post.carouselBlobUrls = storySlideUrls;

    // Generate karaoke reel video
    // Same logic for ALL categories:
    //   [0] intro  — primary image
    //   [1] slide1 — same as intro
    //   [2] slide2 — Spotify artist/band photo
    //   [3] slide3 — Spotify artist/band photo
    let reelError: string | undefined;
    try {
      const primaryBuffer = Buffer.from(imageBase64, "base64");

      // If primary was already fetched from Spotify (has spotifyUrl), reuse it.
      // Otherwise fetch the Spotify artist photo explicitly for slides 2-3.
      const isRealArtistPhoto = !!post.artistInfo?.isArtistPhoto;
      let artistPhotoBuffer: Buffer | null = isRealArtistPhoto ? primaryBuffer : null;

      if (!isRealArtistPhoto) {
        try {
          const info = await searchArtistInfo(content.artist);
          if (info?.isArtistPhoto && info.imageUrl) {
            artistPhotoBuffer = Buffer.from(
              await fetchImageAsBase64FromUrl(info.imageUrl), "base64"
            );
          }
        } catch {}
      }

      // For vinyl_art without artist photo: repeat the album cover (consistent look).
      // For other categories: fetch additional album arts for visual variety.
      const albumArts = (!artistPhotoBuffer && content.category !== "vinyl_art")
        ? await searchAdditionalImages(content.artist, 2).catch(() => [] as Buffer[])
        : ([] as Buffer[]);

      console.log(`[generate] imageBuffers: primary=${isRealArtistPhoto ? "artistPhoto" : "albumArt"}, artistPhotoBuffer=${!!artistPhotoBuffer}, albumArtFallbacks=${albumArts.length}`);

      const imageBuffers = [
        primaryBuffer,                                      // intro
        primaryBuffer,                                      // slide 1: same as intro
        artistPhotoBuffer ?? albumArts[0] ?? primaryBuffer, // slide 2: artist photo
        artistPhotoBuffer ?? albumArts[1] ?? primaryBuffer, // slide 3: artist photo
      ];

      const reelBuffer = await createKaraokeReelVideo(
        imageBuffers,
        content.carouselSlides ?? [],
        { artist: content.artist, title: content.title, category: content.category ?? "music_story" }
      );
      const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel.mp4`);
      post.reelBlobUrl = reelBlobUrl;
    } catch (reelErr) {
      reelError = reelErr instanceof Error ? reelErr.message : String(reelErr);
      console.error("[generate] Reel video creation failed:", reelError);
    }

    post.status = "image_ready";
    await savePost(post);

    return NextResponse.json({ success: true, post, reelError });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to generate a new post" });
}
