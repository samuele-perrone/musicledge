/**
 * Music metadata API helpers.
 *
 * iTunes Search API — free, no auth, returns album art + Apple Music direct links.
 * Spotify Web API   — requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET env vars.
 *                     Falls back to a search URL if creds are absent.
 */

export interface AlbumInfo {
  artworkUrl: string;     // high-res JPEG from iTunes CDN (up to 3000×3000)
  appleMusicUrl: string;  // direct Apple Music album page
  albumName: string;      // canonical album name from iTunes
  artistName: string;     // canonical artist name from iTunes
  spotifyUrl?: string;    // direct Spotify album URL (if Spotify creds available)
}

// ─── iTunes ──────────────────────────────────────────────────────────────────

export async function searchAlbum(
  artist: string,
  albumName: string
): Promise<AlbumInfo | null> {
  try {
    const query = encodeURIComponent(`${artist} ${albumName}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${query}&entity=album&limit=5`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const results: Record<string, string>[] = data.results ?? [];
    if (results.length === 0) return null;

    // Require artist name match, then prefer closest album name match
    const artistLower = artist.toLowerCase();
    const albumLower = albumName.toLowerCase();
    const artistMatches = results.filter((r) =>
      r.artistName?.toLowerCase().includes(artistLower) ||
      artistLower.includes(r.artistName?.toLowerCase() ?? "____")
    );
    const pool = artistMatches.length > 0 ? artistMatches : [];
    if (pool.length === 0) return null; // don't fall back to wrong artist
    const best =
      pool.find((r) => r.collectionName?.toLowerCase().includes(albumLower.split(" ")[0])) ??
      pool[0];

    // iTunes artwork comes as 100×100; replace with 3000×3000
    const artworkUrl = best.artworkUrl100?.replace("100x100bb", "3000x3000bb");
    if (!artworkUrl || !best.collectionViewUrl) return null;

    const info: AlbumInfo = {
      artworkUrl,
      appleMusicUrl: best.collectionViewUrl,
      albumName: best.collectionName,
      artistName: best.artistName,
    };

    info.spotifyUrl = (await getSpotifyAlbumUrl(artist, albumName)) ?? undefined;

    return info;
  } catch {
    return null;
  }
}

// ─── Artist photos ───────────────────────────────────────────────────────────

export interface ArtistInfo {
  imageUrl: string;          // high-res artist press photo
  isArtistPhoto: boolean;    // true = real press photo (Deezer/Spotify); false = iTunes album art fallback
  spotifyUrl?: string;       // direct Spotify artist page
  appleMusicUrl?: string;    // direct Apple Music artist page
  artistName: string;
}

export async function searchArtistInfo(artist: string): Promise<ArtistInfo | null> {
  // Run iTunes, Spotify (for URL), and Deezer (for photo) lookups in parallel
  const [itunesResult, spotifyResult, deezerResult] = await Promise.allSettled([
    searchArtistItunes(artist),
    searchArtistSpotify(artist),
    searchArtistDeezer(artist),
  ]);

  const itunes = itunesResult.status === "fulfilled" ? itunesResult.value : null;
  const spotify = spotifyResult.status === "fulfilled" ? spotifyResult.value : null;
  const deezer  = deezerResult.status  === "fulfilled" ? deezerResult.value  : null;

  // Prefer Deezer artist photo, then Spotify artist photo
  const photoUrl = deezer?.imageUrl ?? spotify?.imageUrl ?? null;
  if (photoUrl) {
    return {
      imageUrl: photoUrl,
      isArtistPhoto: true,
      spotifyUrl: spotify?.spotifyUrl,
      appleMusicUrl: itunes?.appleMusicUrl,
      artistName: deezer?.artistName ?? spotify?.artistName ?? itunes?.artistName ?? artist,
    };
  }

  // No real artist photo — fall back to iTunes album art
  try {
    const query = encodeURIComponent(artist);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${query}&entity=album&limit=10`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const data = await res.json();
      const results: Record<string, string>[] = data.results ?? [];
      const match = results.find((r) =>
        r.artistName?.toLowerCase().includes(artist.toLowerCase()) ||
        artist.toLowerCase().includes(r.artistName?.toLowerCase() ?? "____")
      );
      if (match?.artworkUrl100) {
        const artworkUrl = match.artworkUrl100.replace("100x100bb", "3000x3000bb");
        return {
          imageUrl: artworkUrl,
          isArtistPhoto: false,
          spotifyUrl: spotify?.spotifyUrl,
          appleMusicUrl: itunes?.appleMusicUrl ?? match.collectionViewUrl,
          artistName: match.artistName ?? artist,
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

async function searchArtistItunes(
  artist: string
): Promise<{ appleMusicUrl: string; artistName: string } | null> {
  try {
    const query = encodeURIComponent(artist);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${query}&entity=musicArtist&limit=3`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results: Record<string, string>[] = data.results ?? [];
    const match =
      results.find((r) =>
        r.artistName?.toLowerCase() === artist.toLowerCase()
      ) ?? results[0];
    if (!match?.artistLinkUrl) return null;
    return { appleMusicUrl: match.artistLinkUrl, artistName: match.artistName };
  } catch {
    return null;
  }
}

async function searchArtistDeezer(
  artist: string
): Promise<{ imageUrl: string; artistName: string } | null> {
  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=5`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items: Record<string, unknown>[] = data.data ?? [];
    const match =
      items.find((a) => (a.name as string)?.toLowerCase() === artist.toLowerCase()) ??
      items[0];
    if (!match) return null;
    const imageUrl = (match.picture_xl ?? match.picture_big ?? match.picture_medium) as string | undefined;
    if (!imageUrl) return null;
    return { imageUrl, artistName: match.name as string };
  } catch {
    return null;
  }
}

async function searchArtistSpotify(
  artist: string
): Promise<{ imageUrl: string; spotifyUrl: string; artistName: string } | null> {
  try {
    const token = await getSpotifyToken();
    console.log(`[spotify] token=${token ? "ok" : "FAILED"}`);
    if (!token) return null;
    // Try field-filtered search first, fall back to plain query
    const trySearch = async (q: string) => {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=5`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
      );
      console.log(`[spotify] search "${q}" → ${res.status}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.artists?.items ?? [];
    };
    let items = await trySearch(`artist:${artist}`);
    if (items.length === 0) items = await trySearch(artist);
    const match =
      items.find(
        (a: Record<string, unknown>) =>
          (a.name as string)?.toLowerCase() === artist.toLowerCase()
      ) ?? items[0];
    console.log(`[spotify] match=${match?.name ?? "none"}, images=${match?.images?.length ?? 0}`);
    if (!match) return null;
    // Pick the largest image
    const images: { url: string; width: number }[] = match.images ?? [];
    images.sort((a: { width: number }, b: { width: number }) => b.width - a.width);
    const imageUrl = images[0]?.url;
    if (!imageUrl) return null;
    return {
      imageUrl,
      spotifyUrl: match.external_urls?.spotify,
      artistName: match.name,
    };
  } catch (e) {
    console.log(`[spotify] exception: ${e}`);
    return null;
  }
}

/**
 * Fetches up to `count` additional album artwork images for an artist from iTunes.
 * Returns them as raw Buffers for use as karaoke reel slide backgrounds.
 */
export async function searchAdditionalImages(
  artist: string,
  count: number
): Promise<Buffer[]> {
  try {
    const query = encodeURIComponent(artist);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${query}&entity=album&limit=25`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const results: Record<string, string>[] = data.results ?? [];
    const artistLower = artist.toLowerCase();
    const seen = new Set<string>();
    const urls: string[] = [];

    for (const r of results) {
      const rArtist = (r.artistName ?? "").toLowerCase();
      if (!rArtist.includes(artistLower) && !artistLower.includes(rArtist)) continue;
      const url = r.artworkUrl100?.replace("100x100bb", "600x600bb");
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= count) break;
    }

    const fetched = await Promise.allSettled(
      urls.map(async (url) => {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      })
    );

    return fetched
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<Buffer>).value);
  } catch {
    return [];
  }
}

export async function fetchImageAsBase64FromUrl(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

export async function fetchAlbumArtAsBase64(artworkUrl: string): Promise<string> {
  const res = await fetch(artworkUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Failed to fetch album art: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ─── Spotify ─────────────────────────────────────────────────────────────────

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.access_token as string) ?? null;
  } catch {
    return null;
  }
}

async function getSpotifyAlbumUrl(
  artist: string,
  albumName: string
): Promise<string | null> {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;

    const query = encodeURIComponent(`album:${albumName} artist:${artist}`);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=album&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.albums?.items?.[0]?.external_urls?.spotify as string) ?? null;
  } catch {
    return null;
  }
}
