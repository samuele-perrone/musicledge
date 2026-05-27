/**
 * Vercel Cron endpoint — runs daily at 06:30 UTC (7:30am BST).
 * Generates one post, creates a karaoke reel video, and publishes to
 * Instagram Reels and Facebook video.
 */
import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, buildRelatedLinks, buildRelatedLinksCaption, getTodaysMusicEvent, getBreakingMusicNews } from "@/lib/claude";
import { searchAlbum, fetchAlbumArtAsBase64, searchArtistInfo, fetchImageAsBase64FromUrl, searchAdditionalImages } from "@/lib/musicapi";
import { composeImage } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createKaraokeReelVideo, findAudioTrack } from "@/lib/video";
import { savePost, getRecentArtists, getRecentPostSummaries } from "@/lib/store";
import { postFacebookVideo } from "@/lib/facebook";
import { createReelContainer, checkContainerStatus, publishMediaContainer } from "@/lib/instagram";
import { GeneratedPost, defaultPlatforms } from "@/types";
import crypto from "crypto";

export const maxDuration = 300;

async function sendErrorAlert(errors: string[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Musicledge <onboarding@resend.dev>",
      to,
      subject: "Musicledge cron errors",
      html: `<p>The following errors occurred during today's cron run:</p><ul>${errors.map(e => `<li>${e}</li>`).join("")}</ul>`,
    }),
  });
}

// POST — triggered manually from the dashboard
export async function POST() {
  return runCron();
}

// GET — triggered by Vercel cron scheduler (secret required)
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron();
}

async function runCron() {
  const log: string[] = [];

  try {
    const today = new Date();
    const [todayEvent, breakingNews] = await Promise.all([
      getTodaysMusicEvent(today),
      getBreakingMusicNews(),
    ]);

    if (breakingNews) log.push(`Breaking news: ${breakingNews}`);
    if (todayEvent) log.push(`Today's event: ${todayEvent.event} — ${todayEvent.artist}`);

    const usedArtists = await getRecentArtists(40);
    const recentSummaries = await getRecentPostSummaries(40);

    // Suppress breaking news if the artist was already covered in the last 3 posts
    const last3Artists = recentSummaries.slice(0, 3).map((s) => s.artist.toLowerCase());
    const newsAboutRecentArtist = breakingNews && last3Artists.some((a) =>
      a.split(/[\s/,]+/).some((word) => word.length > 3 && breakingNews.toLowerCase().includes(word))
    );
    const activeBreakingNews = newsAboutRecentArtist ? null : breakingNews;
    if (newsAboutRecentArtist) log.push(`Breaking news suppressed — artist recently posted`);

    // Cycle categories in order: vinyl_art → music_story → harmony
    // Breaking news forces music_story but the cycle position is still tracked by the last non-breaking post.
    const CATEGORY_CYCLE = ["vinyl_art", "music_story", "harmony"] as const;
    const lastCategory = recentSummaries[0]?.category ?? "harmony"; // default so first post is vinyl_art
    const lastIdx = CATEGORY_CYCLE.indexOf(lastCategory as typeof CATEGORY_CYCLE[number]);
    const nextCategory = CATEGORY_CYCLE[(lastIdx + 1) % CATEGORY_CYCLE.length];
    const category = activeBreakingNews ? "music_story" : nextCategory;
    log.push(`Category: ${category} (cycle next: ${nextCategory}${activeBreakingNews ? ", overridden by breaking news" : ""})`);

    const content = await generateStoryContent(
      usedArtists,
      category,
      activeBreakingNews ? undefined : (todayEvent ?? undefined),
      recentSummaries,
      activeBreakingNews ?? undefined
    );
    log.push(`Post: "${content.title}" — ${content.artist}`);

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

    // Fetch real image — never fall back to AI
    let imageBase64: string;
    if (category === "vinyl_art" && content.albumName) {
      const albumInfo = await searchAlbum(content.artist, content.albumName).catch(() => null);
      if (albumInfo) {
        imageBase64 = await fetchAlbumArtAsBase64(albumInfo.artworkUrl);
        post.albumInfo = albumInfo;
        log.push(`Album art: ${albumInfo.albumName}`);
      } else {
        // Fall back to artist photo if album not found
        const artistInfo = await searchArtistInfo(content.artist).catch(() => null);
        if (!artistInfo) throw new Error(`No real image found for ${content.artist}`);
        imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
        post.artistInfo = artistInfo;
        log.push(`Album art not found, using artist photo: ${artistInfo.artistName}`);
      }
    } else {
      const artistInfo = await searchArtistInfo(content.artist).catch(() => null);
      if (!artistInfo) throw new Error(`No real image found for ${content.artist}`);
      imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
      post.artistInfo = artistInfo;
      log.push(`Artist photo: ${artistInfo.artistName}`);
    }

    // Compose cover image (for dashboard preview + intro reel frame)
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;

    // Create karaoke reel
    const slides = content.carouselSlides ?? [];
    const primaryBuffer = Buffer.from(imageBase64, "base64");

    // Same logic for all categories: slides 2-3 use real artist photo (Deezer/Spotify)
    const isRealArtistPhoto = !!post.artistInfo?.isArtistPhoto;
    let artistPhotoBuffer: Buffer | null = isRealArtistPhoto ? primaryBuffer : null;

    if (!isRealArtistPhoto) {
      try {
        const info = await searchArtistInfo(content.artist);
        if (info?.isArtistPhoto && info.imageUrl) {
          artistPhotoBuffer = Buffer.from(
            await fetchImageAsBase64FromUrl(info.imageUrl), "base64"
          );
          log.push(`Artist photo for slides: ${info.artistName}`);
        }
      } catch {}
    }

    // For vinyl_art without artist photo: repeat the album cover (consistent look).
    // For other categories: fetch additional album arts for visual variety.
    const albumArts = (!artistPhotoBuffer && category !== "vinyl_art")
      ? await searchAdditionalImages(content.artist, 2).catch(() => [] as Buffer[])
      : ([] as Buffer[]);

    const imageBuffers = [
      primaryBuffer,
      primaryBuffer,
      artistPhotoBuffer ?? albumArts[0] ?? primaryBuffer,
      artistPhotoBuffer ?? albumArts[1] ?? primaryBuffer,
    ];

    const reelBuffer = await createKaraokeReelVideo(
      imageBuffers,
      slides,
      { artist: content.artist, title: content.title, category: content.category ?? "music_story", imageCaption: content.imageCaption },
      findAudioTrack()
    );
    const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel.mp4`);
    post.reelBlobUrl = reelBlobUrl;
    log.push(`Reel video: ${reelBlobUrl}`);

    // Build caption
    const hashtags = content.hashtags.map((h) => `#${h}`).join(" ");
    const relatedLinks = buildRelatedLinks(content.artist, content.title, {
      spotifyUrl: post.albumInfo?.spotifyUrl ?? post.artistInfo?.spotifyUrl,
      appleMusicUrl: post.albumInfo?.appleMusicUrl ?? post.artistInfo?.appleMusicUrl,
      albumName: post.albumInfo?.albumName ?? content.albumName,
    });
    const linksBlock = buildRelatedLinksCaption(relatedLinks, affiliateUrl);
    const creditLine = post.albumInfo
      ? `\n📷 Album artwork © ${post.albumInfo.artistName}, via @applemusic`
      : post.artistInfo
      ? `\n📷 Photo © ${post.artistInfo.artistName}, via @spotify`
      : "";
    const suffix = `${creditLine}\n\n${hashtags}\n\n${linksBlock}`;
    const maxBody = 2200 - suffix.length - 4;
    const captionBody = content.caption.length > maxBody
      ? content.caption.slice(0, maxBody).trimEnd() + "…"
      : content.caption;
    const caption = `${captionBody}${suffix}`;

    post.status = "image_ready";
    await savePost(post);

    const errors: string[] = [];

    // ── Instagram Reels ───────────────────────────────────────────────────────
    try {
      const containerId = await createReelContainer(reelBlobUrl, caption);
      let status = "IN_PROGRESS";
      let attempts = 0;
      while (status === "IN_PROGRESS" && attempts < 12) {
        await new Promise((r) => setTimeout(r, 5000));
        status = await checkContainerStatus(containerId);
        attempts++;
      }
      if (status !== "FINISHED") throw new Error(`Reel container not ready: ${status}`);
      const mediaId = await publishMediaContainer(containerId);
      post.platforms.reel = { status: "posted", postId: mediaId, postedAt: new Date().toISOString() };
      log.push(`Instagram Reel: ${mediaId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.reel = { status: "failed", error: msg };
      errors.push(`Instagram Reel: ${msg}`);
      log.push(`Instagram Reel failed: ${msg}`);
    }

    // ── Facebook Video ────────────────────────────────────────────────────────
    try {
      const videoId = await postFacebookVideo(reelBlobUrl, caption, content.title);
      post.platforms.facebook = { status: "posted", postId: videoId, postedAt: new Date().toISOString() };
      log.push(`Facebook video: ${videoId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.facebook = { status: "failed", error: msg };
      errors.push(`Facebook video: ${msg}`);
      log.push(`Facebook video failed: ${msg}`);
    }

    const allPosted = post.platforms.reel?.status === "posted" && post.platforms.facebook?.status === "posted";
    const anyPosted = post.platforms.reel?.status === "posted" || post.platforms.facebook?.status === "posted";
    post.status = allPosted ? "posted" : anyPosted ? "posted" : "failed";
    await savePost(post);

    if (errors.length > 0) {
      await sendErrorAlert(errors).catch(() => {});
    }

    return NextResponse.json({ success: errors.length === 0, log, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`FATAL: ${message}`);
    await sendErrorAlert([`FATAL: ${message}`]).catch(() => {});
    return NextResponse.json({ success: false, log, error: message }, { status: 500 });
  }
}
