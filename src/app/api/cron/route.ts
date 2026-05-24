/**
 * Vercel Cron endpoint — runs daily at 06:30 UTC (7:30am BST).
 * Generates one post, composes an animated reel video, and publishes to
 * Instagram Reels and Facebook video. No cover image or slide posts.
 */
import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, buildRelatedLinks, buildRelatedLinksCaption, getTodaysMusicEvent, getBreakingMusicNews } from "@/lib/claude";
import { generateImage } from "@/lib/imagegen";
import { searchAlbum, fetchAlbumArtAsBase64, searchArtistInfo, fetchImageAsBase64FromUrl } from "@/lib/musicapi";
import { composeImage, composeStory, composeVinylIntroSlide, composeStorySlide, composeFollowSlideVertical } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createAnimatedReelVideo } from "@/lib/video";
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

    // Category: music_story for breaking news, vinyl_art otherwise
    const category = breakingNews ? "music_story" : "vinyl_art";
    log.push(`Category: ${category}`);

    const content = await generateStoryContent(
      usedArtists,
      category,
      breakingNews ? undefined : (todayEvent ?? undefined),
      recentSummaries,
      breakingNews ?? undefined
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

    // Fetch image
    let imageBase64: string;
    if (category === "vinyl_art" && content.albumName) {
      try {
        const albumInfo = await searchAlbum(content.artist, content.albumName);
        if (albumInfo) {
          imageBase64 = await fetchAlbumArtAsBase64(albumInfo.artworkUrl);
          post.albumInfo = albumInfo;
          log.push(`Album art: ${albumInfo.albumName}`);
        } else {
          imageBase64 = await generateImage(content.imagePrompt, "editorial");
          log.push("Album art not found, using AI");
        }
      } catch (e) {
        imageBase64 = await generateImage(content.imagePrompt, "editorial");
        log.push(`Album art failed: ${e instanceof Error ? e.message : e}, using AI`);
      }
    } else {
      try {
        const artistInfo = await searchArtistInfo(content.artist);
        if (artistInfo) {
          imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
          post.artistInfo = artistInfo;
          log.push(`Artist photo: ${artistInfo.artistName}`);
        } else {
          imageBase64 = await generateImage(content.imagePrompt, "random");
          log.push("Artist photo not found, using AI");
        }
      } catch (e) {
        imageBase64 = await generateImage(content.imagePrompt, "random");
        log.push(`Artist photo failed: ${e instanceof Error ? e.message : e}, using AI`);
      }
    }

    // Compose cover image (for dashboard preview + intro reel frame)
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;

    // Compose reel: intro slide + content slides + follow slide
    const slides = content.carouselSlides ?? [];
    const slideBuffers: Buffer[] = [];

    let introBuffer: Buffer | null = null;
    try {
      introBuffer = category === "vinyl_art"
        ? await composeVinylIntroSlide(imageBase64, content)
        : await composeStory(composedBuffer, content);
    } catch (e) {
      log.push(`Intro slide failed: ${e instanceof Error ? e.message : e}`);
    }

    for (let i = 0; i < slides.length; i++) {
      try {
        const buf = await composeStorySlide(imageBase64, content, slides[i], i + 1, slides.length);
        slideBuffers.push(buf);
      } catch (e) {
        log.push(`Content slide ${i + 1} failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    let followBuffer: Buffer | null = null;
    try {
      followBuffer = await composeFollowSlideVertical(content);
    } catch (e) {
      log.push(`Follow slide failed: ${e instanceof Error ? e.message : e}`);
    }

    const reelSlides = [
      ...(introBuffer ? [introBuffer] : []),
      ...slideBuffers,
      ...(followBuffer ? [followBuffer] : []),
    ];

    if (reelSlides.length === 0) throw new Error("No slides composed — cannot create reel");

    const reelBuffer = await createAnimatedReelVideo(reelSlides);
    const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel.mp4`);
    post.reelBlobUrl = reelBlobUrl;
    log.push(`Reel video: ${reelBlobUrl}`);

    // Build caption
    const hashtags = content.hashtags.map((h) => `#${h}`).join(" ");
    const relatedLinks = buildRelatedLinks(content.artist, content.title, {
      spotifyUrl: post.albumInfo?.spotifyUrl ?? post.artistInfo?.spotifyUrl,
      appleMusicUrl: post.albumInfo?.appleMusicUrl ?? post.artistInfo?.appleMusicUrl,
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
      while (status === "IN_PROGRESS" && attempts < 24) {
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
