import { NextResponse } from "next/server";
import { getPost, savePost } from "@/lib/store";
import { Platform } from "@/types";
import { buildRelatedLinks, buildRelatedLinksCaption } from "@/lib/claude";
import {
  createMediaContainer,
  publishMediaContainer,
  checkContainerStatus,
  createReelContainer,
  publishInstagramStory,
  createCarouselChildContainer,
  createCarouselContainer,
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
    if (!post.blobUrl) {
      return NextResponse.json({ success: false, error: "No blob URL on post" }, { status: 400 });
    }

    const targets: Platform[] = platforms ?? ["instagram", "facebook"];
    const hashtags = post.content.hashtags.map((h) => `#${h}`).join(" ");
    const relatedLinks = buildRelatedLinks(post.content.artist, post.content.title);
    const linksBlock = buildRelatedLinksCaption(relatedLinks, post.affiliateUrl ?? "");
    const caption = `${post.content.caption}\n\n${hashtags}\n\n${linksBlock}`;
    const errors: string[] = [];

    // ── Instagram ──────────────────────────────────────────────────────────
    if (targets.includes("instagram")) {
      try {
        let containerId: string;
        if (post.carouselBlobUrls && post.carouselBlobUrls.length > 1) {
          const childIds = await Promise.all(
            post.carouselBlobUrls.map((url) => createCarouselChildContainer(url))
          );
          containerId = await createCarouselContainer(childIds, caption);
        } else {
          containerId = await createMediaContainer(post.blobUrl, caption);
        }
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

    // ── Instagram Reel ─────────────────────────────────────────────────────
    if (targets.includes("reel")) {
      try {
        if (!post.reelBlobUrl) throw new Error("No reel video URL on post — regenerate to create it");
        const containerId = await createReelContainer(post.reelBlobUrl, caption);
        let status = "IN_PROGRESS";
        let attempts = 0;
        while (status === "IN_PROGRESS" && attempts < 20) {
          await new Promise((r) => setTimeout(r, 5000));
          status = await checkContainerStatus(containerId);
          attempts++;
        }
        if (status !== "FINISHED") throw new Error(`Reel container not ready: ${status}`);
        const mediaId = await publishMediaContainer(containerId);
        post.platforms.reel = {
          status: "posted",
          postId: mediaId,
          postedAt: new Date().toISOString(),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        post.platforms.reel = { status: "failed", error: msg };
        errors.push(`Reel: ${msg}`);
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
