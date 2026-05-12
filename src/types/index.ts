export interface StoryContent {
  artist: string;
  title: string;
  story: string;
  caption: string;
  imagePrompt: string;
  hashtags: string[];
}

export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export interface PlatformResult {
  status: "pending" | "posted" | "skipped" | "failed";
  postId?: string;
  error?: string;
  postedAt?: string;
}

export interface GeneratedPost {
  id: string;
  content: StoryContent;
  blobUrl?: string;         // permanent public image URL (Vercel Blob)
  imageBase64?: string;     // local preview (not stored in blob)
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
  };
}
