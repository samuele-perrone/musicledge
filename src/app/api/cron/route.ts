/**
 * Vercel Cron endpoint — runs at 08:00 UTC daily.
 * Generates and publishes one post per category: music_story, vinyl_art, harmony.
 */
import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, getTodaysMusicEvent, getBreakingMusicNews, buildRelatedLinks, buildRelatedLinksCaption, buildRelatedLinksHtml } from "@/lib/claude";
import { generateImage } from "@/lib/imagegen";
import { composeImage, composeStory, composeCarouselSlide, composeFollowSlide } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { savePost, getRecentArtists, getRecentPostSummaries } from "@/lib/store";
import { createMediaContainer, publishMediaContainer, checkContainerStatus, createCarouselChildContainer, createCarouselContainer } from "@/lib/instagram";
import { postFacebookPhoto } from "@/lib/facebook";
import { createSubstackDraft } from "@/lib/substack";
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
): Promise<void> {
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

  // Generate and compose image
  const imageBase64 = await generateImage(content.imagePrompt);
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

  post.status = "image_ready";
  await savePost(post);

  // Build caption
  const hashtags = content.hashtags.map((h) => `#${h}`).join(" ");
  const relatedLinks = buildRelatedLinks(content.artist, content.title);
  const linksBlock = buildRelatedLinksCaption(relatedLinks, affiliateUrl);
  const suffix = `\n\n${hashtags}\n\n${linksBlock}`;
  const maxBody = 2200 - suffix.length - 4;
  const captionBody = content.caption.length > maxBody
    ? content.caption.slice(0, maxBody).trimEnd() + "…"
    : content.caption;
  const caption = `${captionBody}${suffix}`;
  const newsletterHtmlWithLinks = content.newsletterHtml + "\n\n" + buildRelatedLinksHtml(relatedLinks, affiliateUrl);

  // Substack draft
  try {
    const { id, url } = await createSubstackDraft(content.newsletterTitle, content.title, newsletterHtmlWithLinks, affiliateUrl);
    post.substackDraftId = id;
    post.substackDraftUrl = url;
    await savePost(post);
    log.push(`Substack: ${url}`);
  } catch (e) {
    log.push(`Substack failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Instagram carousel/single
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

  // Facebook
  try {
    const photoId = await postFacebookPhoto(blobUrl, caption);
    post.platforms.facebook = { status: "posted", postId: photoId, postedAt: new Date().toISOString() };
    log.push(`Facebook: ${photoId}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    post.platforms.facebook = { status: "failed", error: msg };
    log.push(`Facebook failed: ${msg}`);
  }

  const anyPosted = Object.values(post.platforms).some((p) => p.status === "posted");
  post.status = anyPosted ? "posted" : "failed";
  await savePost(post);

  // Add generated artist to usedArtists so next category avoids them
  usedArtists.unshift(content.artist);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Run all 3 categories sequentially — each generation naturally spaces them out
    const errors: string[] = [];
    const categories: PostCategory[] = ["music_story", "vinyl_art", "harmony"];
    for (const category of categories) {
      try {
        await generateAndPost(category, usedArtists, recentSummaries, todayEvent, breakingNews, log);
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
