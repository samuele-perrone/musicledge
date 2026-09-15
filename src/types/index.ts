import type { AlbumInfo } from "@/lib/musicapi";
import type { PostMetrics } from "@/lib/insights";

/**
 * The six named series plus `music_story`, the general format used when breaking
 * news or an anniversary overrides the weekly schedule. Labels and colours live
 * in lib/series.ts.
 *
 * `vinyl_art` and `harmony` were the old slugs for what are now `sleeve_stories`
 * and `same_riff`. They are not generated any more but still sit on stored posts,
 * so seriesMeta() maps them rather than this union carrying them forever.
 */
export type PostCategory =
  | "same_riff"
  | "sleeve_stories"
  | "band_at_war"
  | "happy_accident"
  | "ten_minutes_flat"
  | "banned"
  | "music_story";

export interface StoryContent {
  category: PostCategory;
  artist: string;
  title: string;
  story: string;
  imageCaption: string;        // short 1-line teaser for image overlay (max 60 chars)
  caption: string;
  imagePrompt: string;
  hashtags: string[];
  amazonSearchTerms: string;   // e.g. "Pink Floyd Dark Side Moon vinyl record"
  albumName?: string;          // exact album title (sleeve_stories only) — used for iTunes/Spotify lookup
  musicGenre?: "heavy" | "melodic"; // used to pick background audio track
  carouselSlides?: string[];  // 3 slide texts for slides 2-4
  // Harmony-specific fields
  influenceSource?: string;    // e.g. "Led Zeppelin — Whole Lotta Love (1969)"
  influencedWork?: string;     // e.g. "The White Stripes — Seven Nation Army (2003)"
  similarityLevel?: "subtle_nod" | "clear_influence" | "nearly_identical";
  genre?: string;              // e.g. "blues → hard rock"
  emotion?: string;            // e.g. "euphoric"
  activityTags?: string[];     // e.g. ["workout", "driving"]
  instagramHandle?: string;    // artist's Instagram handle without @
  tagAccounts?: string[];      // 1-2 relevant media account handles without @
}

export type Platform = "tiktok" | "youtube" | "reel";

export interface PlatformResult {
  status: "pending" | "posted" | "skipped" | "failed";
  postId?: string;
  error?: string;
  postedAt?: string;
}

export interface GeneratedPost {
  id: string;
  content: StoryContent;
  blobUrl?: string;
  storyBlobUrl?: string;       // 1080×1920 Instagram Story image
  reelBlobUrl?: string;        // 1080×1920 MP4 for Instagram Reels
  carouselBlobUrls?: string[];   // 4 carousel slide images (1080x1080)
  todayEvent?: string;         // e.g. "50th anniversary of Dark Side of the Moon"
  imageBase64?: string;
  affiliateUrl?: string;       // constructed Amazon affiliate link
  // Measured after publishing, refreshed while the post is recent. Absent until
  // the first collection pass reaches it, and on anything that never published.
  metrics?: PostMetrics;

  // Populated for sleeve_stories posts when an album lookup succeeds (iTunes, else Deezer).
  // Mirrors AlbumInfo in lib/musicapi rather than redeclaring a narrower shape.
  albumInfo?: AlbumInfo;
  artistInfo?: {              // populated for series that use an artist photo
    imageUrl: string;
    isArtistPhoto: boolean;   // true = real press photo (Deezer/Spotify); false = iTunes album art fallback
    spotifyUrl?: string;
    appleMusicUrl?: string;
    artistName: string;
  };
  platforms: Record<Platform, PlatformResult>;
  status: "pending" | "image_ready" | "posted" | "failed";
  error?: string;
  createdAt: string;
}

export function defaultPlatforms(): Record<Platform, PlatformResult> {
  return {
    tiktok: { status: "pending" },
    youtube: { status: "pending" },
    reel: { status: "pending" },
  };
}
