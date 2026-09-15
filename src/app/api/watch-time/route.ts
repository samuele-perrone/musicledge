/**
 * Retention across the published catalogue.
 *
 * The first measured post read 4.9s average watch on a ~24s reel. One post is a
 * signal, not a conclusion, and the answer decides what the project works on
 * next — so this samples the back catalogue directly from the Graph API rather
 * than waiting for the cron to fill metrics in two posts a day.
 *
 * Read-only. Publishes nothing, writes nothing.
 */
import { NextResponse } from "next/server";
import { getUserAccessToken } from "@/lib/meta";
import { fetchMediaInsights } from "@/lib/insights";

export const maxDuration = 300;

const BASE = "https://graph.facebook.com/v21.0";

interface Row {
  id: string;
  timestamp: string;
  watchSeconds: number;
  views: number;
  reach: number;
  saved: number;
  shares: number;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export async function GET(request: Request) {
  try {
    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 60), 120);
    const token = await getUserAccessToken();
    const igId = process.env.INSTAGRAM_ACCOUNT_ID;
    if (!igId) return NextResponse.json({ error: "INSTAGRAM_ACCOUNT_ID not set" }, { status: 500 });

    // Page through recent media until we have enough reels.
    const media: { id: string; timestamp: string; media_product_type?: string }[] = [];
    let url = `${BASE}/${igId}/media?fields=id,timestamp,media_product_type&limit=50&access_token=${token}`;
    while (media.length < limit) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json = await res.json();
      if (json.error) break;
      media.push(...(json.data ?? []));
      const next = json.paging?.next;
      if (!next) break;
      url = next;
    }
    const reels = media.filter((m) => m.media_product_type === "REELS").slice(0, limit);

    // Insights are one call per post; batch so a 60-post sample stays inside the limit.
    const rows: Row[] = [];
    for (let i = 0; i < reels.length; i += 8) {
      const batch = reels.slice(i, i + 8);
      const got = await Promise.allSettled(batch.map((m) => fetchMediaInsights(m.id)));
      got.forEach((g, j) => {
        if (g.status === "fulfilled" && g.value) {
          rows.push({
            id: batch[j].id,
            timestamp: batch[j].timestamp,
            watchSeconds: g.value.avgWatchMs / 1000,
            views: g.value.views,
            reach: g.value.reach,
            saved: g.value.saved,
            shares: g.value.shares,
          });
        }
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No insights returned — check the token scope." }, { status: 500 });
    }

    const watch = rows.map((r) => r.watchSeconds);
    const buckets = [
      ["under 3s", watch.filter((w) => w < 3).length],
      ["3-5s", watch.filter((w) => w >= 3 && w < 5).length],
      ["5-8s", watch.filter((w) => w >= 5 && w < 8).length],
      ["8-12s", watch.filter((w) => w >= 8 && w < 12).length],
      ["12s+", watch.filter((w) => w >= 12).length],
    ] as [string, number][];

    // Does staying longer actually earn reach? Compares the top and bottom
    // retention thirds rather than asserting a correlation coefficient.
    const byWatch = [...rows].sort((a, b) => b.watchSeconds - a.watchSeconds);
    const third = Math.max(1, Math.floor(byWatch.length / 3));
    const top = byWatch.slice(0, third);
    const bottom = byWatch.slice(-third);

    // Roughly: intro 3s + two slides + follow frame.
    const APPROX_REEL_SECONDS = 24;

    return NextResponse.json({
      sampled: rows.length,
      oldest: rows.at(-1)?.timestamp,
      newest: rows[0]?.timestamp,
      approxReelLengthSeconds: APPROX_REEL_SECONDS,
      avgWatchSeconds: {
        mean: r1(mean(watch)),
        median: r1(median(watch)),
        min: r1(Math.min(...watch)),
        max: r1(Math.max(...watch)),
      },
      percentOfReelWatched: {
        mean: r1((mean(watch) / APPROX_REEL_SECONDS) * 100),
        median: r1((median(watch) / APPROX_REEL_SECONDS) * 100),
      },
      distribution: Object.fromEntries(buckets),
      retentionVsReach: {
        topThird: { avgWatch: r1(mean(top.map((r) => r.watchSeconds))), avgViews: Math.round(mean(top.map((r) => r.views))) },
        bottomThird: { avgWatch: r1(mean(bottom.map((r) => r.watchSeconds))), avgViews: Math.round(mean(bottom.map((r) => r.views))) },
      },
      engagement: {
        totalSaves: rows.reduce((a, r) => a + r.saved, 0),
        totalShares: rows.reduce((a, r) => a + r.shares, 0),
        postsWithAnySave: rows.filter((r) => r.saved > 0).length,
        postsWithAnyShare: rows.filter((r) => r.shares > 0).length,
      },
      bestFive: byWatch.slice(0, 5).map((r) => ({ watch: r1(r.watchSeconds), views: r.views, saved: r.saved, at: r.timestamp })),
      worstFive: byWatch.slice(-5).map((r) => ({ watch: r1(r.watchSeconds), views: r.views, saved: r.saved, at: r.timestamp })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
