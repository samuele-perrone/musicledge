/**
 * Authorisation for the side-effectful API routes.
 *
 * `POST /api/cron` and `POST /api/watchdog` were completely unauthenticated:
 * middleware waved `/api/cron` through, and only the GET path checked
 * CRON_SECRET. Anyone with the URL could make the bot generate and publish a
 * post on repeat — an LLM call, image fetches, an FFmpeg encode, a Blob upload
 * and an Instagram publish per request. That is a spam ban and an API bill.
 *
 * Two callers need in, so this accepts either:
 *  - the dashboard session cookie, which the browser sends on same-origin fetch
 *  - `Authorization: Bearer <CRON_SECRET>`, for server-to-server and curl
 *
 * Fails closed: with neither secret configured nothing is authorised, which
 * matches the dashboard, already unusable without AUTH_SECRET.
 */

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }

  const authSecret = process.env.AUTH_SECRET;
  if (authSecret && cookieValue(request, "ml_session") === authSecret) {
    return true;
  }

  return false;
}
