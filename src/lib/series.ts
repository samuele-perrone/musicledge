/**
 * The six named series, plus the general category used when news or an
 * anniversary overrides the schedule.
 *
 * Single source of truth for a series' label, colours and badge contrast. Before
 * this existed the same ternary chain was copy-pasted through compose.ts and
 * video.ts about fifteen times, so adding a category meant finding every one.
 *
 * Why named series at all: 208 artists in free rotation gave a viewer no reason
 * to expect the next post would interest them. Recurring formats on fixed days
 * are something a person can follow.
 */
import type { PostCategory } from "@/types";

export interface SeriesMeta {
  /** Badge text on the reel and cover. */
  label: string;
  accent: string;
  accentDark: string;
  /** Contrast colour for text sitting on `accent`. */
  badgeText: "black" | "white";
  /** One line on what the series covers, used in the dashboard picker. */
  blurb: string;
  emoji: string;
}

export const SERIES: Record<PostCategory, SeriesMeta> = {
  same_riff: {
    label: "SAME RIFF", accent: "#a855f7", accentDark: "#7c3aed", badgeText: "white",
    emoji: "🎸", blurb: "Two songs, one musical idea — nod, influence or theft?",
  },
  sleeve_stories: {
    label: "SLEEVE STORIES", accent: "#0891b2", accentDark: "#0e7490", badgeText: "white",
    emoji: "💿", blurb: "The photographer, the concept, the hidden detail, the lawsuit.",
  },
  band_at_war: {
    label: "BAND AT WAR", accent: "#dc2626", accentDark: "#991b1b", badgeText: "white",
    emoji: "⚔️", blurb: "Who hated whom, and what it cost the record.",
  },
  happy_accident: {
    label: "HAPPY ACCIDENT", accent: "#16a34a", accentDark: "#15803d", badgeText: "white",
    emoji: "🎲", blurb: "Records that exist because something went wrong.",
  },
  ten_minutes_flat: {
    label: "TEN MINUTES FLAT", accent: "#2563eb", accentDark: "#1d4ed8", badgeText: "white",
    emoji: "⏱️", blurb: "Written or recorded absurdly fast, or in a single take.",
  },
  banned: {
    label: "BANNED", accent: "#ea580c", accentDark: "#c2410c", badgeText: "white",
    emoji: "🚫", blurb: "Pulled, censored or refused airplay — and what happened next.",
  },
  music_story: {
    label: "MUSIC STORY", accent: "#f59e0b", accentDark: "#d97706", badgeText: "black",
    emoji: "🎵", blurb: "General format, used when news or an anniversary overrides the schedule.",
  },
};

/** Slugs from before the rebrand. Still on 456 stored posts, so they must still render. */
const LEGACY: Record<string, PostCategory> = {
  vinyl_art: "sleeve_stories",
  harmony: "same_riff",
};

/** Never throws — an unknown slug falls back to the general format rather than breaking a render. */
export function seriesMeta(category: string | undefined | null): SeriesMeta {
  if (!category) return SERIES.music_story;
  if (category in SERIES) return SERIES[category as PostCategory];
  const mapped = LEGACY[category];
  return mapped ? SERIES[mapped] : SERIES.music_story;
}

/** The six series on the rotation. `music_story` is deliberately excluded — it is the override. */
export const ROTATING_SERIES: PostCategory[] = [
  "same_riff", "sleeve_stories", "band_at_war",
  "happy_accident", "ten_minutes_flat", "banned",
];

/**
 * Which series runs in which slot, indexed by UTC weekday (0 = Sunday) then slot
 * (0 = the 08:30 run, 1 = the 11:30 run). Fixed days are the point: a viewer can
 * learn that Tuesday is Banned, which is what makes following worth anything.
 *
 * Twelve of the fourteen weekly slots give each series exactly two. Saturday's
 * pair doubles up on Happy Accident and Band At War because those two formats
 * match the only posts with real evidence behind them — the account's best post
 * was a contradiction (63 interactions) and its second best was a feud (48).
 */
export const WEEKLY_SCHEDULE: Record<number, [PostCategory, PostCategory]> = {
  0: ["same_riff", "happy_accident"],       // Sunday
  1: ["band_at_war", "sleeve_stories"],     // Monday
  2: ["ten_minutes_flat", "banned"],        // Tuesday
  3: ["same_riff", "happy_accident"],       // Wednesday
  4: ["band_at_war", "sleeve_stories"],     // Thursday
  5: ["ten_minutes_flat", "banned"],        // Friday
  6: ["happy_accident", "band_at_war"],     // Saturday
};

/**
 * The series due now. Slot is taken from the hour because the two cron runs are
 * 08:30 and 11:30 UTC; anything before 10:00 is the morning slot.
 */
export function scheduledSeries(now: Date = new Date()): PostCategory {
  const pair = WEEKLY_SCHEDULE[now.getUTCDay()] ?? WEEKLY_SCHEDULE[0];
  return pair[now.getUTCHours() < 10 ? 0 : 1];
}
