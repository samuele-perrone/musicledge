export interface StoryContent {
  artist: string;
  title: string;
  story: string;
  caption: string;
  imagePrompt: string;
  hashtags: string[];
}

export interface GeneratedPost {
  id: string;
  content: StoryContent;
  imageUrl?: string;
  imageBase64?: string;
  instagramMediaId?: string;
  instagramPostId?: string;
  status: "pending" | "image_ready" | "posted" | "failed";
  error?: string;
  createdAt: string;
  postedAt?: string;
}
