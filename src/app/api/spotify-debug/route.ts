/**
 * Read-only probe for the persistent Spotify 403.
 *
 * Production answers every search with 403 while the token endpoint succeeds.
 * The cause cannot be reproduced locally (the SPOTIFY_* values live only in
 * Vercel) and the old code discarded the response body, so this calls Spotify
 * from the same place the cron does and reports exactly what comes back.
 *
 * It also sends the same search twice, once with a User-Agent and once without,
 * because hosts that reject datacenter traffic usually key on a missing UA — if
 * the two differ, that is the answer.
 *
 * Reads only. Publishes nothing, writes nothing, and can be deleted once the
 * cause is known.
 */
import { NextResponse } from "next/server";

const UA = "Musicledge/1.0 (+https://musicledge.vercel.app)";

interface Probe {
  status: number | null;
  ok: boolean;
  body: string;
  error?: string;
}

async function probe(url: string, headers: Record<string, string>): Promise<Probe> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const body = (await res.text().catch(() => "")).slice(0, 500);
    return { status: res.status, ok: res.ok, body: body || "(empty body)" };
  } catch (e) {
    return { status: null, ok: false, body: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ verdict: "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set" }, { status: 500 });
  }

  // 1. Client-credentials token.
  let token: string | null = null;
  let tokenProbe: Probe;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    tokenProbe = { status: res.status, ok: res.ok, body: res.ok ? "(token received)" : text.slice(0, 500) };
    if (res.ok) token = JSON.parse(text).access_token ?? null;
  } catch (e) {
    tokenProbe = { status: null, ok: false, body: "", error: e instanceof Error ? e.message : String(e) };
  }

  if (!token) {
    return NextResponse.json({ verdict: "Token request itself failed — credentials or network.", token: tokenProbe });
  }

  // 2. The same search, with and without a User-Agent.
  const searchUrl = "https://api.spotify.com/v1/search?q=Slayer&type=artist&limit=1";
  const auth = { Authorization: `Bearer ${token}` };
  const [withUa, withoutUa] = await Promise.all([
    probe(searchUrl, { ...auth, "User-Agent": UA, Accept: "application/json" }),
    probe(searchUrl, auth),
  ]);

  // 3. A non-search endpoint, to tell an account-wide block from a search-only one.
  const albumProbe = await probe(
    "https://api.spotify.com/v1/albums/4LH4d3cOWNNsVw41Gqt2kv",
    { ...auth, "User-Agent": UA, Accept: "application/json" }
  );

  const verdict = withUa.ok
    ? "Search WORKS with a User-Agent. The missing UA was the cause."
    : withoutUa.ok
    ? "Search works only WITHOUT a User-Agent — unexpected; revert the UA header."
    : albumProbe.ok
    ? "Search is blocked but other endpoints work — a search-specific restriction on this app."
    : "Every API call is refused while the token succeeds — an app-level or IP-level block. See the bodies below.";

  return NextResponse.json({
    verdict,
    token: tokenProbe,
    search_withUserAgent: withUa,
    search_withoutUserAgent: withoutUa,
    album_endpoint: albumProbe,
  });
}
