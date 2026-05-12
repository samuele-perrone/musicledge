import { NextResponse } from "next/server";
import { generateStoryContent } from "@/lib/claude";
import { generateImage, fetchImageAsBase64 } from "@/lib/imagegen";
import { composeImage } from "@/lib/compose";
import { savePost, getRecentArtists } from "@/lib/store";
import { GeneratedPost } from "@/types";
import crypto from "crypto";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    // Optional: caller can pass a specific artist
    const body = await request.json().catch(() => ({}));
    const forceArtist: string | undefined = body?.artist;

    // Get recently used artists to avoid repeats
    const usedArtists = await getRecentArtists(20);

    // 1. Generate story with Claude
    const content = await generateStoryContent(
      forceArtist ? [] : usedArtists
    );
    if (forceArtist) content.artist = forceArtist;

    const post: GeneratedPost = {
      id: crypto.randomUUID(),
      content,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    await savePost(post);

    // 2. Generate image with DALL-E
    const imageUrl = await generateImage(content.imagePrompt);
    const imageBase64 = await fetchImageAsBase64(imageUrl);
    post.imageUrl = imageUrl;

    // 3. Compose final image with text overlay
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");
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
