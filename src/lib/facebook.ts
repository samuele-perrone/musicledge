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
 * Posts a video to the Facebook Page feed via public URL.
 * Used for Reels / video posts from a Blob-hosted MP4.
 */
export async function postFacebookVideo(
  videoUrl: string,
  caption: string,
  title?: string
): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!pageId) throw new Error("FACEBOOK_PAGE_ID not set");
  const token = await getPageAccessToken();

  const body = new URLSearchParams({
    file_url: videoUrl,
    description: caption,
    access_token: token,
  });
  if (title) body.set("title", title);

  const res = await fetch(`${BASE}/${pageId}/videos`, {
    method: "POST",
    body,
  });
  const data = await res.json();
  if (data.error) throw new Error(`Facebook video: ${data.error.message}`);
  return data.id as string;
}
