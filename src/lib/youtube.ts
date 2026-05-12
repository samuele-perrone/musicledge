/**
 * YouTube Data API v3 — Shorts upload
 *
 * Setup:
 * 1. Enable YouTube Data API v3 in Google Cloud Console
 * 2. Create OAuth2 credentials (Desktop app type)
 * 3. Run the one-time auth flow to get refresh token:
 *    npx ts-node scripts/youtube-auth.ts
 * Env vars: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 */
import { google } from "googleapis";
import { Readable } from "stream";

function getOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  oauth2.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });
  return oauth2;
}

export async function uploadYouTubeShort(
  videoBuffer: Buffer,
  title: string,
  description: string,
  tags: string[]
): Promise<string> {
  const auth = getOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });

  const stream = Readable.from(videoBuffer);

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: `${title} #Shorts`,
        description,
        tags: [...tags, "Shorts", "MusicHistory", "RockMusic"],
        categoryId: "10", // Music
        defaultLanguage: "en",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      mimeType: "video/mp4",
      body: stream,
    },
  });

  const videoId = res.data.id;
  if (!videoId) throw new Error("YouTube upload failed — no video ID returned");
  return videoId;
}
