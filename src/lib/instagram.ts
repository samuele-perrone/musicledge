// Instagram Graph API integration
// Requires: Instagram Business/Creator account linked to a Facebook Page
// Env vars: INSTAGRAM_ACCOUNT_ID, INSTAGRAM_ACCESS_TOKEN

const BASE = "https://graph.facebook.com/v21.0";

async function igFetch(
  path: string,
  method: "GET" | "POST",
  params: Record<string, string>
) {
  const url = new URL(`${BASE}${path}`);
  const accessToken =
    params.access_token || process.env.INSTAGRAM_ACCESS_TOKEN!;

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
