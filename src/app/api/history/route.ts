import { NextResponse } from "next/server";
import { loadPosts } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const posts = await loadPosts();
  return NextResponse.json({ posts: posts.slice(0, limit) });
}
