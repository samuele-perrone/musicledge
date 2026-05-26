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
  spotifyUrl?: string;       // direct Spotify artist page
  appleMusicUrl?: string;    // direct Apple Music artist page
  artistName: string;
}

export async function searchArtistInfo(artist: string): Promise<ArtistInfo | null> {
  // Run iTunes and Spotify lookups in parallel
  const [itunesResult, spotifyResult] = await Promise.allSettled([
    searchArtistItunes(artist),
    searchArtistSpotify(artist),
  ]);

  const itunes = itunesResult.status === "fulfilled" ? itunesResult.value : null;
  const spotify = spotifyResult.status === "fulfilled" ? spotifyResult.value : null;

  // Prefer Spotify artist photo; fall back to iTunes album art for this artist
  const imageUrl = spotify?.imageUrl ?? null;
  if (imageUrl) {
    return {
      imageUrl,
      spotifyUrl: spotify?.spotifyUrl,
      appleMusicUrl: itunes?.appleMusicUrl,
      artistName: spotify?.artistName ?? itunes?.artistName ?? artist,
    };
  }

  // Spotify image not available — try fetching album art from iTunes as fallback
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

async function searchArtistSpotify(
  artist: string
): Promise<{ imageUrl: string; spotifyUrl: string; artistName: string } | null> {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;
    // Try field-filtered search first, fall back to plain query
    const trySearch = async (q: string) => {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=5`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.artists?.items ?? [];
    };
    let items = await trySearch(`artist:${artist}`);
    if (items.length === 0) items = await trySearch(artist);
    // Prefer exact name match
    const match =
      items.find(
        (a: Record<string, unknown>) =>
          (a.name as string)?.toLowerCase() === artist.toLowerCase()
      ) ?? items[0];
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
  } catch {
    return null;
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
