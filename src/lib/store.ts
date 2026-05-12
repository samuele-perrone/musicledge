/**
 * Simple file-based store for post history.
 * In production, replace with a database (Neon Postgres, Upstash Redis, etc.)
 */
import fs from "fs/promises";
import path from "path";
import { GeneratedPost } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadPosts(): Promise<GeneratedPost[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(POSTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function savePost(post: GeneratedPost): Promise<void> {
  await ensureDir();
  const posts = await loadPosts();
  const idx = posts.findIndex((p) => p.id === post.id);
  if (idx >= 0) {
    posts[idx] = post;
  } else {
    posts.unshift(post);
  }
  await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
}

export async function getPost(id: string): Promise<GeneratedPost | null> {
  const posts = await loadPosts();
  return posts.find((p) => p.id === id) ?? null;
}

export async function getRecentArtists(limit = 20): Promise<string[]> {
  const posts = await loadPosts();
  return posts.slice(0, limit).map((p) => p.content.artist);
}
