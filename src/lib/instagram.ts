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

/**
 * Upload image to a public URL first, then create an IG container.
 * Instagram requires the image to be accessible via a public HTTPS URL.
 */
export async function createMediaContainer(
  imageUrl: string,
  caption: string
): Promise<string> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const data = await igFetch(`/${accountId}/media`, "POST", {
    image_url: imageUrl,
    caption,
    media_type: "IMAGE",
  });
  return data.id as string;
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

/**
 * Creates a Reels media container from a public video URL.
 * Requires the video to be 23-60 fps, 9:16 aspect ratio, up to 90 seconds.
 */
export async function createReelContainer(
  videoUrl: string,
  caption: string
): Promise<string> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const data = await igFetch(`/${accountId}/media`, "POST", {
    video_url: videoUrl,
    caption,
    media_type: "REELS",
  });
  return data.id as string;
}

export async function createCarouselChildContainer(imageUrl: string): Promise<string> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const data = await igFetch(`/${accountId}/media`, "POST", {
    image_url: imageUrl,
    is_carousel_item: "true",
  });
  return data.id as string;
}

export async function createCarouselContainer(childIds: string[], caption: string): Promise<string> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const data = await igFetch(`/${accountId}/media`, "POST", {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
  });
  return data.id as string;
}

/**
 * Publishes an image as an Instagram Story.
 * Uses media_type=STORIES — requires instagram_content_publish permission.
 */
export async function publishInstagramStory(imageUrl: string, userTags?: string[]): Promise<string> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  // userTags intentionally unused — Instagram Stories user_tags requires numeric IDs
  void userTags;

  const container = await igFetch(`/${accountId}/media`, "POST", {
    image_url: imageUrl,
    media_type: "STORIES",
  });
  const containerId = container.id as string;

  // Wait for container to be ready
  let status = "IN_PROGRESS";
  let attempts = 0;
  while (status === "IN_PROGRESS" && attempts < 15) {
    await new Promise((r) => setTimeout(r, 3000));
    status = await checkContainerStatus(containerId);
    attempts++;
  }
  if (status !== "FINISHED") throw new Error(`Story container not ready: ${status}`);

  const published = await igFetch(`/${accountId}/media_publish`, "POST", {
    creation_id: containerId,
  });
  return published.id as string;
}
