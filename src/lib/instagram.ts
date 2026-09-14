// Instagram Graph API integration
// Requires: Instagram Business/Creator account linked to a Facebook Page
// Env vars: INSTAGRAM_ACCOUNT_ID, FACEBOOK_USER_TOKEN (+ FACEBOOK_PAGE_ID)

import { getUserAccessToken } from "./meta";

const BASE = "https://graph.facebook.com/v21.0";

async function igFetch(
  path: string,
  method: "GET" | "POST",
  params: Record<string, string>
) {
  const url = new URL(`${BASE}${path}`);
  const accessToken = params.access_token || await getUserAccessToken();

  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString());
    const json = await res.json();
    if (json.error) throw new Error(`Instagram API: ${json.error.message}`);
    return json;
  } else {
    const body = new URLSearchParams({ ...params, access_token: accessToken });
    const res = await fetch(url.toString(), { method: "POST", body });
    const json = await res.json();
    if (json.error) throw new Error(`Instagram API: ${json.error.message}`);
    return json;
  }
}

export async function publishMediaContainer(
  containerId: string
): Promise<string> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const data = await igFetch(`/${accountId}/media_publish`, "POST", {
    creation_id: containerId,
  });
  return data.id as string;
}

export async function checkContainerStatus(
  containerId: string
): Promise<string> {
  const data = await igFetch(`/${containerId}`, "GET", {
    fields: "status_code,status",
  });
  return data.status_code as string;
}

// Instagram usernames: letters, digits, full stops and underscores, up to 30 chars.
const IG_USERNAME = /^[a-z0-9._]{1,30}$/;
const PLACEHOLDERS = new Set(["unknown", "none", "n/a", "na", "null", "undefined", ""]);

/** Strips leading @ and whitespace, then rejects anything that is not a plausible handle. */
export function normaliseHandle(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const handle = raw.trim().replace(/^@+/, "").toLowerCase();
  if (PLACEHOLDERS.has(handle) || !IG_USERNAME.test(handle)) return null;
  return handle;
}

const alphanumeric = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Handles come from the content model and cannot be verified — looking up an
 * arbitrary username needs business_discovery, which this token does not carry.
 * An invented handle would tag an uninvolved account on every post, so only tag
 * when the handle visibly derives from the artist name. Skipping a legitimate
 * tag (QOTSA -> @qotsa will not match) is far cheaper than notifying a stranger.
 */
export function resolveArtistHandle(raw: string | undefined | null, artist: string): string | null {
  const handle = normaliseHandle(raw);
  if (!handle) return null;

  // Compare on letters and digits only so the_smiths still matches "The Smiths".
  const handleKey = alphanumeric(handle);
  const artistKey = alphanumeric(artist);
  if (artistKey.length < 3 || handleKey.length < 3) return null;

  // Handle built from the full artist name: thebeatles, remhq, pinkfloydofficial.
  const bare = artistKey.replace(/^the/, "");
  if (handleKey.includes(artistKey) || (bare.length >= 3 && handleKey.includes(bare))) {
    return handle;
  }

  // Deliberately strict: a partial handle is not accepted even when it is a real
  // word of the artist name, because "young" for Neil Young is far more likely to
  // be a stranger than the artist. This does reject some genuine surname handles
  // (@springsteen), which costs a tag we could have had — the right trade when the
  // alternative is notifying an uninvolved account twice a day.
  return null;
}

/**
 * Decides which accounts a post should tag.
 *
 * The artist is tagged when their handle can be tied back to their name. The
 * outlets in tagAccounts (pitchfork, rollingstonemagazine and similar) have no
 * connection to the individual post, and tagging them on every one is the kind
 * of engagement bait that gets an account down-ranked, so they stay off unless
 * TAG_MEDIA_ACCOUNTS is explicitly set to "true".
 */
export function buildPostTags(content: {
  artist: string;
  instagramHandle?: string;
  tagAccounts?: string[];
}): { artistHandle: string | null; userTags: string[]; mentionLine: string } {
  const artistHandle = resolveArtistHandle(content.instagramHandle, content.artist);
  const mediaHandles = process.env.TAG_MEDIA_ACCOUNTS === "true"
    ? (content.tagAccounts ?? []).map((h) => normaliseHandle(h))
    : [];
  const userTags = [...new Set(
    [artistHandle, ...mediaHandles].filter((h): h is string => h !== null)
  )];
  return {
    artistHandle,
    userTags,
    mentionLine: userTags.length ? `\n\n${userTags.map((h) => `@${h}`).join(" ")}` : "",
  };
}

export interface ReelOptions {
  /** Frame to use as the cover, in milliseconds into the video. Defaults to 0 (first frame). */
  thumbOffsetMs?: number;
  /** Public Instagram usernames to tag. REELS take usernames alone; only IMAGE needs x/y. */
  userTags?: string[];
  /** When true the reel appears in both the Feed and Reels tabs, not Reels only. */
  shareToFeed?: boolean;
}

/**
 * Creates a Reels media container from a public video URL.
 * Requires the video to be 23-60 fps, 9:16 aspect ratio, up to 90 seconds.
 */
export async function createReelContainer(
  videoUrl: string,
  caption: string,
  options: ReelOptions = {}
): Promise<string> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const params: Record<string, string> = {
    video_url: videoUrl,
    caption,
    media_type: "REELS",
    share_to_feed: String(options.shareToFeed ?? true),
  };
  if (options.thumbOffsetMs !== undefined) {
    params.thumb_offset = String(Math.max(0, Math.round(options.thumbOffsetMs)));
  }
  if (options.userTags?.length) {
    params.user_tags = JSON.stringify(options.userTags.map((username) => ({ username })));
  }
  const data = await igFetch(`/${accountId}/media`, "POST", params);
  return data.id as string;
}
