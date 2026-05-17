/**
 * Substack API — create newsletter drafts automatically.
 *
 * Setup:
 * 1. Log into substack.com in your browser
 * 2. Open DevTools → Application → Cookies → substack.com
 * 3. Copy the value of the "substack.sid" cookie
 * Env vars: SUBSTACK_PUBLICATION_URL, SUBSTACK_SID
 *
 * Example SUBSTACK_PUBLICATION_URL: https://yourbrand.substack.com
 *
 * Note: drafts are created but NOT published automatically.
 * Review and send from your Substack dashboard.
 */

interface SubstackDraft {
  id: number;
  draft_title: string;
  draft_subtitle: string;
  draft_body: string;
}

function getSubstackBase() {
  const url = process.env.SUBSTACK_PUBLICATION_URL;
  if (!url) throw new Error("SUBSTACK_PUBLICATION_URL not set");
  return url.replace(/\/$/, "");
}

function getHeaders() {
  const sid = process.env.SUBSTACK_SID;
  if (!sid) throw new Error("SUBSTACK_SID not set");
  // Decode URL-encoded value in case user copied it from the browser URL bar
  const decoded = decodeURIComponent(sid);
  return {
    "Content-Type": "application/json",
    Cookie: `substack.sid=${decoded}`,
  };
}

export async function createSubstackDraft(
  title: string,
  subtitle: string,
  bodyHtml: string,
  affiliateUrl?: string
): Promise<{ id: number; url: string }> {
  const base = getSubstackBase();

  // Append affiliate callout at the bottom of the newsletter
  const affiliateBlock = affiliateUrl
    ? `<p><strong>🎵 Listen &amp; collect:</strong> <a href="${affiliateUrl}">Find this album on Amazon</a> — buying through this link supports the newsletter at no extra cost to you.</p>`
    : "";

  const fullBody = `${bodyHtml}${affiliateBlock}`;

  const res = await fetch(`${base}/api/v1/drafts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      type: "newsletter",
      draft_title: title,
      draft_subtitle: subtitle,
      draft_body: JSON.stringify({ type: "doc", content: [{ type: "html", attrs: { html: fullBody } }] }),
      audience: "everyone",
      section_chosen: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Substack API ${res.status}: ${text}`);
  }

  const draft: SubstackDraft = await res.json();
  return {
    id: draft.id,
    url: `${base}/publish/post/${draft.id}`,
  };
}
