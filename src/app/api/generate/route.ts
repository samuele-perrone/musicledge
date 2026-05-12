import { NextResponse } from "next/server";
import { generateStoryContent } from "@/lib/claude";
import { generateImage, fetchImageAsBase64 } from "@/lib/imagegen";
import { composeImage } from "@/lib/compose";
import { uploadImageToBlob } from "@/lib/blob";
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

    const post: GeneratedPost = {
      id: crypto.randomUUID(),
      content,
      platforms: defaultPlatforms(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await savePost(post);

    // Generate image with DALL-E
    const dalleUrl = await generateImage(content.imagePrompt);
    const imageBase64 = await fetchImageAsBase64(dalleUrl);

    // Compose with text overlay
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");

    // Upload to Vercel Blob for permanent public URL
    const blobUrl = await uploadImageToBlob(
      composedBuffer,
      `posts/${post.id}.jpg`
    );
    post.blobUrl = blobUrl;
    post.status = "image_ready";

    await savePost(post);

    return NextResponse.json({ success: true, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to generate a new post" });
}
