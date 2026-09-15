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

### Retention is the constraint — confirmed across 120 posts

Measured 2026-09-15 over 120 reels published 19 Aug – 15 Sep:

| | |
|---|---|
| Median average watch | **4.8s** |
| Mean | 5.4s |
| Median share of reel watched | **20.1%** |
| Spread | 1.3s – 18.2s |

53% of posts hold the average viewer under five seconds; 89% under eight. The
reel was ~21s: a 3s static title card, two slides, then the follow frame. The
median viewer therefore saw the title card and roughly two seconds of the first
slide, leaving before the story landed and long before a follow prompt they
never reached.

That one fact explains the funnel better than anything else. Across those 120
posts there were 45 saves and 30 shares in total; 89 posts were never saved once.
Nobody stays long enough to act.

**Retention also drives reach here.** Top third by watch time: 8.2s → 437 average
views. Bottom third: 3.1s → 89. A 4.9x difference, so holding attention compounds
into distribution. Caveat: the two highest-retention posts have 13 and 29 views,
where watch time is noise from a handful of people — but the pattern holds in the
solid middle (11.3s → 702 views, 11.3s → 1,375, 10.5s → 1,200).

**Acted on 2026-09-15:** reel length cut from 21.3s to 13.6s, measured end to
end — 2.0s intro instead of 3.0s, slides capped at 4.5s instead of 8s, follow
frame 2.5s. At the median 4.8s watch that lifts the share of the reel seen from
roughly 22% to 35% with no content change.

Rendering the result also exposed a long-standing defect: every segment faded out
to black and the next faded in from it, so each boundary showed about 0.8s of
near-black — roughly 12% of the shortened reel displaying nothing, and a black
frame mid-reel reads as "it ended" to a scrolling viewer. Now hard cuts
throughout.

Next: re-measure in a week. If watch time has not moved, voiceover is the lever.

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
