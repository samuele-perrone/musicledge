import { NextResponse } from "next/server";
import { clearStoredMetaToken } from "@/lib/store";

// POST — clears the Redis-cached Meta token so the env var is picked up on next run
export async function POST() {
  await clearStoredMetaToken();
  return NextResponse.json({ success: true, message: "Meta token cache cleared" });
}
