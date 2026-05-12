import { put } from "@vercel/blob";

/**
 * Upload composed image to Vercel Blob for a permanent public URL.
 * Instagram and TikTok require publicly accessible image URLs.
 */
export async function uploadImageToBlob(
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  const { url } = await put(filename, imageBuffer, {
    access: "public",
    contentType: "image/jpeg",
  });
  return url;
}
