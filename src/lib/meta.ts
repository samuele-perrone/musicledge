/**
 * Shared Meta (Facebook/Instagram) token helper.
 *
 * Stores a long-lived user token (FACEBOOK_USER_TOKEN, valid ~60 days) and
 * exchanges it for a Page Access Token at runtime. Page tokens derived from a
 * long-lived user token are effectively permanent for the page, so this means
 * you only ever need to update FACEBOOK_USER_TOKEN once every 60 days — not
 * hunt for the page token manually.
 *
 * Falls back to INSTAGRAM_ACCESS_TOKEN / FACEBOOK_PAGE_ACCESS_TOKEN if
 * FACEBOOK_USER_TOKEN is not set (backwards compatible).
 */

const BASE = "https://graph.facebook.com/v21.0";

export async function getPageAccessToken(): Promise<string> {
  // Use the user token directly — it has instagram_content_publish scoped to
  // the Instagram account and works for both Instagram and Facebook API calls.
  const userToken = process.env.FACEBOOK_USER_TOKEN;
  if (userToken) return userToken;

  // Backwards-compatible fallback
  const staticToken =
    process.env.INSTAGRAM_ACCESS_TOKEN ??
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!staticToken) throw new Error("No Meta access token configured. Set FACEBOOK_USER_TOKEN in environment variables.");
  return staticToken;
}
