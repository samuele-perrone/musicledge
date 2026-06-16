/**
 * Facebook Graph API — Page photo and video posts
 * Env vars: FACEBOOK_PAGE_ID, FACEBOOK_USER_TOKEN
 */

import { getPageAccessToken } from "./meta";

const BASE = "https://graph.facebook.com/v21.0";

export async function postFacebookPhoto(
  imageUrl: string,
  caption: string
): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!pageId) throw new Error("FACEBOOK_PAGE_ID not set");
  const token = await getPageAccessToken();

  // Step 1: upload photo as unpublished to get a media fbid
  const uploadBody = new URLSearchParams({
    url: imageUrl,
    published: "false",
    access_token: token,
  });

  const uploadRes = await fetch(`${BASE}/${pageId}/photos`, {
    method: "POST",
    body: uploadBody,
  });
  const uploadData = await uploadRes.json();
  if (uploadData.error) throw new Error(`Facebook upload: ${uploadData.error.message}`);
  const photoId = uploadData.id as string;

  // Step 2: create a feed post with the photo attached — appears in public Posts feed
  const feedBody = new URLSearchParams({
    message: caption,
    attached_media: JSON.stringify([{ media_fbid: photoId }]),
    access_token: token,
  });

  const feedRes = await fetch(`${BASE}/${pageId}/feed`, {
    method: "POST",
    body: feedBody,
  });
  const feedData = await feedRes.json();
  if (feedData.error) throw new Error(`Facebook feed: ${feedData.error.message}`);

  return feedData.id as string; // post ID
}

/**
 * Posts a short video as a Facebook Reel via the /video_reels endpoint.
 * Requires only pages_manage_posts + pages_read_engagement (no publish_video needed).
 * Three-step flow: start → binary upload → finish/publish.
 */
export async function postFacebookVideo(
  videoUrl: string,
  caption: string,
  title?: string
): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!pageId) throw new Error("FACEBOOK_PAGE_ID not set");
  const token = await getPageAccessToken();

  // Fetch video from blob storage
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to fetch reel from blob: ${videoRes.status}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const fileSize = videoBuffer.length;

  // Step 1 — initialise upload
  const startBody = new URLSearchParams({
    upload_phase: "start",
    file_size: String(fileSize),
    access_token: token,
  });
  const startRes = await fetch(`${BASE}/${pageId}/video_reels`, { method: "POST", body: startBody });
  const startData = await startRes.json() as { video_id?: string; upload_url?: string; error?: { message: string } };
  if (startData.error) throw new Error(`Facebook video: ${startData.error.message}`);
  const { video_id: videoId, upload_url: uploadUrl } = startData;
  if (!videoId || !uploadUrl) throw new Error("Facebook video: missing video_id or upload_url");

  // Step 2 — binary upload
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      "Content-Type": "video/mp4",
      offset: "0",
      file_size: String(fileSize),
    },
    body: videoBuffer,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Facebook video upload: ${uploadRes.status} ${text}`);
  }

  // Step 3 — finish and publish
  const finishBody = new URLSearchParams({
    upload_phase: "finish",
    video_id: videoId,
    video_state: "PUBLISHED",
    description: caption.slice(0, 2000),
    access_token: token,
  });
  if (title) finishBody.set("title", title.slice(0, 255));
  const finishRes = await fetch(`${BASE}/${pageId}/video_reels`, { method: "POST", body: finishBody });
  const finishData = await finishRes.json() as { success?: boolean; error?: { message: string } };
  if (finishData.error) throw new Error(`Facebook video: ${finishData.error.message}`);

  return videoId;
}
