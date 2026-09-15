import { NextResponse } from "next/server";
import { clearStoredMetaToken } from "@/lib/store";
import { isAuthorized } from "@/lib/auth";

// POST — clears the Redis-cached Meta token so the env var is picked up on next run.
// Authorised because repeatedly clearing it forces Meta token refetches.
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await clearStoredMetaToken();
  return NextResponse.json({ success: true, message: "Meta token cache cleared" });
}
