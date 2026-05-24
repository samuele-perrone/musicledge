import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, getTodaysMusicEvent, getBreakingMusicNews } from "@/lib/claude";
import { generateImage, fetchImageAsBase64, ImageStyle } from "@/lib/imagegen";
import { searchAlbum, fetchAlbumArtAsBase64, searchArtistInfo, fetchImageAsBase64FromUrl } from "@/lib/musicapi";
import { composeImage, composeStory, composeStorySlide, composeFollowSlideVertical, makeVerticalSlide } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createAnimatedReelVideo } from "@/lib/video";
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

    // Fetch real image: album art for vinyl_art, artist photo for others
    let imageBase64: string;
    if (!forceStyle && content.category === "vinyl_art" && content.albumName) {
      try {
        const albumInfo = await searchAlbum(content.artist, content.albumName);
        if (albumInfo) {
          imageBase64 = await fetchAlbumArtAsBase64(albumInfo.artworkUrl);
          post.albumInfo = albumInfo;
        } else {
          imageBase64 = await generateImage(content.imagePrompt, "editorial");
        }
      } catch {
        imageBase64 = await generateImage(content.imagePrompt, "editorial");
      }
    } else if (!forceStyle) {
      try {
        const artistInfo = await searchArtistInfo(content.artist);
        if (artistInfo) {
          imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
          post.artistInfo = artistInfo;
        } else {
          imageBase64 = await generateImage(content.imagePrompt, "random");
        }
      } catch {
        imageBase64 = await generateImage(content.imagePrompt, "random");
      }
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

    // Generate animated reel video from already-composed slide buffers
    let reelError: string | undefined;
    try {
      // Intro slide: gradient template with clean photo card + title only
      let introBuffer: Buffer | null = null;
      try {
        introBuffer = await composeStory(imageBase64, content);
      } catch (e) {
        console.warn("[generate] Intro slide failed:", e);
      }
      const reelSlides = [
        ...(introBuffer ? [introBuffer] : []),
        ...slideBuffers,
        ...(followBuffer ? [followBuffer] : []),
      ];
      if (reelSlides.length === 0) throw new Error("No slides available for reel");
      const reelBuffer = await createAnimatedReelVideo(reelSlides);
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
