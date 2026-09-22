/**
 * Spoken narration for reels.
 *
 * Measured over 120 posts, the median viewer watched 4.8s of a ~21s reel. Reels
 * play with sound on by default, so a silent slideshow was fighting the format
 * with the one channel it had switched on doing nothing.
 *
 * Narration also replaces the reading-time estimate that set slide length. That
 * estimate was a word-count guess, and a bad one — it had been clipping slides
 * mid-sentence. A line takes exactly as long as it takes to say.
 *
 * Every failure path returns null rather than throwing. Losing the day's post to
 * a TTS hiccup would be a far worse outcome than a silent reel, and silent is
 * exactly what the caller falls back to.
 */
import OpenAI from "openai";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { promisify } from "util";

const run = promisify(execFile);

/** Gap after each line so beats do not run together. */
const PAD_SECONDS = 0.35;

/** Bed volume under the voice. Low enough to stay out of the way, present enough to avoid dead air. */
const BED_VOLUME = 0.09;

const INSTRUCTIONS =
  "Warm, confident music documentary narrator. Keep it moving, but never rushed. " +
  "Land the facts with quiet authority, slight lift on the surprising detail. " +
  "British-leaning neutral. No hype, no radio-advert energy.";

/**
 * Playback rate. Measured on gpt-4o-mini-tts, which does honour the parameter:
 * a six-second line runs 5.7s at 1.0, 4.9s at 1.15, 4.6s at 1.25 and 3.2s at
 * 1.4 — the last fast enough to sound harried. 1.15 is brisk without it.
 *
 * Clamped because the API accepts up to 4.0, and a typo in an env var should not
 * be able to make every post unlistenable.
 */
function configuredSpeed(): number {
  const raw = Number(process.env.VOICEOVER_SPEED ?? 1.15);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0.8), 1.5) : 1.15;
}

export interface Narration {
  /** Assembled track: every line at its exact offset, silence between. */
  audioPath: string;
  introSeconds: number;
  slideSeconds: number[];
  followSeconds: number;
  /** Temp files for the caller to clean up once the reel is encoded. */
  cleanup: string[];
}

/**
 * Which voice to use, or "off" to skip narration entirely.
 *
 * An env var rather than a constant so the voice can change, and narration can be
 * killed outright, without a deploy — this touches every post the account makes.
 */
function configuredVoice(): string | null {
  const v = (process.env.VOICEOVER_VOICE ?? "fable").trim().toLowerCase();
  return v === "off" || v === "none" || v === "" ? null : v;
}

/** Duration in seconds, read back from ffmpeg's own report. */
async function durationOf(file: string): Promise<number> {
  try {
    await run(ffmpegInstaller.path, ["-i", file]);
    return 0; // ffmpeg exits non-zero when given no output, so success here is unexpected
  } catch (e) {
    const stderr = String((e as { stderr?: string }).stderr ?? "");
    const m = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  }
}

/**
 * Narrates the reel and assembles one track aligned to the slides.
 *
 * Lines are spoken exactly as they appear on screen. Generating separate prose
 * for the ear would read better, but it is another model-written field that can
 * drift from what the viewer is looking at; hearing and reading the same words
 * is worth more than the polish.
 */
export async function narrateReel(
  lines: { hook: string; facts: string[]; follow: string },
  tmpId: string
): Promise<Narration | null> {
  const voice = configuredVoice();
  if (!voice) return null;
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[tts] OPENAI_API_KEY not set — publishing silent");
    return null;
  }
  if (lines.facts.length === 0) return null;

  const script = [lines.hook, ...lines.facts, lines.follow].map((s) => s.trim()).filter(Boolean);
  const created: string[] = [];

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
    const speed = configuredSpeed();

    const durations: number[] = [];
    for (let i = 0; i < script.length; i++) {
      const res = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: voice as "fable",
        input: script[i],
        instructions: INSTRUCTIONS,
        speed,
      });
      const f = join("/tmp", `tts_${tmpId}_${i}.mp3`);
      await writeFile(f, Buffer.from(await res.arrayBuffer()));
      created.push(f);
      const d = await durationOf(f);
      if (d === 0) throw new Error(`could not measure line ${i}`);
      durations.push(d);
    }

    const seg = durations.map((d) => d + PAD_SECONDS);

    // Place each line at its slide's start, so audio and video cannot drift.
    const audioPath = join("/tmp", `tts_${tmpId}_full.mp3`);
    const args: string[] = ["-y", "-loglevel", "error"];
    created.forEach((f) => args.push("-i", f));
    let offset = 0;
    const chains = created.map((_, i) => {
      const ms = Math.round(offset * 1000);
      offset += seg[i];
      return `[${i}:a]adelay=${ms}|${ms}[v${i}]`;
    });
    const labels = created.map((_, i) => `[v${i}]`).join("");
    args.push(
      "-filter_complex",
      `${chains.join(";")};${labels}amix=inputs=${created.length}:duration=longest:normalize=0[a]`,
      "-map", "[a]", audioPath,
    );
    await run(ffmpegInstaller.path, args);
    created.push(audioPath);

    const total = seg.reduce((a, b) => a + b, 0);
    console.log(`[tts] ${voice} @${speed}x: ${script.length} lines, ${total.toFixed(1)}s narration`);

    return {
      audioPath,
      introSeconds: seg[0],
      slideSeconds: seg.slice(1, 1 + lines.facts.length),
      followSeconds: seg[seg.length - 1],
      cleanup: created,
    };
  } catch (e) {
    console.warn(`[tts] failed, publishing silent: ${e instanceof Error ? e.message : e}`);
    await Promise.allSettled(created.map((f) => unlink(f)));
    return null;
  }
}

export { BED_VOLUME };
