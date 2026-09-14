/**
 * Read-only diagnostic for the planned insights feedback loop.
 *
 * Two things must be true before that feature is worth building, and neither can
 * be settled from the documentation:
 *
 *  1. The token needs the `instagram_manage_insights` scope, which has to be added
 *     to the Meta app and the token regenerated.
 *  2. Several sources claim media insights require 1,000+ followers. This account
 *     has far fewer, and the docs do not say which metrics that limit covers.
 *
 * So this probes each metric individually against a real published reel and
 * reports exactly which ones come back, rather than guessing. Writes nothing.
 */
import { NextResponse } from "next/server";
import { getUserAccessToken } from "@/lib/meta";

const BASE = "https://graph.facebook.com/v21.0";

/** Metrics worth having for the loop. Probed one at a time — a single bad name fails a batch. */
const CANDIDATE_METRICS = [
  "views",
  "reach",
  "likes",
  "comments",
  "saved",
  "shares",
  "total_interactions",
  "profile_visits",
  "follows",
  "ig_reels_avg_watch_time",
  "ig_reels_video_view_total_time",
];

async function getJson(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return await res.json();
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export async function GET() {
  try {
    const token = await getUserAccessToken();
    const igId = process.env.INSTAGRAM_ACCOUNT_ID;
    if (!igId) return NextResponse.json({ error: "INSTAGRAM_ACCOUNT_ID not set" }, { status: 500 });

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    const [debug, account, media] = await Promise.all([
      appId && appSecret
        ? getJson(`${BASE}/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`)
        : Promise.resolve(null),
      getJson(`${BASE}/${igId}?fields=followers_count,media_count&access_token=${token}`),
      getJson(`${BASE}/${igId}/media?fields=id,media_type,media_product_type,timestamp&limit=5&access_token=${token}`),
    ]);

    const scopes: string[] = debug?.data?.scopes ?? [];
    const hasInsightsScope = scopes.includes("instagram_manage_insights");

    const reels = (media?.data ?? []).filter(
      (m: Record<string, string>) => m.media_product_type === "REELS"
    );
    const target = reels[0] ?? media?.data?.[0] ?? null;

    // Probe each metric separately so one unsupported name does not mask the rest.
    const metricResults: Record<string, { ok: boolean; value?: number; error?: string }> = {};
    if (target) {
      await Promise.all(
        CANDIDATE_METRICS.map(async (metric) => {
          const json = await getJson(
            `${BASE}/${target.id}/insights?metric=${metric}&access_token=${token}`
          );
          if (json?.error) {
            metricResults[metric] = { ok: false, error: json.error.message };
          } else {
            const v = json?.data?.[0]?.values?.[0]?.value ?? json?.data?.[0]?.total_value?.value;
            metricResults[metric] = { ok: true, value: typeof v === "number" ? v : undefined };
          }
        })
      );
    }

    const available = Object.entries(metricResults).filter(([, r]) => r.ok).map(([m]) => m);

    return NextResponse.json({
      verdict: !hasInsightsScope
        ? "BLOCKED — token is missing instagram_manage_insights. Add it in the Meta app, regenerate the token, update FACEBOOK_USER_TOKEN, then call /api/token-reset."
        : available.length === 0
        ? "BLOCKED — scope is present but no metric returned data. Likely the follower threshold."
        : `OK — ${available.length} metric(s) available. The feedback loop can be built on these.`,
      hasInsightsScope,
      scopes,
      followersCount: account?.followers_count ?? null,
      mediaCount: account?.media_count ?? null,
      probedMedia: target ? { id: target.id, type: target.media_product_type, timestamp: target.timestamp } : null,
      available,
      metricResults,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
