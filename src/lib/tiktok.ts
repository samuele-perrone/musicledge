/**
 * TikTok Content Posting API v2 — Photo Post
 *
 * Setup:
 * 1. Create a TikTok developer app at developers.tiktok.com
 * 2. Add "Content Posting API" product
 * 3. Complete OAuth2 to get user access token
 * Env vars: TIKTOK_ACCESS_TOKEN
 */

const BASE = "https://open.tiktokapis.com/v2";

export async function postTikTokPhoto(
  imageUrls: string[],
  caption: string
): Promise<string> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN not set");

  const res = await fetch(`${BASE}/post/publish/content/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_images: imageUrls,
        photo_cover_index: 0,
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
  });

  const data = await res.json();
  if (data.error?.code !== "ok") {
    throw new Error(`TikTok API error: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.data.publish_id as string;
}
