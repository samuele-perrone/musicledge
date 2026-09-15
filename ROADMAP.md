# MusicLedge — Roadmap

Last updated 2026-09-15.

## The one number

**21,087 people watched a reel in the 30 days to 2026-09-14. 44 visited the profile.**
That is 0.21%, and it produced 204 followers from 455 posts.

Reach is not the constraint — the account pulls ~33k views a month. Conversion is.
Every priority below follows from that.

Full baseline: 33,336 views · 21,087 viewers · 97.4% non-followers · 627
interactions · 484 accounts engaged. Best post of the period (ZZ Top, 2,339
views) earned 59 likes, 3 saves, 0 shares, 1 profile visit and **1 follower**.

Likes are healthy. Everything that costs a viewer something is near zero. The
content is consumed and forgotten.

---

## What shipped on 14–15 September

Two distinct kinds of work. Worth keeping separate, because only one of them
can move the number above.

### Repairs — stop the bleeding

| Problem | State before |
|---|---|
| Deduplication | Effectively 3 posts deep; the same artist could return within a week |
| Image sourcing | Wrong artist entirely on 9 of 17 colliding names — Queen resolved to a 135-fan namesake, not the 12.8M-fan band |
| Cadence | 4 near-identical posts a day |
| Watchdog | Fired every night, injecting an unscheduled 3:30am post |
| Redis | Rewrote the entire ~1MB post history on every save, unbounded |
| Publishing | A failed publish was indistinguishable from a success in the logs |
| Profile | Carried a self-applied "AI-generated profile" label it did not need |

None of this grows anything. It stops known losses.

### Bets — unproven attempts at conversion

- **Title rules.** The model had converged on "The \<noun\> That Built \<thing\>"
  for most of 455 posts. Banned, with a detector that logs any relapse.
- **Hook first.** The opening frame led with a brand badge; the title — the actual
  hook — was fourth in reading order, at the moment retention is decided.
- **Six named series** on fixed weekly slots, so a viewer has a reason to expect
  the next post will interest them.

---

## Phase 1 — measure, change nothing (now → ~28 September)

Everything changed at once, so attribution is impossible this round. That is
acceptable; Phase 2 fixes it permanently. What matters now is **not adding
variables**.

The tell:

- **Profile-visit rate moves off 0.21%** → the funnel is unblocking, continue
- **Views recover but visits stay flat** → the problem is the content, and the
  three bets did not land

### The one change worth making during Phase 1

**The profile grid is the conversion surface, and it is still 456 posts of the
old formula.** Those 44 visitors landed on a wall of riddle titles and
wrong-artist photos.

At two posts a day it takes roughly two months for the visible grid to fill with
the current standard. Either wait it out, or archive the weakest of the back
catalogue so the grid reflects the current quality immediately. Archiving is
reversible and native to Instagram.

This is the only lever that improves conversion today rather than in two months.

---

## Phase 2 — stop guessing — DONE 2026-09-15

**The performance feedback loop shipped.** The `instagram_manage_insights` scope
was added, and nine metrics came back: views, reach, likes, comments, saved,
shares, total_interactions, `ig_reels_avg_watch_time` and
`ig_reels_video_view_total_time`. The 1,000-follower limit does not apply at 204.

**Correction to earlier guidance.** The stated objective was "saves, shares and
follows". `follows` and `profile_visits` are **not available per post** for
reels — the API supports them only at account level. The objective is therefore
**retention, then saves and shares. Never likes**, which sit near 3% and have
produced almost nothing.

Retention leads for a practical reason as much as a principled one: it is the
only metric with continuous variation. Saves and shares are so rare here — the
best post of a month drew 3 saves and 0 shares — that ranking on them alone
leaves nearly every post tied at zero.

Each cron run now refreshes metrics for a window of recent posts, and feeds the
five best and five worst measured posts into the generation prompt as raw
numbers. It refuses to do so until enough posts carry metrics, and ignores posts
below 40 reach so a post seen by nine people cannot dominate a rate-based
ranking.

### The finding that may reframe everything

First measured post (Judas Priest, 15 Sept): **4.9 seconds average watch on a
~24 second reel** — roughly a fifth. Viewers are leaving within a second or two
of the hook card finishing.

One post, four hours old, 49 views, so treat it as a signal and not a
conclusion. But if it holds across the catalogue, the binding constraint is
**retention**, not reach and not the follow prompt. It would also explain the
funnel better than anything else: people who leave at 5 seconds never reach the
closing slide, never save, and never share.

Watch this across the fortnight. It is the number that decides Phase 3.

---

## Phase 3 — led by the data, not by taste

Candidates, in current order:

1. **Voiceover / TTS.** Silent text slideshows are the weakest reel format going.
   Parked on 2026-09-14 partly because there was no retention data. There is now,
   and the first reading is poor — see Phase 2. If ~5s average watch holds, this
   stops being a nice-to-have and becomes the main lever.
2. **Lyrics Deep Dive** as a seventh series — where a song's lyrics draw from
   history, biography, mythology or politics, with a rating for how directly they
   map to the source. Predates the series architecture but now costs one prompt
   spec and a colour in `lib/series.ts`.
3. **Fewer, better posts.** If the data says quality beats volume, one a day is a
   legitimate answer.

---

## The decision point

Around 28 September there is a real fork. If profile visits have not moved, the
conclusion is not "try harder". It is that a fully automated pipeline may not
reliably produce content people **save and share**.

The two best posts on the account were a funny contradiction ("The Drummer Who
Actually Had No Beard", 63 interactions) and a real opinion ("Blackmore Hated
Deep Purple Farewell", 48). Both had human texture. The bot can reach that — the
Judas Priest post on 15 September did — but whether it does so *consistently* is
precisely what the next fortnight tests.

Worth naming now so it is a decision rather than a drift.

---

## Known, accepted, not bugs

- **Spotify returns 403 on everything.** Diagnosed 2026-09-15: *"Active premium
  subscription required for the owner of the app."* The Premium subscription on
  the account owning the Spotify app has lapsed. No code change fixes it. Deezer
  covers everything Spotify did — 208/208 artists, all album artwork — and
  captions fall back to Spotify search URLs. Verify recovery with
  `/api/spotify-debug` if the subscription is ever restored.
- **Four env vars are read by no code** and safe to delete: `FACEBOOK_PAGE_ID`,
  `FACEBOOK_PAGE_ACCESS_TOKEN`, `SUBSTACK_PUBLICATION_URL`, `SUBSTACK_SID`.
- **Instagram publishing requires the Facebook Page link**, because the app uses
  Instagram API with Facebook Login. Migrating to Instagram Login would drop that
  dependency; deferred 2026-09-14 as not worth the work.
