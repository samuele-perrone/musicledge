import { NextResponse } from "next/server";
import { loadPosts, deletePost } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const posts = await loadPosts();
  const sorted = [...posts].sort((a, b) => {
    const aDate = Object.values(a.platforms ?? {}).map(p => p.postedAt).filter(Boolean).sort().at(-1) ?? a.createdAt;
    const bDate = Object.values(b.platforms ?? {}).map(p => p.postedAt).filter(Boolean).sort().at(-1) ?? b.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
  return NextResponse.json({ posts: sorted.slice(0, limit) });
}

export async function DELETE(request: Request) {
  const { id } = await request.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deletePost(id);
  return NextResponse.json({ success: true });
}
