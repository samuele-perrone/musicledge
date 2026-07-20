import { NextResponse } from "next/server";
import { getUserAccessToken } from "@/lib/meta";

export async function GET() {
  try {
    const token = await getUserAccessToken();
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    const [debugRes, permRes] = await Promise.all([
      appId && appSecret
        ? fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`)
        : Promise.resolve(null),
      fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`),
    ]);

    const debug = debugRes ? await debugRes.json() : null;
    const perms = await permRes.json();

    return NextResponse.json({
      tokenType: debug?.data?.type,
      isValid: debug?.data?.is_valid,
      expiresAt: debug?.data?.expires_at ? new Date(debug.data.expires_at * 1000).toISOString() : null,
      scopes: debug?.data?.scopes ?? [],
      permissions: perms?.data ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
