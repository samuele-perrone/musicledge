import { NextResponse } from "next/server";
import { getPost, savePost } from "@/lib/store";
import { createMediaContainer, publishMediaContainer, checkContainerStatus } from "@/lib/instagram";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { postId } = await request.json();
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
    if (!post.imageUrl) {
      return NextResponse.json({ success: false, error: "No image URL on post" }, { status: 400 });
    }

    // Build caption with hashtags
    const hashtags = post.content.hashtags.map((h) => `#${h}`).join(" ");
    const caption = `${post.content.caption}\n\n${hashtags}`;

    // Create IG media container
    const containerId = await createMediaContainer(post.imageUrl, caption);
    post.instagramMediaId = containerId;

    // Wait for container to be ready (poll up to 30s)
    let status = "IN_PROGRESS";
    let attempts = 0;
    while (status === "IN_PROGRESS" && attempts < 10) {
      await new Promise((r) => setTimeout(r, 3000));
      status = await checkContainerStatus(containerId);
      attempts++;
    }

    if (status !== "FINISHED") {
      throw new Error(`Container not ready after polling: ${status}`);
    }

    // Publish
    const mediaId = await publishMediaContainer(containerId);
    post.instagramPostId = mediaId;
    post.status = "posted";
    post.postedAt = new Date().toISOString();

    await savePost(post);

    return NextResponse.json({ success: true, mediaId, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
