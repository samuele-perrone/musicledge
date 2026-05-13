export interface StoryContent {
  artist: string;
  title: string;
  story: string;
  imageCaption: string;        // short 1-line teaser for image overlay (max 60 chars)
  caption: string;
  imagePrompt: string;
  hashtags: string[];
  amazonSearchTerms: string;   // e.g. "Pink Floyd Dark Side Moon vinyl record"
  newsletterTitle: string;     // email subject line
  newsletterHtml: string;      // full story in HTML for Substack
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
  blobUrl?: string;
  imageBase64?: string;
  affiliateUrl?: string;       // constructed Amazon affiliate link
  substackDraftId?: number;
  substackDraftUrl?: string;
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
