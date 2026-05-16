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
    allowOverwrite: true,
  });
  return url;
}

/**
 * Upload a video buffer to Vercel Blob for a permanent public URL.
 * Instagram Reels require a publicly accessible MP4 URL.
 */
export async function uploadVideoToBlob(
  videoBuffer: Buffer,
  filename: string
): Promise<string> {
  const { url } = await put(filename, videoBuffer, {
    access: "public",
    contentType: "video/mp4",
    allowOverwrite: true,
  });
  return url;
}
