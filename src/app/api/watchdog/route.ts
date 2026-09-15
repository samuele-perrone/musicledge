/**
 * Watchdog cron — runs ~1 hour after each posting slot (09:30 and 12:30 UTC).
 * Checks if the last post is stale and auto-retries the cron if so.
 *
 * STALE_MS must be wider than the gap between a posting slot and the watchdog
 * that follows it, but narrower than the gap back to the previous slot, so a
 * missed run is caught without firing on a healthy schedule.
 */
import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { loadPosts } from "@/lib/store";

export const maxDuration = 310;

const STALE_MS = 3 * 60 * 60 * 1000; // 3 hours

async function runWatchdog() {
  const posts = await loadPosts();
  const lastPost = posts[0];
  const ageMs = lastPost
    ? Date.now() - new Date(lastPost.createdAt).getTime()
    : Infinity;
  const ageMinutes = Math.round(ageMs / 60_000);

  if (ageMs < STALE_MS) {
    console.log(`[watchdog] healthy — last post ${ageMinutes}m ago`);
    return NextResponse.json({ healthy: true, ageMinutes });
  }

  console.log(`[watchdog] stale — last post ${ageMinutes}m ago, triggering cron retry`);

  const baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "musicledge.vercel.app"}`;
  let result: unknown;
  try {
    // GET with the cron secret, the same path Vercel's scheduler uses. This used
    // to POST with no credentials, which only worked because POST was open.
    const res = await fetch(`${baseUrl}/api/cron`, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    result = await res.json();
    console.log(`[watchdog] retry result:`, JSON.stringify(result));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[watchdog] retry failed:`, msg);
    result = { error: msg };
  }

  return NextResponse.json({ healthy: false, ageMinutes, retried: true, result });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runWatchdog();
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runWatchdog();
}
