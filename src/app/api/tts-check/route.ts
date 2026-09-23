/**
 * Proves narration works on the deployed ffmpeg, without publishing anything.
 *
 * Narration failed on both runs of 2026-09-23 because the assembly filter used
 * amix's `normalize` option, which exists in the ffmpeg build available locally
 * but not in the Linux binary Vercel ships. Every local test passed; production
 * fell back to silent twice before anyone noticed.
 *
 * The lesson is that the audio pipeline cannot be validated on a developer
 * machine, so this runs the real narrateReel against the real binary and reports
 * what happened. It publishes nothing and writes only temp files, which it then
 * deletes.
 *
 * Deliberately short — two lines, a fraction of a cent per call. Delete this
 * route once the audio pipeline has been stable for a while.
 */
import { NextResponse } from "next/server";
import { narrateReel } from "@/lib/tts";
import { unlink } from "fs/promises";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "child_process";
import { promisify } from "util";

const run = promisify(execFile);

export const maxDuration = 120;

export async function GET() {
  // The build identity matters as much as the result: it is the thing that
  // differed from the machine where this was written.
  let ffmpegVersion = "unknown";
  try {
    const { stdout, stderr } = await run(ffmpegInstaller.path, ["-version"]);
    ffmpegVersion = (stdout || stderr).split("\n")[0] ?? "unknown";
  } catch (e) {
    ffmpegVersion = `could not read: ${e instanceof Error ? e.message : e}`;
  }

  const started = Date.now();
  const narration = await narrateReel(
    { hook: "Two things about this test", facts: ["First line"], follow: "Follow for more music stories" },
    `check_${Date.now()}`,
  );
  const elapsedMs = Date.now() - started;

  if (!narration) {
    return NextResponse.json({
      verdict: "FAILED — narration returned null, so posts are publishing silent. The reason is in the [tts] line of this request's runtime log.",
      ffmpegPath: ffmpegInstaller.path,
      ffmpegVersion,
      voice: process.env.VOICEOVER_VOICE ?? "fable (default)",
      speed: process.env.VOICEOVER_SPEED ?? "1.15 (default)",
      elapsedMs,
    }, { status: 500 });
  }

  await Promise.allSettled(narration.cleanup.map((f) => unlink(f)));

  return NextResponse.json({
    verdict: "OK — narration assembled on this build. Reels will publish with voiceover.",
    ffmpegPath: ffmpegInstaller.path,
    ffmpegVersion,
    voice: process.env.VOICEOVER_VOICE ?? "fable (default)",
    speed: process.env.VOICEOVER_SPEED ?? "1.15 (default)",
    introSeconds: narration.introSeconds,
    slideSeconds: narration.slideSeconds,
    followSeconds: narration.followSeconds,
    elapsedMs,
  });
}
