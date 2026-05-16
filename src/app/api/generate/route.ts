import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl } from "@/lib/claude";
import { generateImage, fetchImageAsBase64, ImageStyle } from "@/lib/imagegen";
import { composeImage, composeStory } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createShortsVideo, createReelVideo } from "@/lib/video";
import { createSubstackDraft } from "@/lib/substack";
import { savePost, getRecentArtists } from "@/lib/store";
import { GeneratedPost, defaultPlatforms, PostCategory } from "@/types";
import crypto from "crypto";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const forceArtist: string | undefined = body?.artist;
    const forceCategory: PostCategory | undefined = body?.category;
    const forceStyle: ImageStyle | undefined = body?.imageStyle;

    const usedArtists = await getRecentArtists(20);
    const content = await generateStoryContent(
      forceArtist ? [] : usedArtists,
      forceCategory
    );
    if (forceArtist) content.artist = forceArtist;

    // Build Amazon affiliate URL
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

    // Generate and compose image
    const imageBase64 = await generateImage(content.imagePrompt, forceStyle);
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");

    // Upload post image to Vercel Blob
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;

    // Compose and upload Story image
    const storyBuffer = await composeStory(composedBuffer, content);
    const storyBlobUrl = await uploadImageToBlob(storyBuffer, `posts/${post.id}-story.jpg`);
    post.storyBlobUrl = storyBlobUrl;

    // Generate and upload Reel video using story layout (amber gradient background)
    try {
      const reelBuffer = await createReelVideo(storyBuffer);
      const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel.mp4`);
      post.reelBlobUrl = reelBlobUrl;
    } catch (reelErr) {
      console.warn("[generate] Reel video creation failed:", reelErr);
    }

    post.status = "image_ready";
    await savePost(post);

    // Create Substack draft (non-fatal if it fails)
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
    } catch (substackErr) {
      console.warn("[generate] Substack draft failed:", substackErr);
    }

    return NextResponse.json({ success: true, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to generate a new post" });
}
