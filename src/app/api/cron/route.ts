/**
 * Vercel Cron endpoint — runs at 08:00 and 20:00 UTC daily.
 * Generates a new music story post and publishes to all platforms.
 */
import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl } from "@/lib/claude";
import { generateImage, fetchImageAsBase64 } from "@/lib/imagegen";
import { composeImage, composeStory } from "@/lib/compose";
import { uploadImageToBlob } from "@/lib/blob";
import { savePost, getRecentArtists } from "@/lib/store";
import { createMediaContainer, publishMediaContainer, checkContainerStatus } from "@/lib/instagram";
import { postTikTokPhoto } from "@/lib/tiktok";
import { createShortsVideo } from "@/lib/video";
import { uploadYouTubeShort } from "@/lib/youtube";
import { postFacebookPhoto } from "@/lib/facebook";
import { createSubstackDraft } from "@/lib/substack";
import { GeneratedPost, defaultPlatforms } from "@/types";
import crypto from "crypto";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];

  try {
    // 1. Generate story
    const usedArtists = await getRecentArtists(20);
    const content = await generateStoryContent(usedArtists);
    log.push(`Story: "${content.title}" — ${content.artist}`);

    const affiliateUrl = buildAffiliateUrl(content.amazonSearchTerms);
    const post: GeneratedPost = {
      id: crypto.randomUUID(),
      content,
      affiliateUrl,
      platforms: defaultPlatforms(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await savePost(post);

    // 2. Generate and compose image
    const imageBase64 = await generateImage(content.imagePrompt);
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");
    log.push("Image composed");

    // 3. Upload to Blob
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;

    // Story image
    const storyBuffer = await composeStory(composedBuffer, content);
    const storyBlobUrl = await uploadImageToBlob(storyBuffer, `posts/${post.id}-story.jpg`);
    post.storyBlobUrl = storyBlobUrl;

    post.status = "image_ready";
    await savePost(post);
    log.push(`Uploaded to Blob: ${blobUrl}`);

    const hashtags = content.hashtags.map((h) => `#${h}`).join(" ");
    const affiliateLine = affiliateUrl ? `\n\n🎵 Find this album: ${affiliateUrl}` : "";
    const caption = `${content.caption}\n\n${hashtags}${affiliateLine}`;

    // 4. Substack draft
    try {
      const { id, url } = await createSubstackDraft(
        content.newsletterTitle,
        content.title,
        content.newsletterHtml,
        affiliateUrl
      );
      post.substackDraftId = id;
      post.substackDraftUrl = url;
      await savePost(post);
      log.push(`Substack draft created: ${url}`);
    } catch (e) {
      log.push(`Substack draft failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 5. Instagram
    try {
      const containerId = await createMediaContainer(blobUrl, caption);
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
      log.push(`Instagram posted: ${mediaId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.instagram = { status: "failed", error: msg };
      log.push(`Instagram failed: ${msg}`);
    }

    // 6. Facebook
    try {
      const photoId = await postFacebookPhoto(blobUrl, caption);
      post.platforms.facebook = { status: "posted", postId: photoId, postedAt: new Date().toISOString() };
      log.push(`Facebook posted: ${photoId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.facebook = { status: "failed", error: msg };
      log.push(`Facebook failed: ${msg}`);
    }

    const anyPosted = Object.values(post.platforms).some((p) => p.status === "posted");
    post.status = anyPosted ? "posted" : "failed";
    await savePost(post);

    return NextResponse.json({ success: true, log, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`FATAL: ${message}`);
    console.error("[cron] Fatal error:", message);
    return NextResponse.json({ success: false, log, error: message }, { status: 500 });
  }
}
