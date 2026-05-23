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
  const userToken = process.env.FACEBOOK_USER_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (userToken && pageId) {
    try {
      const res = await fetch(
        `${BASE}/${pageId}?fields=access_token&access_token=${userToken}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      if (data.access_token && !data.error) {
        return data.access_token as string;
      }
    } catch {
      // Fall through to static token
    }
  }

  // Backwards-compatible fallback
  const staticToken =
    process.env.INSTAGRAM_ACCESS_TOKEN ??
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!staticToken) throw new Error("No Meta access token configured. Set FACEBOOK_USER_TOKEN in environment variables.");
  return staticToken;
}
