/**
 * Facebook Graph API — Page photo post
 *
 * Setup:
 * 1. You likely already have a Facebook Page linked for Instagram
 * 2. Get your Page Access Token (long-lived):
 *    GET https://graph.facebook.com/v21.0/me/accounts?access_token={USER_TOKEN}
 *    → copy access_token for your page
 * 3. Get your Page ID from the same response (or Page → About → Page ID)
 * Env vars: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 */

const BASE = "https://graph.facebook.com/v21.0";

export async function postFacebookPhoto(
  imageUrl: string,
  caption: string
): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) throw new Error("FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN not set");

  const body = new URLSearchParams({
    url: imageUrl,
    caption,
    access_token: token,
  });

  const res = await fetch(`${BASE}/${pageId}/photos`, {
    method: "POST",
    body,
  });

  const data = await res.json();
  if (data.error) throw new Error(`Facebook API: ${data.error.message}`);
  return data.id as string; // photo post ID
}
