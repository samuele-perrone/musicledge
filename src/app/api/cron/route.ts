/**
 * Vercel Cron endpoint — runs daily at 06:30 UTC (7:30am BST).
 * Generates one vinyl_art post and publishes each slide as an individual Instagram Story.
 */
import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, getTodaysMusicEvent, getBreakingMusicNews } from "@/lib/claude";
import { generateImage } from "@/lib/imagegen";
import { searchAlbum, fetchAlbumArtAsBase64, searchArtistInfo, fetchImageAsBase64FromUrl } from "@/lib/musicapi";
import { composeImage, composeStorySlide, composeFollowSlideVertical } from "@/lib/compose";
import { uploadImageToBlob } from "@/lib/blob";
import { savePost, getRecentArtists, getRecentPostSummaries } from "@/lib/store";
import { publishInstagramStory } from "@/lib/instagram";
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

async function generateAndPostVinylArt(
  usedArtists: string[],
  recentSummaries: { artist: string; title: string; category: string }[],
  todayEvent: { artist: string; event: string; suggestedCategory: import("@/types").PostCategory } | null,
  breakingNews: string | null,
  log: string[]
): Promise<{ artist: string; title: string; category: string }> {
  // Use music_story for breaking news (more appropriate format), vinyl_art otherwise
  const category = breakingNews ? "music_story" : "vinyl_art";
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

  // Fetch real image: album art for vinyl_art, artist photo for music_story (breaking news)
  let imageBase64: string;
  if (category === "vinyl_art" && content.albumName) {
    try {
      const albumInfo = await searchAlbum(content.artist, content.albumName);
      if (albumInfo) {
        imageBase64 = await fetchAlbumArtAsBase64(albumInfo.artworkUrl);
        post.albumInfo = albumInfo;
        log.push(`Album art: ${albumInfo.albumName} — ${albumInfo.artistName}`);
      } else {
        log.push("Album art not found on iTunes, falling back to AI");
        imageBase64 = await generateImage(content.imagePrompt, "editorial");
      }
    } catch (e) {
      log.push(`Album art fetch failed: ${e instanceof Error ? e.message : String(e)}, falling back to AI`);
      imageBase64 = await generateImage(content.imagePrompt, "editorial");
    }
  } else {
    try {
      const artistInfo = await searchArtistInfo(content.artist);
      if (artistInfo) {
        imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
        post.artistInfo = artistInfo;
        log.push(`Artist photo: ${artistInfo.artistName}`);
      } else {
        log.push("Artist photo not found, falling back to AI");
        imageBase64 = await generateImage(content.imagePrompt, "random");
      }
    } catch (e) {
      log.push(`Artist photo fetch failed: ${e instanceof Error ? e.message : String(e)}, falling back to AI`);
      imageBase64 = await generateImage(content.imagePrompt, "random");
    }
  }

  // Compose cover image (used as background for slides)
  const composedBuffer = await composeImage(imageBase64, content);
  post.imageBase64 = composedBuffer.toString("base64");
  const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
  post.blobUrl = blobUrl;

  // Compose 3 story slides + follow slide (all 1080×1920)
  const slides = content.carouselSlides ?? [];
  const totalContentSlides = slides.length; // should be 3
  const storySlideUrls: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    try {
      const slideBuffer = await composeStorySlide(imageBase64, content, slides[i], i + 1, totalContentSlides);
      const slideUrl = await uploadImageToBlob(slideBuffer, `posts/${post.id}-story-slide${i + 1}.jpg`);
      storySlideUrls.push(slideUrl);
    } catch (e) {
      log.push(`Story slide ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Follow slide
  try {
    const followBuffer = await composeFollowSlideVertical(content);
    const followUrl = await uploadImageToBlob(followBuffer, `posts/${post.id}-follow.jpg`);
    storySlideUrls.push(followUrl);
  } catch (e) {
    log.push(`Follow slide failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  post.carouselBlobUrls = storySlideUrls;
  post.status = "image_ready";
  await savePost(post);

  // Build user tags: artist handle + any media accounts Claude suggested
  const userTags: string[] = [
    ...(content.instagramHandle ? [content.instagramHandle] : []),
    ...(content.tagAccounts ?? []),
  ];

  // Post each slide as an individual Instagram Story
  const postedStoryIds: string[] = [];
  for (let i = 0; i < storySlideUrls.length; i++) {
    try {
      const storyId = await publishInstagramStory(storySlideUrls[i], userTags.length > 0 ? userTags : undefined);
      postedStoryIds.push(storyId);
      log.push(`Story slide ${i + 1}: ${storyId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.push(`Story slide ${i + 1} failed: ${msg}`);
    }
  }

  const anyPosted = postedStoryIds.length > 0;
  post.platforms.story = anyPosted
    ? { status: "posted", postId: postedStoryIds[0], postedAt: new Date().toISOString() }
    : { status: "failed", error: "No story slides posted" };
  post.platforms.instagram = { status: "skipped" };
  post.platforms.reel = { status: "skipped" };
  post.platforms.facebook = { status: "skipped" };

  post.status = anyPosted ? "posted" : "failed";
  await savePost(post);

  usedArtists.unshift(content.artist);
  return { artist: content.artist, title: content.title, category: "vinyl_art" };
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

    const errors: string[] = [];
    try {
      await generateAndPostVinylArt(usedArtists, recentSummaries, todayEvent, breakingNews, log);
    } catch (e) {
      const msg = `vinyl_art FATAL: ${e instanceof Error ? e.message : String(e)}`;
      log.push(msg);
      errors.push(msg);
    }

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
