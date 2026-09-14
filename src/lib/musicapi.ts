/**
 * Music metadata API helpers.
 *
 * iTunes Search API — free, no auth, returns album art + Apple Music direct links.
 * Spotify Web API   — requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET env vars.
 *                     Falls back to a search URL if creds are absent.
 */

export interface AlbumInfo {
  artworkUrl: string;      // high-res sleeve JPEG (iTunes up to 3000×3000, Deezer 1800×1800)
  appleMusicUrl?: string;  // direct Apple Music album page — absent on Deezer results
  albumName: string;       // canonical album name from the provider
  artistName: string;      // canonical artist name from the provider
  spotifyUrl?: string;     // direct Spotify album URL (if Spotify creds available)
  source: "apple" | "deezer"; // which provider supplied the artwork, for the caption credit
}

// ─── Artist name matching ────────────────────────────────────────────────────

/** Folds accents, punctuation and ampersands so "R.E.M." and "Earth, Wind & Fire" compare cleanly. */
function normaliseArtistName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const withoutLeadingThe = (s: string) => s.replace(/^the/, "");

/** Normalises an album title: drops "(Deluxe Edition)" style suffixes and punctuation. */
function normaliseAlbumName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Ranks how well a release title matches the album we asked for. 0 means no match.
 *
 * Selection previously keyed on the album's first word, so "The Dark Side of the
 * Moon" matched on "the" and happily returned "The Wall" — a vinyl_art post would
 * then describe one sleeve while showing another.
 */
/**
 * True when a release is a variant whose sleeve differs from the studio album —
 * a single, EP, live record or instrumental cut. Markers present in the requested
 * title do not count, so asking for "Live at Leeds" still matches the live album.
 */
function isAlternateRelease(candidate: string | undefined, wanted: string): boolean {
  const c = (candidate ?? "").toLowerCase();
  const w = wanted.toLowerCase();
  const marker = (re: RegExp) => re.test(c) && !re.test(w);
  return (
    marker(/\s[-–—]\s(single|ep)\b/) ||
    marker(/\blive\b/) ||
    marker(/\binstrumental\b/) ||
    marker(/\bkaraoke\b/)
  );
}

function albumMatchScore(candidate: string | undefined, wanted: string): number {
  if (!candidate) return 0;
  const c = normaliseAlbumName(candidate);
  const w = normaliseAlbumName(wanted);
  if (!c || !w) return 0;
  if (c === w) return 3;
  if (c.startsWith(w) || w.startsWith(c)) return 2;
  if (c.includes(w)) return 1;
  return 0;
}

/**
 * True when a search result genuinely refers to the artist we asked for.
 *
 * Every provider here returns fuzzy, popularity-ranked results, so taking the
 * first hit means a search for one artist can quietly return another act's
 * photo or artwork. Matching is therefore exact after normalisation, with one
 * allowance: a credited variant that extends the name ("Bruce Springsteen &
 * The E Street Band"). The reverse is not allowed — "Queens" must not satisfy
 * a search for "Queens of the Stone Age".
 */
export function artistNameMatches(candidate: string | undefined, wanted: string): boolean {
  if (!candidate) return false;
  const c = normaliseArtistName(candidate);
  const w = normaliseArtistName(wanted);
  if (!c || !w) return false;
  if (c === w) return true;

  const cBare = withoutLeadingThe(c);
  const wBare = withoutLeadingThe(w);
  if (cBare === wBare) return true;

  // Long enough that a shared prefix cannot be coincidental.
  return wBare.length >= 5 && cBare.startsWith(wBare);
}

// ─── iTunes ──────────────────────────────────────────────────────────────────

/** Album artwork, preferring iTunes (higher resolution, carries the Apple Music link). */
export async function searchAlbum(
  artist: string,
  albumName: string
): Promise<AlbumInfo | null> {
  const itunes = await searchAlbumItunes(artist, albumName);
  if (itunes && !isAlternateRelease(itunes.albumName, albumName)) return itunes;

  // iTunes found nothing, or only a variant sleeve. Searching "Ace of Spades"
  // there returns singles and live cuts but never the album, so try Deezer before
  // settling for artwork that is not the record the post describes.
  const deezer = await searchAlbumDeezer(artist, albumName);
  if (deezer && !isAlternateRelease(deezer.albumName, albumName)) return deezer;

  return itunes ?? deezer;
}

async function searchAlbumItunes(
  artist: string,
  albumName: string
): Promise<AlbumInfo | null> {
  try {
    const query = encodeURIComponent(`${artist} ${albumName}`);
    const res = await fetch(
      // Wide limit: iTunes mixes reissues, singles and compilations into the top
      // results, so the actual album is often outside the first handful.
      `https://itunes.apple.com/search?term=${query}&entity=album&limit=25`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const results: Record<string, string>[] = data.results ?? [];
    if (results.length === 0) return null;

    // Require artist name match, then prefer closest album name match
    const pool = results.filter((r) => artistNameMatches(r.artistName, artist));
    if (pool.length === 0) return null; // don't fall back to wrong artist
    // Highest album score wins; ties go to the shortest title, which favours the
    // original release over live, deluxe and anniversary reissues.
    let best: Record<string, string> | undefined;
    let bestScore = 0;
    for (const r of pool) {
      const base = albumMatchScore(r.collectionName, albumName);
      if (base === 0) continue;
      const score = isAlternateRelease(r.collectionName, albumName) ? base - 0.5 : base;
      const better =
        score > bestScore ||
        (score === bestScore && best !== undefined &&
          (r.collectionName?.length ?? 0) < (best.collectionName?.length ?? 0));
      if (better) { best = r; bestScore = score; }
    }
    // Returning null lets the caller fall back to an artist photo. For a post about
    // a specific sleeve, no album art beats confidently showing the wrong one.
    if (!best) return null;

    // iTunes artwork comes as 100×100; replace with 3000×3000
    const artworkUrl = best.artworkUrl100?.replace("100x100bb", "3000x3000bb");
    if (!artworkUrl || !best.collectionViewUrl) return null;

    const info: AlbumInfo = {
      artworkUrl,
      appleMusicUrl: best.collectionViewUrl,
      albumName: best.collectionName,
      artistName: best.artistName,
      source: "apple",
    };

    info.spotifyUrl = (await getSpotifyAlbumUrl(artist, albumName)) ?? undefined;

    return info;
  } catch {
    return null;
  }
}

/**
 * Album artwork via Deezer, used when iTunes cannot find the record.
 *
 * The iTunes Search API has real gaps: Nevermind, The Dark Side of the Moon and
 * Appetite for Destruction return only tribute and covers records, no matter how
 * the query is phrased. Deezer carries all of them, so without this fallback the
 * most famous sleeves in the catalogue could never illustrate a vinyl_art post.
 */
async function searchAlbumDeezer(artist: string, albumName: string): Promise<AlbumInfo | null> {
  try {
    const res = await fetch(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(`${albumName} ${artist}`)}&limit=25`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items: Record<string, unknown>[] = data.data ?? [];

    let best: Record<string, unknown> | undefined;
    let bestScore = 0;
    for (const r of items) {
      const candidateArtist = (r.artist as { name?: string } | undefined)?.name;
      if (!artistNameMatches(candidateArtist, artist)) continue;
      const base = albumMatchScore(r.title as string, albumName);
      if (base === 0) continue;
      const notAnAlbum = r.record_type !== undefined && r.record_type !== "album";
      const score =
        notAnAlbum || isAlternateRelease(r.title as string, albumName) ? base - 0.5 : base;
      const better =
        score > bestScore ||
        (score === bestScore && best !== undefined &&
          ((r.title as string)?.length ?? 0) < ((best.title as string)?.length ?? 0));
      if (better) { best = r; bestScore = score; }
    }
    if (!best) return null;

    const cover = (best.cover_xl ?? best.cover_big) as string | undefined;
    if (!cover) return null;

    return {
      // Deezer serves the sleeve at any size from the same path; 1000 is the
      // documented xl but 1800 renders cleanly on a 1080-wide canvas.
      artworkUrl: cover.replace("1000x1000", "1800x1800"),
      albumName: best.title as string,
      artistName: (best.artist as { name: string }).name,
      spotifyUrl: (await getSpotifyAlbumUrl(artist, albumName)) ?? undefined,
      source: "deezer",
    };
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
      const match = results.find((r) => artistNameMatches(r.artistName, artist));
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
    // No results[0] fallback: iTunes ranks by popularity, so the first hit for an
    // unmatched query is simply a different artist.
    const match = results.find((r) => artistNameMatches(r.artistName, artist));
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
      // Wide limit on purpose: common names return many namesakes, and the real act
      // is often outside the top 5 (searching "Genesis" or "Madness" does not surface
      // the famous band early). The name match plus fan-count tiebreak below picks it.
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=25`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items: Record<string, unknown>[] = data.data ?? [];
    // d41d8cd98f00b204e9800998ecf8427e is md5("") — Deezer's placeholder for artists with no photo
    const DEEZER_PLACEHOLDER = "d41d8cd98f00b204e9800998ecf8427e";
    const hasRealPhoto = (item: Record<string, unknown>) => {
      const url = (item.picture_xl ?? item.picture_big ?? item.picture_medium) as string | undefined;
      return url && !url.includes(DEEZER_PLACEHOLDER) && !url.includes("/artist//");
    };

    // Must be this artist. The previous version fell back to any result carrying a
    // photo, so a search that failed to match returned an unrelated act's picture.
    const candidates = items.filter(
      (a) => artistNameMatches(a.name as string, artist) && hasRealPhoto(a)
    );
    if (candidates.length === 0) return null;

    // Distinct acts share a name — "Oasis" returns four — and Deezer's ordering can
    // put a 400-fan namesake above the 4.7M-fan band, so the first exact match is
    // not necessarily the right one. Take the most followed.
    const fanCount = (a: Record<string, unknown>) => (a.nb_fan as number) ?? 0;
    const artistMatch = candidates.reduce((best, a) => (fanCount(a) > fanCount(best) ? a : best));
    const imageUrl = (artistMatch.picture_xl ?? artistMatch.picture_big ?? artistMatch.picture_medium) as string;
    return { imageUrl, artistName: artistMatch.name as string };
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
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=25`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
      );
      console.log(`[spotify] search "${q}" → ${res.status}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.artists?.items ?? [];
    };
    let items = await trySearch(`artist:${artist}`);
    if (items.length === 0) items = await trySearch(artist);
    // No items[0] fallback — an unmatched Spotify search returns another artist,
    // whose press photo would then be published as this artist's. Among genuine
    // name matches, prefer the most followed so a namesake cannot win.
    const spotifyCandidates = items.filter((a: Record<string, unknown>) =>
      artistNameMatches(a.name as string, artist)
    );
    const followers = (a: Record<string, unknown>) =>
      ((a.followers as { total?: number } | undefined)?.total) ?? 0;
    const match = spotifyCandidates.length
      ? spotifyCandidates.reduce((best: Record<string, unknown>, a: Record<string, unknown>) =>
          (followers(a) > followers(best) ? a : best))
      : undefined;
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
    const seen = new Set<string>();
    const urls: string[] = [];

    for (const r of results) {
      if (!artistNameMatches(r.artistName, artist)) continue;
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
