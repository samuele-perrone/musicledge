/**
 * Per-post performance, and the scoring the generator learns from.
 *
 * The account published 456 posts before anything read a single metric back, so
 * every content decision was inference from looking at a grid. This closes that.
 *
 * Probed against the live API on 2026-09-15: reels expose likes, views, reach,
 * comments, saved, shares, total_interactions, ig_reels_avg_watch_time and
 * ig_reels_video_view_total_time. They do NOT expose `follows` or
 * `profile_visits` — those are account-level only, which is why the score below
 * cannot reward a post for winning a follower.
 */
import { getUserAccessToken } from "./meta";

const BASE = "https://graph.facebook.com/v21.0";

/** The metrics reels actually support. Anything else makes the whole request fail. */
const METRICS = [
  "views",
  "reach",
  "likes",
  "comments",
  "saved",
  "shares",
  "total_interactions",
  "ig_reels_avg_watch_time",
] as const;

export interface PostMetrics {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  totalInteractions: number;
  /** Mean watch time in milliseconds. */
  avgWatchMs: number;
  fetchedAt: string;
}

/** Reads one reel's insights. Returns null rather than throwing — this is never worth failing a run for. */
export async function fetchMediaInsights(mediaId: string): Promise<PostMetrics | null> {
  try {
    const token = await getUserAccessToken();
    const res = await fetch(
      `${BASE}/${mediaId}/insights?metric=${METRICS.join(",")}&access_token=${token}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const json = await res.json();
    if (json.error) {
      console.warn(`[insights] ${mediaId}: ${json.error.message}`);
      return null;
    }

    const byName = new Map<string, number>();
    for (const row of (json.data ?? []) as Record<string, unknown>[]) {
      const value =
        (row.values as { value?: number }[] | undefined)?.[0]?.value ??
        (row.total_value as { value?: number } | undefined)?.value;
      if (typeof value === "number") byName.set(row.name as string, value);
    }
    if (byName.size === 0) return null;

    return {
      views: byName.get("views") ?? 0,
      reach: byName.get("reach") ?? 0,
      likes: byName.get("likes") ?? 0,
      comments: byName.get("comments") ?? 0,
      saved: byName.get("saved") ?? 0,
      shares: byName.get("shares") ?? 0,
      totalInteractions: byName.get("total_interactions") ?? 0,
      avgWatchMs: byName.get("ig_reels_avg_watch_time") ?? 0,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn(`[insights] ${mediaId} threw: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * How good a post was, in one number.
 *
 * Deliberately NOT likes. Likes already run near 3% and have produced almost
 * nothing — 21,087 viewers became 44 profile visits — so optimising for them
 * would just make forgettable content faster.
 *
 * Retention leads because it is the only metric with continuous variation:
 * saves and shares are so rare on this account (the best post of a month drew
 * 3 saves and 0 shares) that ranking on them alone leaves almost every post
 * tied at zero. Seconds watched separates posts that ranking cannot.
 *
 * Saves and shares are then worth a lot each, because they are the actions that
 * actually cost a viewer something, and reach-normalised so a post is not
 * rewarded merely for being handed more distribution.
 */
export function scorePost(m: PostMetrics): number {
  const retentionSeconds = m.avgWatchMs / 1000;
  const reach = Math.max(m.reach, 1);
  const actionRate = (m.saved + m.shares + m.comments * 0.5) / reach;
  return retentionSeconds + actionRate * 100;
}

/** One line per post for the generation prompt. Raw numbers, so the model can see the shape itself. */
export function describePerformance(
  entries: { title: string; artist: string; category: string; metrics: PostMetrics }[]
): string {
  return entries
    .map(
      (e) =>
        `- "${e.title}" (${e.artist}, ${e.category}): ` +
        `${(e.metrics.avgWatchMs / 1000).toFixed(1)}s avg watch, ` +
        `${e.metrics.views} views, ${e.metrics.saved} saves, ${e.metrics.shares} shares`
    )
    .join("\n");
}
