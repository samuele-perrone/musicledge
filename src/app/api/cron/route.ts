/**
 * Vercel Cron endpoint — runs every 12 hours.
 * Configured in vercel.json below.
 * Protected by CRON_SECRET to prevent unauthorized calls.
 */
import { NextResponse } from "next/server";
import { generateStoryContent } from "@/lib/claude";
import { generateImage, fetchImageAsBase64 } from "@/lib/imagegen";
import { composeImage } from "@/lib/compose";
import { savePost, getRecentArtists, loadPosts } from "@/lib/store";
import { createMediaContainer, publishMediaContainer, checkContainerStatus } from "@/lib/instagram";
import { GeneratedPost } from "@/types";
import crypto from "crypto";

export const maxDuration = 300;

export async function GET(request: Request) {
  // Verify the request comes from Vercel Cron or is authorized
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];

  try {
    log.push("Starting content generation pipeline...");

    const usedArtists = await getRecentArtists(20);
    const content = await generateStoryContent(usedArtists);
    log.push(`Generated story for: ${content.artist} — "${content.title}"`);

    const post: GeneratedPost = {
      id: crypto.randomUUID(),
      content,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await savePost(post);

    // Generate image
    const imageUrl = await generateImage(content.imagePrompt);
    const imageBase64 = await fetchImageAsBase64(imageUrl);
    post.imageUrl = imageUrl;
    log.push("Image generated from DALL-E");

    // Compose with text overlay
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");
    post.status = "image_ready";
    await savePost(post);
    log.push("Image composed with text overlay");

    // Post to Instagram
    const hashtags = content.hashtags.map((h) => `#${h}`).join(" ");
    const caption = `${content.caption}\n\n${hashtags}`;
    const containerId = await createMediaContainer(imageUrl, caption);
    post.instagramMediaId = containerId;

    // Poll for readiness
    let status = "IN_PROGRESS";
    let attempts = 0;
    while (status === "IN_PROGRESS" && attempts < 15) {
      await new Promise((r) => setTimeout(r, 3000));
      status = await checkContainerStatus(containerId);
      attempts++;
    }
    if (status !== "FINISHED") throw new Error(`Container status: ${status}`);

    const mediaId = await publishMediaContainer(containerId);
    post.instagramPostId = mediaId;
    post.status = "posted";
    post.postedAt = new Date().toISOString();
    await savePost(post);
    log.push(`Posted to Instagram — media ID: ${mediaId}`);

    return NextResponse.json({ success: true, log, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`ERROR: ${message}`);
    console.error("[cron] Pipeline failed:", message);
    return NextResponse.json({ success: false, log, error: message }, { status: 500 });
  }
}
