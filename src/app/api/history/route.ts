import { NextResponse } from "next/server";
import { loadPosts, deletePost } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const posts = await loadPosts();
  return NextResponse.json({ posts: posts.slice(0, limit) });
}

export async function DELETE(request: Request) {
  const { id } = await request.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deletePost(id);
  return NextResponse.json({ success: true });
}
