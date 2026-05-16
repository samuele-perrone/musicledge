/**
 * Refreshes an unposted post: re-generates the AI image, re-composes
 * with the latest layout, re-uploads blobs, and updates the Substack draft.
 */
import { NextResponse } from "next/server";
import { generateImage, ImageStyle } from "@/lib/imagegen";
import { composeImage, composeStory } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createReelVideo } from "@/lib/video";
import { createSubstackDraft } from "@/lib/substack";
import { getPost, savePost } from "@/lib/store";
import { buildAffiliateUrl, buildRelatedLinks, buildRelatedLinksHtml } from "@/lib/claude";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { postId } = await request.json();
    if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });

    const post = await getPost(postId);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (post.status === "posted") return NextResponse.json({ error: "Post already published — cannot refresh" }, { status: 400 });

    const { content } = post;

    // Re-generate AI image from stored imagePrompt, then re-compose with latest layout.
    // Use a fresh filename suffix to bust the Vercel Blob CDN cache.
    const v = Date.now();
    const imageBase64 = await generateImage(content.imagePrompt, "random" as ImageStyle);
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");

    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}-v${v}.jpg`);
    post.blobUrl = blobUrl;

    const storyBuffer = await composeStory(composedBuffer, content);
    const storyBlobUrl = await uploadImageToBlob(storyBuffer, `posts/${post.id}-story-v${v}.jpg`);
    post.storyBlobUrl = storyBlobUrl;

    try {
      const reelBuffer = await createReelVideo(storyBuffer);
      const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel-v${v}.mp4`);
      post.reelBlobUrl = reelBlobUrl;
    } catch (e) {
      console.warn("[refresh] Reel generation failed:", e);
    }

    post.status = "image_ready";

    // Rebuild affiliate URL and related links, then update/create Substack draft
    const affiliateUrl = post.affiliateUrl ?? buildAffiliateUrl(content.amazonSearchTerms);
    post.affiliateUrl = affiliateUrl;

    const relatedLinks = buildRelatedLinks(content.artist, content.title);
    const newsletterHtmlWithLinks = content.newsletterHtml + "\n\n" + buildRelatedLinksHtml(relatedLinks, affiliateUrl);

    try {
      const { id, url } = await createSubstackDraft(
        content.newsletterTitle,
        content.title,
        newsletterHtmlWithLinks,
        affiliateUrl
      );
      post.substackDraftId = id;
      post.substackDraftUrl = url;
    } catch (e) {
      console.warn("[refresh] Substack draft failed:", e);
    }

    await savePost(post);

    return NextResponse.json({ success: true, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
