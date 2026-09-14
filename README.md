# Musicledge

An automated social media bot for a music history brand. Twice a day it generates a post about rock and pop music history — complete with real album artwork or artist photography — composes it into a vertical video, and publishes it as an Instagram Reel.

Inspired by accounts like @explainingpaintings, but for music.

**Live dashboard:** https://musicledge.vercel.app
**Instagram:** https://www.instagram.com/musicledge/

---

## What it does

Musicledge runs on a schedule. At **08:30 and 11:30 UTC** it:

1. Checks for a breaking music news story (from NME, Rolling Stone, Pitchfork RSS feeds)
2. Checks whether today is a significant music anniversary or birthday
3. Picks an artist from a 208-strong curated pool, avoiding anyone featured recently
4. Generates the post — story, caption, 3 slide texts, hashtags, artist Instagram handle
5. Fetches a real album cover or artist press photo (never AI-generated on the cron path)
6. Composes branded 1080×1920 frames and encodes them into a reel with a music bed
7. Publishes the reel to Instagram, tagging the artist when the handle can be verified
8. Sends an error alert email if anything fails

A watchdog runs an hour after each slot and retries the pipeline if that slot produced nothing.

---

## Post types

Categories cycle in order: **vinyl_art → music_story → harmony**. Breaking news forces a `music_story`.

### Vinyl Art
The art direction behind iconic album covers — the photographer, the concept, hidden details, controversies. Uses the real album sleeve. Accent colour: teal.

### Music Story
Lesser-known stories about artists — recording sessions, career pivots, behind-the-scenes moments. Uses a real artist press photo. Accent colour: amber.

### Harmony
Musical DNA — riffs, chord progressions and motifs borrowed between songs across eras. Rates similarity as *subtle nod*, *clear influence*, or *nearly identical*. Uses a real artist press photo. Accent colour: purple.

---

## Reel structure

Each post becomes one vertical video at 1080×1920, roughly 24 seconds:

| Segment | Duration | Content |
|---------|----------|---------|
| Intro | 3.0s | Title card — artist banner, image, hook |
| Slide 1 | 3.5–8s | A numbered, saves-bait hook |
| Slide 2 | 3.5–8s | Two punchy facts back to back |
| Follow | up to 6s | Closing line plus a branded call to action |

Slide durations scale with word count (`words / 2.5 + 1.5`, clamped), so a typical post lands around 24 seconds. A royalty-free music bed is picked from `public/audio` (24 tracks, split into *heavy* and *melodic* pools) to match the story's genre.

The Reel cover is pinned with `thumb_offset` to 1500ms — mid-intro, inside the window where the title card is fully opaque — so the grid thumbnail is deterministic rather than whatever frame Instagram picks.

---

## Platforms

| Platform | Cron | Dashboard | Notes |
|----------|------|-----------|-------|
| Instagram Reel | Yes | Yes | The only automated output |
| TikTok | No | Yes | Needs `TIKTOK_ACCESS_TOKEN`, currently unset in production |
| YouTube Shorts | No | Yes | Needs `YOUTUBE_*` OAuth, currently unset in production |
| Facebook | No | No | Dropped — the cron marks it `skipped` |

Instagram Stories, Feed and Carousel publishing were removed. The helpers for them still exist in `lib/instagram.ts` but nothing calls them.

---

## Dashboard

The Next.js dashboard at `/` is password-protected (`DASHBOARD_PASSWORD`, session cookie checked in `middleware.ts`). It provides:

- **Generate** — create a post with optional overrides: artist, category, image style, or custom breaking-news text
- **Run daily posts** — trigger the full cron pipeline immediately
- **Post cards** — preview each post with per-platform status badges
- **Retry / Publish** — re-attempt or publish to a chosen platform set

Unlike the cron path, dashboard generation *can* fall back to a DALL·E image when no real photo is found.

---

## Architecture

```
Next.js 16 App Router (Vercel)
│
├── /api/cron          — scheduled pipeline (GET, cron secret) + manual trigger (POST)
├── /api/watchdog      — retries the cron if a slot produced nothing
├── /api/generate      — generate a post without publishing
├── /api/post          — publish an existing post to chosen platforms
├── /api/refresh       — regenerate image + slides for an unposted post
├── /api/history       — list and delete stored posts
├── /api/auth          — dashboard login
├── /api/token-debug   — inspect the active Meta token, scopes and IG linkage
├── /api/token-reset   — clear the cached Meta token
│
├── lib/claude.ts      — content generation, news detection, event lookup, artist pool
├── lib/compose.ts     — Sharp + Satori image composition
├── lib/musicapi.ts    — iTunes, Deezer and Spotify lookups for artwork and photos
├── lib/video.ts       — FFmpeg reel encoding, audio selection
├── lib/instagram.ts   — Instagram Graph API, handle validation, tagging
├── lib/meta.ts        — Meta token management with Redis caching
├── lib/blob.ts        — Vercel Blob storage
├── lib/store.ts       — Upstash Redis post storage
├── lib/imagegen.ts    — DALL·E 3, dashboard paths only
├── lib/tiktok.ts      — TikTok Content Posting API
└── lib/youtube.ts     — YouTube Data API v3
```

---

## Content generation

Text comes from **Gemini 2.5 Pro** by default. Set `AI_PROVIDER=claude` to switch to `claude-opus-4-7` instead; both are wired behind one `generate()` function in `lib/claude.ts`.

### Deduplication

The artist pool holds 208 acts. Selection walks `RECENCY_TIERS` (`[90, 60, 30, 15, 5]`), taking the widest window that still leaves candidates rather than collapsing to a narrow one when the pool is exhausted. Anniversary posts use a 30-post window and breaking-news suppression a 10-post window.

Recent titles are also passed to the model so it picks a different angle on artists that have appeared before.

### Breaking news

Each run reads the last 48 hours of NME, Rolling Stone and Pitchfork headlines. The model judges whether anything is significant enough — reunions, surprise albums, major deaths, landmark tours — to override the scheduled category.

---

## Image sourcing

Real imagery only on the cron path. If nothing genuine is found the run fails rather than publishing something invented.

| Post type | Primary | Fallback |
|-----------|---------|----------|
| Vinyl Art | iTunes album art (up to 3000×3000) | Deezer cover (1800×1800), then artist photo |
| Music Story / Harmony | Deezer artist photo | Spotify artist photo, then iTunes album art |

Matching is strict, because every provider returns fuzzy, popularity-ranked results:

- Names compare **exactly** after folding accents, ampersands and punctuation, so `R.E.M.` and `Earth, Wind & Fire` still match. A credited variant that extends the name (`Bruce Springsteen & The E Street Band`) is allowed; a shorter one is not.
- Among genuine matches, the **most-followed wins**. Different acts share names — searching "Oasis" returns four artists called Oasis, and the providers do not rank the famous one first.
- Search limits are wide (25) because the real act is often outside the top five.
- Album titles are **scored**, ties going to the shortest, so originals beat deluxe reissues.
- A variant sleeve — single, EP, live or instrumental — is rejected while the other provider might still have the studio record. Markers already in the requested title do not count, so "Live at Leeds" still matches itself.

iTunes has genuine catalogue gaps (*Nevermind*, *The Dark Side of the Moon* and *Appetite for Destruction* return only tribute records), which is why Deezer backs it for artwork.

A credit line is added to the caption naming the real source, `@applemusic` or `@deezer`.

---

## Tagging

The model returns an `instagramHandle` for the artist and 1–2 `tagAccounts` for music media outlets.

**The artist is tagged** when the handle can be tied back to their name. Handles cannot be verified — looking up an arbitrary username needs `business_discovery`, which this token does not carry — so an invented handle would tag an uninvolved stranger twice a day. The guard is deliberately strict: it accepts `pinkfloyd`, `thebeatles`, `remhq`, and rejects `radio` for Radiohead or `young` for Neil Young. It also skips genuine surname handles like `@springsteen`; losing a tag is cheaper than notifying a stranger.

**Media outlets are not tagged** unless `TAG_MEDIA_ACCOUNTS=true`. Tagging outlets on posts they have no connection to is engagement bait that risks down-ranking the account.

`collaborators` is deliberately unused — those are invitations the other account must accept.

---

## Storage

Posts live one per Redis key, ordered by a sorted set scored on `createdAt`, capped at 500. Writing a post touches only that post; reads take the window they need.

An earlier layout kept every post in a single JSON array, so each save rewrote the whole history — about 6MB of traffic per cron run at 455 posts, growing without bound, and prone to one run silently discarding another's post. Migration from that layout runs once on first access and leaves the legacy `musicledge:posts` key in place as a backup.

Without Redis env vars the app falls back to in-memory storage.

---

## Cron schedule

Configured in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron",     "schedule": "30 8,11 * * *" },
    { "path": "/api/watchdog", "schedule": "30 9,12 * * *" }
  ]
}
```

Posting slots are 08:30 and 11:30 UTC, chosen to land on the audience's two strongest activity windows. Vercel cron is UTC-only, so these drift by an hour relative to UK local time across the DST boundary.

The watchdog runs an hour after each slot with a 3-hour staleness threshold: a healthy run shows a post about an hour old, a missed slot shows roughly 22 hours and is retried the same day.

**Cron schedules only update on a production deployment.**

To trigger manually:

```bash
curl -X POST https://musicledge.vercel.app/api/cron
```

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Gemini 2.5 Pro — default content generation |
| `AI_PROVIDER` | `gemini` (default) or `claude` |
| `ANTHROPIC_API_KEY` | Claude — used when `AI_PROVIDER=claude` |
| `OPENAI_API_KEY` | DALL·E 3 — dashboard image fallback only |
| `INSTAGRAM_ACCOUNT_ID` | Instagram Business/Creator account ID |
| `FACEBOOK_USER_TOKEN` | Long-lived Meta user token used for all publishing |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Token debugging and refresh |
| `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_ACCESS_TOKEN` | Page linkage |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Artist photo and album URL lookup |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `AUTH_SECRET` / `DASHBOARD_PASSWORD` | Dashboard login |
| `CRON_SECRET` | Authenticates Vercel's scheduled GET requests |
| `RESEND_API_KEY` / `ALERT_EMAIL` | Error alert emails |
| `AMAZON_AFFILIATE_TAG` | Amazon Associates tag (optional) |
| `TAG_MEDIA_ACCOUNTS` | Set to `true` to tag media outlets (default off) |
| `TIKTOK_ACCESS_TOKEN` | TikTok posting (optional, unset in production) |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REFRESH_TOKEN` | YouTube Shorts (optional, unset in production) |

Set in production but **no longer read by any code**: `INSTAGRAM_ACCESS_TOKEN`, `SUBSTACK_PUBLICATION_URL`, `SUBSTACK_SID`. Safe to remove.

---

## Access tokens

Publishing uses a long-lived Meta **user** token (`FACEBOOK_USER_TOKEN`), cached in Redis by `lib/meta.ts`. To refresh it:

1. Open the [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select the MusicLedge app
3. Generate a user token with `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`
4. Extend it to a long-lived token via the Access Token Debugger
5. Update `FACEBOOK_USER_TOKEN` in Vercel, then call `/api/token-reset` to clear the cached copy

`/api/token-debug` reports the active token's type, validity, expiry, scopes and Instagram account linkage. Both endpoints bypass the dashboard login.

---

## Local development

```bash
npm install
cp .env.local.example .env.local  # add your API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). FFmpeg ships via `@ffmpeg-installer/ffmpeg`, so no system install is needed.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Hosting | Vercel |
| AI — text | Gemini 2.5 Pro, Claude Opus as an alternative |
| AI — images | DALL·E 3 (dashboard only) |
| Image processing | Sharp + Satori |
| Video | FFmpeg (fluent-ffmpeg) |
| Media storage | Vercel Blob |
| Post storage | Upstash Redis |
| Social | Instagram Graph API v21, TikTok, YouTube Data API v3 |
| Music metadata | iTunes Search API, Deezer API, Spotify Web API |
| Scheduling | Vercel Cron |
| Email alerts | Resend |
| Styling | Tailwind CSS v4 |
