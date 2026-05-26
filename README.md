# Musicledge

An automated social media bot for a music history brand. Every day it generates a richly formatted post about rock and pop music history — complete with real album artwork or artist photography — and publishes it across Instagram Stories, Facebook, and optionally Instagram Reels, TikTok, and YouTube Shorts.

Inspired by accounts like @explainingpaintings, but for music.

**Live dashboard:** https://musicledge.vercel.app
**Instagram:** https://www.instagram.com/musicledge/
**Facebook:** https://www.facebook.com/musicledge

---

## What it does

Musicledge runs on a daily schedule. At **7:30am BST (6:30 UTC)** it:

1. Checks for a breaking music news story (from NME, Rolling Stone, Pitchfork RSS feeds)
2. Checks whether today is a significant music anniversary or birthday
3. Picks an artist from a curated pool (avoiding recent repeats)
4. Generates a full post using Claude — story, caption, 3 story slide texts, hashtags, image prompt, artist Instagram handle, and relevant accounts to tag
5. Fetches real album art from iTunes or a real artist photo from Spotify
6. Composes branded 1080×1920 Story slides using Sharp + Satori
7. Publishes each slide as an individual Instagram Story (with artist/account mention notifications)
8. Posts the cover image to Facebook
9. Sends an error alert email if anything fails

The dashboard lets you manually generate, preview, and publish posts to any platform combination at any time.

---

## Post types

### Vinyl Art
Stories about the art direction and design behind iconic album covers — the photographer, the concept, hidden details, controversies. Uses real album art fetched from the iTunes CDN (up to 3000×3000px). Accent colour: teal.

### Music Story
Fascinating lesser-known stories about artists — specific recording sessions, career pivots, behind-the-scenes moments. Uses a real artist press photo fetched from Spotify. Accent colour: amber.

### Harmony
Explores musical DNA — specific riffs, chord progressions, or motifs borrowed between songs across different eras and genres. Rates similarity as *subtle nod*, *clear influence*, or *nearly identical*. Uses a real artist press photo. Accent colour: purple.

---

## Story slide format

Each post generates **4 vertical slides** at 1080×1920 (Instagram Story / Reel format):

| Slide | Content |
|-------|---------|
| 1 | Hook — a punchy "Did you know..." or bold statement to stop the scroll |
| 2 | The story — explained in a catchy, conversational way |
| 3 | Closing reflection or twist — `@handle` + top hashtags baked into the image |
| 4 | Follow slide — branded call to action ("Follow us for daily music stories...") |

---

## Platforms

| Platform | Automation (cron) | Manual (dashboard) |
|----------|-------------------|--------------------|
| Instagram Story | Yes — 4 slides posted individually | Yes |
| Facebook | Yes — cover image with caption | Yes |
| Instagram Feed | No | Yes |
| Instagram Reel | No | Yes (animated video from slides) |
| TikTok | No | Yes |
| YouTube Shorts | No | Yes |

---

## Dashboard

The Next.js dashboard at `/` provides:

- **Generate** — create a new post with optional overrides: artist name, category, image style, or custom breaking news text
- **Run daily posts** — trigger the full cron pipeline manually (generates and publishes immediately)
- **Post cards** — preview each generated post, platform status badges (posted / failed / skipped / pending)
- **Retry** — re-attempt publishing to any failed platform individually
- **Publish** — choose specific platforms and publish manually

---

## Architecture

```
Next.js App Router (Vercel)
│
├── /api/cron          — Vercel Cron job (GET, 6:30 UTC daily) + manual trigger (POST)
├── /api/generate      — Generate a new post (images + slides + reel video)
├── /api/post          — Publish a post to one or more platforms
│
├── lib/claude.ts      — Claude claude-opus-4-6: content generation, news detection, event lookup
├── lib/compose.ts     — Sharp + Satori: image composition (feed 1080×1080, story 1080×1920)
├── lib/musicapi.ts    — iTunes Search API (album art) + Spotify Web API (artist photos)
├── lib/imagegen.ts    — OpenAI DALL-E 3: fallback image generation
├── lib/instagram.ts   — Instagram Graph API: Stories, Feed, Reels, Carousel, user_tags (mentions)
├── lib/facebook.ts    — Facebook Graph API: photo posts with caption
├── lib/tiktok.ts      — TikTok Content Posting API: photo posts
├── lib/youtube.ts     — YouTube Data API v3: Shorts upload
├── lib/video.ts       — FFmpeg: animated reel video from story slide buffers
├── lib/blob.ts        — Vercel Blob: image + video storage (public HTTPS URLs)
└── lib/store.ts       — Upstash Redis: post persistence (in-memory fallback for local dev)
```

---

## Content pipeline (per post)

```
Claude generates content
    ↓
iTunes / Spotify → fetch real image
    ↓ (fallback: DALL-E 3)
Sharp + Satori → compose cover image (1080×1080)
    ↓
Sharp + Satori → compose 3 story slides + follow slide (1080×1920 each)
    ↓
FFmpeg → animated reel video from slides (dashboard only)
    ↓
Vercel Blob → upload all images + video
    ↓
Instagram Graph API → publish each story slide individually
Facebook Graph API  → publish cover image with caption
```

---

## Engagement features

When Claude generates content it also produces:

- **`instagramHandle`** — the artist's Instagram username
- **`tagAccounts`** — 1-2 relevant music media accounts (e.g. `rollingstonemagazine`, `pitchfork`)

These are used in two ways:

1. **`user_tags` API parameter** — passed to the Instagram Stories API so the tagged accounts receive a real mention notification, boosting reach
2. **Text overlay** — `@handle` + top 3 hashtags are baked directly into slide 3 so viewers can see who's been tagged even before tapping

---

## Breaking news detection

Every cron run fetches the last 48 hours of headlines from NME, Rolling Stone, and Pitchfork RSS. Claude judges whether any headline is significant enough (band reunions, surprise album drops, major deaths, landmark tours) to override the scheduled vinyl art post with a timely `music_story` instead.

---

## Deduplication

The system tracks the last 40 posts. When generating new content Claude is shown the full list of recent artist/title/category combinations and instructed not to repeat them. Artists featured recently are deprioritised in the random selection pool.

---

## Image sourcing

| Post type | Primary source | Fallback |
|-----------|---------------|---------|
| Vinyl Art | iTunes CDN (up to 3000×3000) | DALL-E 3 — editorial style |
| Music Story | Spotify artist press photo | DALL-E 3 — random style |
| Harmony | Spotify artist press photo | DALL-E 3 — random style |

When real images are used, a credit line is added to the published caption:
- `📷 Album artwork © Artist, via @applemusic`
- `📷 Photo © Artist, via @spotify`

---

## API endpoints

### `POST /api/generate`
Generates a new post (content + images + slides + reel). Does not publish. Returns the full post object.

```json
// Request body (all optional)
{
  "artist": "Pink Floyd",
  "category": "vinyl_art",
  "imageStyle": "editorial",
  "breakingNews": "Custom news override"
}
```

### `POST /api/post`
Publishes an existing post to the specified platforms.

```json
{ "postId": "uuid", "platforms": ["story", "facebook"] }
```

### `GET /api/cron`
Full pipeline: generate + publish. Called by Vercel Cron. Requires `Authorization: Bearer <CRON_SECRET>` header.

### `POST /api/cron`
Same pipeline, no auth required — triggered from the dashboard "Run daily posts" button.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API — content generation |
| `OPENAI_API_KEY` | DALL-E 3 — fallback image generation |
| `INSTAGRAM_ACCOUNT_ID` | Instagram Business/Creator account ID |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram Graph API long-lived access token |
| `FACEBOOK_PAGE_ID` | Facebook Page ID |
| `FACEBOOK_ACCESS_TOKEN` | Facebook Graph API page access token |
| `SPOTIFY_CLIENT_ID` | Spotify Web API — artist photo lookup |
| `SPOTIFY_CLIENT_SECRET` | Spotify Web API — artist photo lookup |
| `KV_REST_API_URL` | Upstash Redis URL |
| `KV_REST_API_TOKEN` | Upstash Redis token |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `AMAZON_AFFILIATE_TAG` | Amazon Associates tag (optional) |
| `CRON_SECRET` | Bearer token to authenticate Vercel's cron GET requests |
| `RESEND_API_KEY` | Resend — error alert emails |
| `ALERT_EMAIL` | Recipient for error alert emails |
| `TIKTOK_ACCESS_TOKEN` | TikTok Content Posting API (optional) |
| `YOUTUBE_CLIENT_ID` | YouTube Data API OAuth (optional) |
| `YOUTUBE_CLIENT_SECRET` | YouTube Data API OAuth (optional) |
| `YOUTUBE_REFRESH_TOKEN` | YouTube Data API OAuth (optional) |

---

## Cron schedule

Configured in `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron", "schedule": "30 6 * * *" }] }
```

Runs at **06:30 UTC = 07:30 BST** daily.

To trigger manually:
```bash
curl -X POST https://musicledge.vercel.app/api/cron
```
Or use the "Run daily posts" button in the dashboard.

---

## Access tokens

Instagram and Facebook use a **long-lived Page Access Token**. To refresh if it ever expires:

1. Go to [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select the MusicLedge app
3. Generate a User Token with `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` permissions
4. Extend to a long-lived token via the Access Token Debugger
5. Fetch the Page token:
   ```bash
   curl "https://graph.facebook.com/v21.0/PAGE_ID?fields=access_token&access_token=LONG_LIVED_USER_TOKEN"
   ```
6. Update `FACEBOOK_ACCESS_TOKEN` and `INSTAGRAM_ACCESS_TOKEN` in Vercel environment variables

---

## Local development

```bash
npm install
cp .env.local.example .env.local  # add your API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without Redis env vars the app falls back to in-memory storage (posts reset on restart).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Hosting | Vercel |
| AI — content | Claude claude-opus-4-6 (Anthropic) |
| AI — images | DALL-E 3 (OpenAI) |
| Image processing | Sharp + Satori |
| Video | FFmpeg (fluent-ffmpeg) |
| Media storage | Vercel Blob |
| Post storage | Upstash Redis |
| Social — Instagram | Instagram Graph API v21 |
| Social — Facebook | Facebook Graph API v21 |
| Social — TikTok | TikTok Content Posting API |
| Social — YouTube | YouTube Data API v3 |
| Music metadata | iTunes Search API + Spotify Web API |
| Scheduling | Vercel Cron |
| Email alerts | Resend |
| Styling | Tailwind CSS v4 |
