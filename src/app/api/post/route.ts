import { NextResponse } from "next/server";
import { getPost, savePost } from "@/lib/store";
import { Platform } from "@/types";
import {
  createMediaContainer,
  publishMediaContainer,
  checkContainerStatus,
  publishInstagramStory,
} from "@/lib/instagram";
import { postTikTokPhoto } from "@/lib/tiktok";
import { createShortsVideo } from "@/lib/video";
import { uploadYouTubeShort } from "@/lib/youtube";
import { postFacebookPhoto } from "@/lib/facebook";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { postId, platforms } = await request.json() as {
      postId: string;
      platforms?: Platform[];
    };

    if (!postId) {
      return NextResponse.json({ success: false, error: "postId required" }, { status: 400 });
    }

    const post = await getPost(postId);
    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }
    if (post.status !== "image_ready") {
      return NextResponse.json(
        { success: false, error: `Post status is '${post.status}', must be 'image_ready'` },
        { status: 400 }
      );
    }
    if (!post.blobUrl) {
      return NextResponse.json({ success: false, error: "No blob URL on post" }, { status: 400 });
    }

    const targets: Platform[] = platforms ?? ["instagram", "facebook"];
    const hashtags = post.content.hashtags.map((h) => `#${h}`).join(" ");
    const affiliateLine = post.affiliateUrl ? `\n\n🎵 Find this album: ${post.affiliateUrl}` : "";
    const caption = `${post.content.caption}\n\n${hashtags}${affiliateLine}`;
    const errors: string[] = [];

    // ── Instagram ──────────────────────────────────────────────────────────
    if (targets.includes("instagram")) {
      try {
        const containerId = await createMediaContainer(post.blobUrl, caption);
        let status = "IN_PROGRESS";
        let attempts = 0;
        while (status === "IN_PROGRESS" && attempts < 10) {
          await new Promise((r) => setTimeout(r, 3000));
          status = await checkContainerStatus(containerId);
          attempts++;
        }
        if (status !== "FINISHED") throw new Error(`Container not ready: ${status}`);
        const mediaId = await publishMediaContainer(containerId);
        post.platforms.instagram = {
          status: "posted",
          postId: mediaId,
          postedAt: new Date().toISOString(),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        post.platforms.instagram = { status: "failed", error: msg };
        errors.push(`Instagram: ${msg}`);
      }
    }

    // ── Instagram Story ────────────────────────────────────────────────────
    if (targets.includes("instagram") && post.storyBlobUrl) {
      try {
        await publishInstagramStory(post.storyBlobUrl);
      } catch (e) {
        // Non-fatal — story failure doesn't affect post status
        errors.push(`Instagram Story: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── TikTok ─────────────────────────────────────────────────────────────
    if (targets.includes("tiktok")) {
      try {
        const publishId = await postTikTokPhoto([post.blobUrl], caption);
        post.platforms.tiktok = {
          status: "posted",
          postId: publishId,
          postedAt: new Date().toISOString(),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        post.platforms.tiktok = { status: "failed", error: msg };
        errors.push(`TikTok: ${msg}`);
      }
    }

    // ── YouTube Shorts ─────────────────────────────────────────────────────
    if (targets.includes("youtube")) {
      try {
        if (!post.imageBase64) throw new Error("No image data for video creation");
        const imageBuffer = Buffer.from(post.imageBase64, "base64");
        const videoBuffer = await createShortsVideo(imageBuffer);
        const videoId = await uploadYouTubeShort(
          videoBuffer,
          post.content.title,
          caption,
          post.content.hashtags
        );
        post.platforms.youtube = {
          status: "posted",
          postId: videoId,
          postedAt: new Date().toISOString(),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        post.platforms.youtube = { status: "failed", error: msg };
        errors.push(`YouTube: ${msg}`);
      }
    }

    // ── Facebook ───────────────────────────────────────────────────────────
    if (targets.includes("facebook")) {
      try {
        const photoId = await postFacebookPhoto(post.blobUrl, caption);
        post.platforms.facebook = {
          status: "posted",
          postId: photoId,
          postedAt: new Date().toISOString(),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        post.platforms.facebook = { status: "failed", error: msg };
        errors.push(`Facebook: ${msg}`);
      }
    }

    // Mark overall status
    const allPosted = targets.every((p) => post.platforms[p].status === "posted");
    const anyPosted = targets.some((p) => post.platforms[p].status === "posted");
    post.status = allPosted ? "posted" : anyPosted ? "posted" : "failed";

    await savePost(post);

    return NextResponse.json({
      success: errors.length === 0,
      errors,
      post,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
