/**
 * Vercel Cron endpoint — runs at 08:00 UTC daily.
 * Generates and publishes one post per category: music_story, vinyl_art, harmony.
 */
import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, getTodaysMusicEvent, getBreakingMusicNews, buildRelatedLinks, buildRelatedLinksCaption } from "@/lib/claude";
import { generateImage } from "@/lib/imagegen";
import { searchAlbum, fetchAlbumArtAsBase64, searchArtistInfo, fetchImageAsBase64FromUrl } from "@/lib/musicapi";
import { composeImage, composeStory, composeCarouselSlide, makeVerticalSlide, composeFollowSlide } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createAnimatedReelVideo } from "@/lib/video";
import { savePost, getRecentArtists, getRecentPostSummaries } from "@/lib/store";
import { createMediaContainer, publishMediaContainer, checkContainerStatus, createCarouselChildContainer, createCarouselContainer, createReelContainer } from "@/lib/instagram";
import { postFacebookPhoto } from "@/lib/facebook";
import { GeneratedPost, defaultPlatforms, PostCategory } from "@/types";
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

async function generateAndPost(
  category: PostCategory,
  usedArtists: string[],
  recentSummaries: { artist: string; title: string; category: string }[],
  todayEvent: { artist: string; event: string; suggestedCategory: PostCategory } | null,
  breakingNews: string | null,
  log: string[]
): Promise<{ artist: string; title: string; category: string }> {
  log.push(`\n--- ${category.toUpperCase()} ---`);

  const content = await generateStoryContent(
    usedArtists,
    category,
    breakingNews ? undefined : (todayEvent ?? undefined),
    recentSummaries,
    breakingNews ?? undefined
  );
  log.push(`Story: "${content.title}" — ${content.artist}`);

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

  // Try to use real images: album art for vinyl_art, artist photo for others
  let imageBase64: string;
  let albumInfo = null;
  let artistInfo = null;
  if (category === "vinyl_art" && content.albumName) {
    try {
      albumInfo = await searchAlbum(content.artist, content.albumName);
      if (albumInfo) {
        imageBase64 = await fetchAlbumArtAsBase64(albumInfo.artworkUrl);
        post.albumInfo = albumInfo;
        log.push(`Album art: ${albumInfo.albumName} — ${albumInfo.artistName}`);
      } else {
        log.push("Album art not found on iTunes, falling back to AI generation");
        imageBase64 = await generateImage(content.imagePrompt, "editorial");
      }
    } catch (e) {
      log.push(`Album art fetch failed: ${e instanceof Error ? e.message : String(e)}, falling back to AI`);
      imageBase64 = await generateImage(content.imagePrompt, "editorial");
    }
  } else {
    try {
      artistInfo = await searchArtistInfo(content.artist);
      if (artistInfo) {
        imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
        post.artistInfo = artistInfo;
        log.push(`Artist photo: ${artistInfo.artistName}`);
      } else {
        log.push("Artist photo not found, falling back to AI generation");
        imageBase64 = await generateImage(content.imagePrompt, "random");
      }
    } catch (e) {
      log.push(`Artist photo fetch failed: ${e instanceof Error ? e.message : String(e)}, falling back to AI`);
      imageBase64 = await generateImage(content.imagePrompt, "random");
    }
  }
  const composedBuffer = await composeImage(imageBase64, content);
  post.imageBase64 = composedBuffer.toString("base64");

  // Upload images
  const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
  post.blobUrl = blobUrl;

  const storyBuffer = await composeStory(composedBuffer, content);
  const storyBlobUrl = await uploadImageToBlob(storyBuffer, `posts/${post.id}-story.jpg`);
  post.storyBlobUrl = storyBlobUrl;

  // Carousel slides
  const carouselBlobUrls: string[] = [blobUrl];
  if (content.carouselSlides?.length) {
    for (let i = 0; i < content.carouselSlides.length; i++) {
      try {
        const slideBuffer = await composeCarouselSlide(imageBase64, content, content.carouselSlides[i], i + 2, 4);
        const slideUrl = await uploadImageToBlob(slideBuffer, `posts/${post.id}-slide${i + 2}.jpg`);
        carouselBlobUrls.push(slideUrl);
      } catch (e) {
        log.push(`Slide ${i + 2} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  try {
    const followBuffer = await composeFollowSlide(content);
    const followUrl = await uploadImageToBlob(followBuffer, `posts/${post.id}-follow.jpg`);
    carouselBlobUrls.push(followUrl);
  } catch (e) {
    log.push(`Follow slide failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  post.carouselBlobUrls = carouselBlobUrls;

  // Generate animated reel video
  try {
    const verticalFrames: Buffer[] = [storyBuffer];
    if (content.carouselSlides?.length && carouselBlobUrls.length > 1) {
      for (let i = 1; i < carouselBlobUrls.length - 1; i++) {
        const slideBuffer = await composeCarouselSlide(imageBase64, content, content.carouselSlides[i - 1], i + 1, carouselBlobUrls.length);
        verticalFrames.push(await makeVerticalSlide(slideBuffer));
      }
    }
    const followBuffer = await composeFollowSlide(content);
    verticalFrames.push(await makeVerticalSlide(followBuffer));
    const reelBuffer = await createAnimatedReelVideo(verticalFrames);
    const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel.mp4`);
    post.reelBlobUrl = reelBlobUrl;
    log.push(`Reel: created`);
  } catch (e) {
    log.push(`Reel failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  post.status = "image_ready";
  await savePost(post);

  // Build caption
  const hashtags = content.hashtags.map((h) => `#${h}`).join(" ");
  const relatedLinks = buildRelatedLinks(content.artist, content.title, {
    spotifyUrl: albumInfo?.spotifyUrl ?? artistInfo?.spotifyUrl,
    appleMusicUrl: albumInfo?.appleMusicUrl ?? artistInfo?.appleMusicUrl,
  });
  const linksBlock = buildRelatedLinksCaption(relatedLinks, affiliateUrl);
  const creditLine = albumInfo
    ? `\n📷 Album artwork © ${albumInfo.artistName}, via @applemusic`
    : artistInfo
    ? `\n📷 Photo © ${artistInfo.artistName}, via @spotify`
    : "";
  const suffix = `${creditLine}\n\n${hashtags}\n\n${linksBlock}`;
  const maxBody = 2200 - suffix.length - 4;
  const captionBody = content.caption.length > maxBody
    ? content.caption.slice(0, maxBody).trimEnd() + "…"
    : content.caption;
  const caption = `${captionBody}${suffix}`;

  if (category === "vinyl_art") {
    // vinyl_art: post as Reel only (no carousel, no Facebook)
    try {
      if (!post.reelBlobUrl) throw new Error("No reel video URL");
      const containerId = await createReelContainer(post.reelBlobUrl, caption);
      let status = "IN_PROGRESS";
      let attempts = 0;
      while (status === "IN_PROGRESS" && attempts < 20) {
        await new Promise((r) => setTimeout(r, 3000));
        status = await checkContainerStatus(containerId);
        attempts++;
      }
      if (status !== "FINISHED") throw new Error(`Reel container: ${status}`);
      const mediaId = await publishMediaContainer(containerId);
      post.platforms.reel = { status: "posted", postId: mediaId, postedAt: new Date().toISOString() };
      post.platforms.instagram = { status: "skipped" };
      post.platforms.facebook = { status: "skipped" };
      log.push(`Reel: ${mediaId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.reel = { status: "failed", error: msg };
      log.push(`Reel failed: ${msg}`);
    }
  } else {
    // music_story / harmony: carousel on Instagram + photo on Facebook (no reel)
    post.platforms.reel = { status: "skipped" };

    try {
      let containerId: string;
      if (post.carouselBlobUrls && post.carouselBlobUrls.length > 1) {
        const childIds = await Promise.all(post.carouselBlobUrls.map((url) => createCarouselChildContainer(url)));
        containerId = await createCarouselContainer(childIds, caption);
      } else {
        containerId = await createMediaContainer(blobUrl, caption);
      }
      let status = "IN_PROGRESS";
      let attempts = 0;
      while (status === "IN_PROGRESS" && attempts < 15) {
        await new Promise((r) => setTimeout(r, 3000));
        status = await checkContainerStatus(containerId);
        attempts++;
      }
      if (status !== "FINISHED") throw new Error(`Container: ${status}`);
      const mediaId = await publishMediaContainer(containerId);
      post.platforms.instagram = { status: "posted", postId: mediaId, postedAt: new Date().toISOString() };
      log.push(`Instagram: ${mediaId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.instagram = { status: "failed", error: msg };
      log.push(`Instagram failed: ${msg}`);
    }

    try {
      const photoId = await postFacebookPhoto(blobUrl, caption);
      post.platforms.facebook = { status: "posted", postId: photoId, postedAt: new Date().toISOString() };
      log.push(`Facebook: ${photoId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.facebook = { status: "failed", error: msg };
      log.push(`Facebook failed: ${msg}`);
    }
  }

  const anyPosted = Object.values(post.platforms).some((p) => p.status === "posted");
  post.status = anyPosted ? "posted" : "failed";
  await savePost(post);

  // Add generated artist to usedArtists so next category avoids them
  usedArtists.unshift(content.artist);
  return { artist: content.artist, title: content.title, category };
}

// POST — triggered manually from the dashboard (no secret needed, session-protected)
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

    // Run all 3 categories sequentially, accumulating summaries to avoid repeats within the same run
    const errors: string[] = [];
    const categories: PostCategory[] = ["music_story", "vinyl_art", "harmony"];
    for (const category of categories) {
      try {
        const summary = await generateAndPost(category, usedArtists, recentSummaries, todayEvent, breakingNews, log);
        recentSummaries.unshift(summary); // add to context so next category avoids same topic
      } catch (e) {
        const msg = `${category} FATAL: ${e instanceof Error ? e.message : String(e)}`;
        log.push(msg);
        errors.push(msg);
      }
    }

    // Also collect any platform failures from the log
    const platformErrors = log.filter(l => l.includes("failed:") || l.includes("FATAL"));
    const allErrors = [...new Set([...errors, ...platformErrors])];
    if (allErrors.length > 0) {
      await sendErrorAlert(allErrors).catch(() => {});
    }

    return NextResponse.json({ success: true, log });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`FATAL: ${message}`);
    return NextResponse.json({ success: false, log, error: message }, { status: 500 });
  }
}
