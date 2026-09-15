/**
 * Post store backed by Upstash Redis.
 * Falls back to in-memory for local dev if env vars are missing.
 *
 * Posts live one per key, ordered by a sorted set of ids scored on createdAt.
 * The previous layout kept every post in a single JSON array, so each save read
 * and rewrote the whole history — by 455 posts that was megabytes per cron run,
 * three runs deep, and it grew without bound until it would have breached
 * Upstash's request size limit. The read-modify-write also raced: a cron run and
 * a dashboard action overlapping meant one silently discarded the other's post.
 */
import type { Redis as UpstashRedis } from "@upstash/redis";
import { GeneratedPost } from "@/types";
import { fetchMediaInsights, scorePost } from "@/lib/insights";

const POSTS_KEY = "musicledge:posts";              // legacy array, kept as a backup
const INDEX_KEY = "musicledge:posts:index";        // sorted set: member = id, score = createdAt
const MIGRATED_KEY = "musicledge:posts:migrated";  // set only after a complete migration
const postKey = (id: string) => `musicledge:post:${id}`;

/** Retention cap. Comfortably above the 90-post window the dedup selector reads. */
const MAX_POSTS = 500;

// Type-only import so the client stays lazily required, but calls are still checked.
function getRedis(): UpstashRedis | null {
  // Support both naming conventions: Vercel KV marketplace (KV_REST_API_*) and manual Upstash vars
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require("@upstash/redis");
  return new Redis({ url, token }) as UpstashRedis;
}

// In-memory fallback for local dev without Redis
const memStore: GeneratedPost[] = [];

/** Sort key for a post. Unparseable timestamps sort oldest rather than polluting the recent window. */
function scoreOf(post: GeneratedPost): number {
  const t = Date.parse(post.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/** Large images are stripped before persisting — blobUrl is the durable reference. */
function strip(post: GeneratedPost): GeneratedPost {
  const { imageBase64: _omit, ...rest } = post;
  void _omit;
  return rest as GeneratedPost;
}

let migrated = false;

/**
 * Moves the legacy single-array key into per-post keys exactly once.
 *
 * Deliberately non-destructive: the old array is left in place as a backup, and
 * the completion marker is written last, so a run that dies midway simply repeats
 * on the next call. Every write is idempotent, which makes the retry safe.
 */
async function ensureMigrated(redis: UpstashRedis): Promise<void> {
  if (migrated) return;
  if (await redis.exists(MIGRATED_KEY)) { migrated = true; return; }

  const legacy = (await redis.get(POSTS_KEY)) as GeneratedPost[] | null;
  if (legacy?.length) {
    for (let i = 0; i < legacy.length; i += 50) {
      const pipe = redis.pipeline();
      for (const post of legacy.slice(i, i + 50)) {
        if (!post?.id) continue;
        pipe.set(postKey(post.id), strip(post));
        pipe.zadd(INDEX_KEY, { score: scoreOf(post), member: post.id });
      }
      await pipe.exec();
    }
  }
  await redis.set(MIGRATED_KEY, new Date().toISOString());
  migrated = true;
}

/** Newest first, capped at `limit`. */
export async function loadPosts(limit = MAX_POSTS): Promise<GeneratedPost[]> {
  const redis = getRedis();
  if (!redis) return memStore.slice(0, limit);
  await ensureMigrated(redis);

  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, limit - 1, { rev: true });
  if (!ids?.length) return [];

  const rows = await redis.mget<(GeneratedPost | null)[]>(ids.map(postKey));
  // A null row means the index outlived its post; skip rather than surfacing a hole.
  return (rows ?? []).filter((p): p is GeneratedPost => p != null);
}

export async function savePost(post: GeneratedPost): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    const idx = memStore.findIndex((p) => p.id === post.id);
    if (idx >= 0) memStore[idx] = post;
    else memStore.unshift(post);
    return;
  }
  await ensureMigrated(redis);

  // One post written, not the whole history. zadd is idempotent, so updating an
  // existing post refreshes its key without duplicating its index entry.
  const pipe = redis.pipeline();
  pipe.set(postKey(post.id), strip(post));
  pipe.zadd(INDEX_KEY, { score: scoreOf(post), member: post.id });
  await pipe.exec();

  // Drop anything past the retention cap, keys included, so nothing is orphaned.
  const overflow = await redis.zrange<string[]>(INDEX_KEY, 0, -(MAX_POSTS + 1));
  if (overflow?.length) {
    const cleanup = redis.pipeline();
    cleanup.del(...overflow.map(postKey));
    cleanup.zrem(INDEX_KEY, ...overflow);
    await cleanup.exec();
  }
}

export async function getPost(id: string): Promise<GeneratedPost | null> {
  const redis = getRedis();
  if (!redis) return memStore.find((p) => p.id === id) ?? null;
  await ensureMigrated(redis);
  return ((await redis.get(postKey(id))) as GeneratedPost | null) ?? null;
}

export async function deletePost(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    const idx = memStore.findIndex((p) => p.id === id);
    if (idx >= 0) memStore.splice(idx, 1);
    return;
  }
  await ensureMigrated(redis);
  const pipe = redis.pipeline();
  pipe.del(postKey(id));
  pipe.zrem(INDEX_KEY, id);
  await pipe.exec();
}

export async function getRecentArtists(limit = 20): Promise<string[]> {
  const posts = await loadPosts(limit);
  return posts.map((p) => p.content.artist);
}

export async function getLastPostedCategory(): Promise<string | null> {
  const posts = await loadPosts(50);
  const lastPosted = posts.find((p) => p.status === "posted");
  return lastPosted?.content?.category ?? null;
}

export async function getRecentPostSummaries(limit = 40): Promise<{ artist: string; title: string; category: string }[]> {
  const posts = await loadPosts(limit);
  return posts.map((p) => ({
    artist: p.content.artist,
    title: p.content.title,
    category: p.content.category,
  }));
}

/**
 * Refreshes metrics for recently published reels.
 *
 * Runs over a window rather than only new posts because engagement keeps moving
 * for days — a post measured an hour after publishing reads as a failure no
 * matter how it ends up. Bounded and concurrency-limited so it stays a cheap
 * tail on the cron rather than a job of its own.
 */
export async function refreshRecentMetrics(limit = 24): Promise<number> {
  const posts = await loadPosts(limit);
  const targets = posts.filter((p) => p.platforms?.reel?.status === "posted" && p.platforms.reel.postId);

  let updated = 0;
  for (let i = 0; i < targets.length; i += 6) {
    const batch = targets.slice(i, i + 6);
    const results = await Promise.allSettled(
      batch.map(async (post) => {
        const m = await fetchMediaInsights(post.platforms.reel!.postId!);
        if (!m) return false;
        await savePost({ ...post, metrics: m });
        return true;
      })
    );
    updated += results.filter((r) => r.status === "fulfilled" && r.value).length;
  }
  return updated;
}

/**
 * Best and worst measured posts, for the generation prompt.
 *
 * Only posts with enough reach to mean anything — a post seen by nine people
 * says nothing about the writing, and would otherwise dominate a rate-based
 * ranking through sheer smallness.
 */
export async function getPerformanceExtremes(
  count = 5,
  minReach = 40
): Promise<{ best: GeneratedPost[]; worst: GeneratedPost[] }> {
  const posts = await loadPosts(120);
  const measured = posts.filter((p) => p.metrics && p.metrics.reach >= minReach);
  if (measured.length < count * 2) return { best: [], worst: [] };

  const ranked = [...measured].sort((a, b) => scorePost(b.metrics!) - scorePost(a.metrics!));
  return { best: ranked.slice(0, count), worst: ranked.slice(-count).reverse() };
}

const META_TOKEN_KEY = "musicledge:meta_token";

export async function getStoredMetaToken(): Promise<{ token: string; expiresAt: number } | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get(META_TOKEN_KEY)) as { token: string; expiresAt: number } | null;
}

export async function setStoredMetaToken(token: string, expiresAt: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(META_TOKEN_KEY, { token, expiresAt });
}

export async function clearStoredMetaToken(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(META_TOKEN_KEY);
}
