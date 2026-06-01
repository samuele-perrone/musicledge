/**
 * Watchdog cron — runs every 12 hours.
 * Checks if the last post is stale (>5 hours old) and auto-retries the cron if so.
 */
import { NextResponse } from "next/server";
import { loadPosts } from "@/lib/store";

export const maxDuration = 310;

const STALE_MS = 5 * 60 * 60 * 1000; // 5 hours

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const res = await fetch(`${baseUrl}/api/cron`, { method: "POST" });
    result = await res.json();
    console.log(`[watchdog] retry result:`, JSON.stringify(result));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[watchdog] retry failed:`, msg);
    result = { error: msg };
  }

  return NextResponse.json({ healthy: false, ageMinutes, retried: true, result });
}
