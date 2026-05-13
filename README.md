# MusicLedge

An automated social media publishing bot for rock and pop music history stories. Every day it generates a unique, lesser-known story about an iconic artist, creates a matching AI illustration, and publishes it to Instagram and Facebook — with an optional Substack newsletter draft.

Inspired by accounts like @explainingpaintings, but for music.

**Live dashboard:** https://musicledge.vercel.app  
**Instagram:** https://www.instagram.com/musicledge/  
**Facebook:** https://www.facebook.com/musicledge

---

## How it works

1. **Story generation** — Claude (claude-opus-4-6) picks a random artist from a curated pool and generates a compelling, lesser-known story: a specific song, recording session, or career moment. Output includes the social caption, hashtags, image overlay text, Amazon search terms, and a full newsletter article in HTML.

2. **Image generation** — OpenAI's gpt-image-1 generates a stylized vintage editorial illustration based on the artist's era, instruments, and iconic imagery. No real human faces.

3. **Image composition** — Sharp resizes the image to 1080×1080. Satori (the same engine as Vercel OG) renders a text overlay with the MUSICLEDGE badge, artist name, title, and a short caption line — using bundled Inter fonts so it works reliably on Vercel's Lambda runtime.

4. **Storage** — The composed image is uploaded to Vercel Blob. Post metadata is stored in Upstash Redis.

5. **Publishing** — The caption (story + hashtags + Amazon affiliate link) is posted to Instagram via the Graph API and to Facebook via the Pages API.

6. **Substack draft** — A formatted newsletter article is created as a draft on Substack for review before sending.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Hosting | Vercel (Hobby plan) |
| AI — stories | Anthropic Claude claude-opus-4-6 |
| AI — images | OpenAI gpt-image-1 |
| Image processing | Sharp + Satori |
| Image storage | Vercel Blob |
| Post storage | Upstash Redis (via Vercel KV) |
| Social — Instagram | Instagram Graph API v21 |
| Social — Facebook | Facebook Graph API v21 |
| Newsletter | Substack API |
| Affiliate | Amazon Associates |
| Scheduling | Vercel Cron |

---

## Project structure

```
src/
  app/
    page.tsx                  # Dashboard UI
    api/
      generate/route.ts       # Generate story + image (no publish)
      post/route.ts           # Publish a post to social platforms
      cron/route.ts           # Full pipeline: generate + publish (runs on schedule)
      history/route.ts        # Load post history from Redis
  lib/
    claude.ts                 # Story generation + affiliate URL builder
    imagegen.ts               # gpt-image-1 image generation
    compose.ts                # Sharp + Satori image composition
    blob.ts                   # Vercel Blob upload
    store.ts                  # Upstash Redis post storage
    instagram.ts              # Instagram Graph API
    facebook.ts               # Facebook Graph API
    substack.ts               # Substack draft creation
    video.ts                  # YouTube Shorts video creation (future)
    tiktok.ts                 # TikTok posting (future)
    youtube.ts                # YouTube upload (future)
  types/
    index.ts                  # TypeScript types
public/
  fonts/
    Inter-Regular.ttf         # Bundled for Satori (no system fonts on Lambda)
    Inter-Bold.ttf
```

---

## Dashboard

The dashboard at `/` has two tabs:

- **Posts** — grid of all generated posts with status badges, platform indicators, and a Publish button for any post that has an image but hasn't been published yet.
- **Generate** — two actions:
  - **Preview Only** — generates the story and image, saves to history for manual review, does not publish.
  - **Generate & Publish** — full pipeline, immediately publishes to selected platforms.

---

## API endpoints

### `POST /api/generate`
Generates a new post (story + image + Substack draft). Does not publish to social. Returns the full post object.

```json
// Request body (all optional)
{ "artist": "Pink Floyd" }  // force a specific artist
```

### `POST /api/post`
Publishes an existing post (by ID) to the specified platforms.

```json
// Request body
{ "postId": "uuid", "platforms": ["instagram", "facebook"] }
```

### `GET /api/cron`
Full pipeline: generate + publish. Called by Vercel Cron. Requires `Authorization: Bearer <CRON_SECRET>` header.

### `GET /api/history`
Returns stored posts from Redis. Accepts `?limit=N` query param.

---

## Environment variables

Set these in Vercel (Settings → Environment Variables):

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key (gpt-image-1) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `KV_REST_API_URL` | Upstash Redis URL (set automatically by Vercel KV integration) |
| `KV_REST_API_TOKEN` | Upstash Redis token (set automatically by Vercel KV integration) |
| `INSTAGRAM_ACCOUNT_ID` | Instagram Business Account ID |
| `INSTAGRAM_ACCESS_TOKEN` | Facebook/Instagram Page Access Token (never-expiring) |
| `FACEBOOK_PAGE_ID` | Facebook Page ID |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook Page Access Token (same token as Instagram) |
| `AMAZON_AFFILIATE_TAG` | Amazon Associates tag (e.g. `musicledge-21`) |
| `CRON_SECRET` | Secret to authenticate cron endpoint calls |
| `SUBSTACK_PUBLICATION_URL` | Substack publication URL (not yet configured) |
| `SUBSTACK_SID` | Substack session cookie (not yet configured) |

---

## Cron schedule

Configured in `vercel.json`. Currently runs once daily at **10:00 UTC** (Vercel Hobby plan allows one cron job). Upgrade to Pro for multiple daily runs.

```json
{
  "crons": [{ "path": "/api/cron", "schedule": "0 10 * * *" }]
}
```

To trigger manually:

```bash
curl -X GET https://musicledge.vercel.app/api/cron \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Access tokens

Instagram and Facebook use a **never-expiring Page Access Token**. To refresh if it ever expires:

1. Go to [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select app **MusicLedge** (App ID: `1003253958940488`)
3. Generate a User Token with `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` permissions
4. Extend to a long-lived token via the Access Token Debugger
5. Fetch the Page token:
   ```bash
   curl "https://graph.facebook.com/v21.0/1108332329039317?fields=access_token&access_token=LONG_LIVED_USER_TOKEN"
   ```
6. Update `FACEBOOK_PAGE_ACCESS_TOKEN` and `INSTAGRAM_ACCESS_TOKEN` in Vercel env vars

---

## Local development

```bash
npm install
cp .env.local.example .env.local  # add your API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Note: without Redis env vars the app falls back to in-memory storage (posts reset on restart).
