/**
 * Post store backed by Upstash Redis.
 * Falls back to in-memory for local dev if env vars are missing.
 */
import { GeneratedPost } from "@/types";

const POSTS_KEY = "musicledge:posts";

function getRedis() {
  // Support both naming conventions: Vercel KV marketplace (KV_REST_API_*) and manual Upstash vars
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require("@upstash/redis");
  return new Redis({ url, token });
}

// In-memory fallback for local dev without Redis
const memStore: GeneratedPost[] = [];

export async function loadPosts(): Promise<GeneratedPost[]> {
  const redis = getRedis();
  if (!redis) return [...memStore];
  const posts = (await redis.get(POSTS_KEY)) as GeneratedPost[] | null;
  return posts ?? [];
}

export async function savePost(post: GeneratedPost): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    const idx = memStore.findIndex((p) => p.id === post.id);
    if (idx >= 0) memStore[idx] = post;
    else memStore.unshift(post);
    return;
  }
  // Strip imageBase64 before persisting — it's large (~500KB+) and would exceed
  // Upstash's free-tier request size limit. The blobUrl is the persistent image reference.
  const { imageBase64: _, ...postToStore } = post;
  const posts = await loadPosts();
  const idx = posts.findIndex((p) => p.id === postToStore.id);
  if (idx >= 0) posts[idx] = postToStore;
  else posts.unshift(postToStore);
  await redis.set(POSTS_KEY, posts);
}

export async function getPost(id: string): Promise<GeneratedPost | null> {
  const posts = await loadPosts();
  return posts.find((p) => p.id === id) ?? null;
}

export async function deletePost(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    const idx = memStore.findIndex((p) => p.id === id);
    if (idx >= 0) memStore.splice(idx, 1);
    return;
  }
  const posts = await loadPosts();
  const filtered = posts.filter((p) => p.id !== id);
  await redis.set(POSTS_KEY, filtered);
}

export async function getRecentArtists(limit = 20): Promise<string[]> {
  const posts = await loadPosts();
  return posts.slice(0, limit).map((p) => p.content.artist);
}

export async function getRecentPostSummaries(limit = 40): Promise<{ artist: string; title: string; category: string }[]> {
  const posts = await loadPosts();
  return posts.slice(0, limit).map((p) => ({
    artist: p.content.artist,
    title: p.content.title,
    category: p.content.category,
  }));
}
