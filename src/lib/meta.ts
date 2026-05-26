/**
 * Shared Meta (Facebook/Instagram) token helper.
 *
 * Stores a long-lived user token (FACEBOOK_USER_TOKEN, valid ~60 days) in
 * Upstash Redis and auto-refreshes it when it has fewer than 7 days left.
 * Refresh requires FACEBOOK_APP_ID + FACEBOOK_APP_SECRET in env vars.
 *
 * If the token is completely invalid (e.g. user logged out), throws a clear
 * error — manual re-authentication is required in that case.
 */

import { getStoredMetaToken, setStoredMetaToken } from "./store";

const BASE = "https://graph.facebook.com/v21.0";
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // refresh if < 7 days left

interface TokenInfo {
  isValid: boolean;
  expiresAt: number | null; // unix seconds, null = never expires (page token)
}

async function debugToken(token: string): Promise<TokenInfo> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return { isValid: true, expiresAt: null };

  const res = await fetch(
    `${BASE}/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`,
    { signal: AbortSignal.timeout(8000) }
  );
  const data = await res.json() as { data?: { is_valid: boolean; expires_at?: number } };
  if (!data.data) return { isValid: false, expiresAt: null };
  return {
    isValid: data.data.is_valid,
    expiresAt: data.data.expires_at ?? null,
  };
}

async function exchangeForLongLivedToken(currentToken: string): Promise<string | null> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return null;

  const res = await fetch(
    `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`,
    { signal: AbortSignal.timeout(8000) }
  );
  const data = await res.json() as { access_token?: string; error?: { message: string } };
  if (data.error || !data.access_token) return null;
  return data.access_token;
}

/**
 * Returns a valid long-lived user token, refreshing it automatically if it
 * is within 7 days of expiry. Throws if the token is completely invalid.
 */
export async function getUserAccessToken(): Promise<string> {
  // 1. Try Redis-cached token first
  const stored = await getStoredMetaToken().catch(() => null);
  const nowMs = Date.now();

  if (stored) {
    const expiresMs = stored.expiresAt * 1000;
    if (expiresMs - nowMs > REFRESH_THRESHOLD_MS) {
      // Still fresh — use as-is
      return stored.token;
    }
    // Expiring soon — fall through to refresh using the stored token
    const refreshed = await exchangeForLongLivedToken(stored.token);
    if (refreshed) {
      const { expiresAt } = await debugToken(refreshed).catch(() => ({ expiresAt: null, isValid: true }));
      await setStoredMetaToken(refreshed, expiresAt ?? Math.floor((nowMs + 60 * 24 * 60 * 60 * 1000) / 1000));
      process.env.FACEBOOK_USER_TOKEN = refreshed;
      console.log("[meta] Token refreshed and stored in Redis");
      return refreshed;
    }
  }

  // 2. Fall back to env var token
  const envToken = process.env.FACEBOOK_USER_TOKEN ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!envToken) throw new Error("No Meta access token configured. Set FACEBOOK_USER_TOKEN.");

  // 3. Check and optionally refresh the env token
  const info = await debugToken(envToken).catch(() => ({ isValid: true, expiresAt: null } as TokenInfo));

  if (!info.isValid) {
    throw new Error(
      "Meta access token is invalid (user may have logged out). " +
      "Re-authenticate via the dashboard and update FACEBOOK_USER_TOKEN."
    );
  }

  const expiresMs = info.expiresAt ? info.expiresAt * 1000 : null;
  const needsRefresh = expiresMs !== null && expiresMs - nowMs < REFRESH_THRESHOLD_MS;

  if (needsRefresh) {
    const refreshed = await exchangeForLongLivedToken(envToken);
    if (refreshed) {
      const newExpiry = info.expiresAt
        ? Math.floor((nowMs + 60 * 24 * 60 * 60 * 1000) / 1000)
        : Math.floor((nowMs + 60 * 24 * 60 * 60 * 1000) / 1000);
      await setStoredMetaToken(refreshed, newExpiry);
      process.env.FACEBOOK_USER_TOKEN = refreshed;
      console.log("[meta] Token refreshed from env var and stored in Redis");
      return refreshed;
    }
  }

  // Token is valid and not expiring soon — cache it in Redis for future runs
  if (info.expiresAt) {
    await setStoredMetaToken(envToken, info.expiresAt).catch(() => {});
  }

  return envToken;
}

/**
 * Exchanges the user token for a Page Access Token — required for Facebook
 * photo uploads and feed posts, which must be made as the Page itself.
 */
export async function getPageAccessToken(): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const userToken = await getUserAccessToken();

  if (pageId) {
    try {
      const res = await fetch(
        `${BASE}/${pageId}?fields=access_token&access_token=${userToken}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json() as { access_token?: string; error?: unknown };
      if (data.access_token && !data.error) {
        return data.access_token;
      }
    } catch {
      // Fall through to user token
    }
  }

  return userToken;
}
