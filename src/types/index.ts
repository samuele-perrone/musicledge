export type PostCategory = "music_story" | "vinyl_art" | "harmony";

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
  albumName?: string;          // exact album title (vinyl_art only) — used for iTunes/Spotify lookup
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

export type Platform = "instagram" | "tiktok" | "youtube" | "facebook" | "reel";

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
  albumInfo?: {               // populated for vinyl_art posts when iTunes lookup succeeds
    artworkUrl: string;
    appleMusicUrl: string;
    albumName: string;
    artistName: string;
    spotifyUrl?: string;
  };
  artistInfo?: {              // populated for music_story/harmony posts when Spotify lookup succeeds
    imageUrl: string;
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
    instagram: { status: "pending" },
    tiktok: { status: "pending" },
    youtube: { status: "pending" },
    facebook: { status: "pending" },
    reel: { status: "pending" },
  };
}
