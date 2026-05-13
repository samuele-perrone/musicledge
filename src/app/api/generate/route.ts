import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl } from "@/lib/claude";
import { generateImage, fetchImageAsBase64 } from "@/lib/imagegen";
import { composeImage } from "@/lib/compose";
import { uploadImageToBlob } from "@/lib/blob";
import { createSubstackDraft } from "@/lib/substack";
import { savePost, getRecentArtists } from "@/lib/store";
import { GeneratedPost, defaultPlatforms } from "@/types";
import crypto from "crypto";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const forceArtist: string | undefined = body?.artist;

    const usedArtists = await getRecentArtists(20);
    const content = await generateStoryContent(forceArtist ? [] : usedArtists);
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
    const dalleUrl = await generateImage(content.imagePrompt);
    const imageBase64 = await fetchImageAsBase64(dalleUrl);
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");

    // Upload to Vercel Blob
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;
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
