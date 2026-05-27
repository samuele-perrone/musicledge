/**
 * Video composition utilities.
 *
 * createKaraokeReelVideo — per-slide photo backgrounds with Ken Burns zoompan,
 *   word-by-word karaoke highlighting, and 0.3s cross-fade transitions.
 *   Renders one FFmpeg segment per section then concatenates.
 *
 * createAnimatedReelVideo — simple hard-cut concat of pre-composed slides (legacy).
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import satori from "satori";
import { createElement as h } from "react";
import fs from "fs";
import pathModule from "path";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ─── Audio helpers ────────────────────────────────────────────────────────────

/**
 * Picks a random .mp3 from public/audio/ (if any exist).
 * Returns the absolute path, or null if the directory is empty or missing.
 */
export function findAudioTrack(): string | null {
  const audioDir = pathModule.join(process.cwd(), "public", "audio");
  try {
    const files = fs.readdirSync(audioDir).filter((f) => f.endsWith(".mp3") || f.endsWith(".m4a") || f.endsWith(".aac"));
    if (files.length === 0) return null;
    const pick = files[Math.floor(Math.random() * files.length)];
    return pathModule.join(audioDir, pick);
  } catch {
    return null;
  }
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

type FontEntry = { name: string; data: Buffer; weight: number; style: string };

function loadVFont(filename: string): Buffer {
  return fs.readFileSync(pathModule.join(process.cwd(), "public", "fonts", filename));
}

function loadFonts(): FontEntry[] {
  return [
    { name: "Inter",     data: loadVFont("Inter-Regular.ttf"),    weight: 400, style: "normal" },
    { name: "Inter",     data: loadVFont("Inter-Bold.ttf"),        weight: 700, style: "normal" },
    { name: "BebasNeue", data: loadVFont("BebasNeue-Regular.ttf"), weight: 400, style: "normal" },
  ];
}

function accentInfo(category: string): { accent: string; badgeText: string; label: string; gradient: string } {
  if (category === "vinyl_art")
    return { accent: "#0891b2", badgeText: "white", label: "VINYL ART",   gradient: "linear-gradient(160deg,#0891b2 0%,#0e7490 100%)" };
  if (category === "harmony")
    return { accent: "#a855f7", badgeText: "white", label: "HARMONY",     gradient: "linear-gradient(160deg,#a855f7 0%,#7c3aed 100%)" };
  return   { accent: "#f59e0b", badgeText: "black", label: "MUSIC STORY", gradient: "linear-gradient(160deg,#f59e0b 0%,#d97706 100%)" };
}

// ─── Frame / overlay renderers ────────────────────────────────────────────────

/**
 * Renders the intro frame as a full opaque JPEG (1080×1920):
 * dark background, full photo (no crop) centered, branding above, title/caption below.
 */
async function renderIntroFrame(
  imageBuffer: Buffer,
  content: { artist: string; title: string; category: string; imageCaption?: string },
  fonts: FontEntry[]
): Promise<Buffer> {
  const { accent, badgeText, label } = accentInfo(content.category);

  // Preserve the photo's aspect ratio — cap height so there's room for text
  const meta = await sharp(imageBuffer).metadata();
  const srcW = meta.width ?? 1080;
  const srcH = meta.height ?? 1080;
  const aspect = srcW / srcH;
  const MAX_PHOTO_H = 1200;
  let photoW = 1080;
  let photoH = Math.round(1080 / aspect);
  if (photoH > MAX_PHOTO_H) {
    photoH = MAX_PHOTO_H;
    photoW = Math.round(MAX_PHOTO_H * aspect);
  }

  const photoResized = await sharp(imageBuffer)
    .resize(photoW, photoH, { fit: "cover" })
    .jpeg({ quality: 88 })
    .toBuffer();
  const photoDataUrl = `data:image/jpeg;base64,${photoResized.toString("base64")}`;

  const svg = await satori(
    h("div", {
      style: {
        width: 1080, height: 1920,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#0f0f0f",
        fontFamily: "Inter",
      },
    },
      h("div", {
        style: { width: 1080, display: "flex", flexDirection: "column", alignItems: "center" },
      },
        // ── Branding above the photo ───────────────────────────────
        h("div", {
          style: {
            width: 1080,
            display: "flex", flexDirection: "column", alignItems: "flex-start",
            paddingLeft: 60, paddingRight: 60, paddingBottom: 20,
            gap: 8,
          },
        },
          h("div", {
            style: {
              background: accent, borderRadius: 6,
              paddingTop: 10, paddingBottom: 10, paddingLeft: 22, paddingRight: 22,
              display: "flex",
            },
          },
            h("div", {
              style: {
                fontSize: 30, fontWeight: 700, letterSpacing: 2,
                color: badgeText === "black" ? "black" : "white",
              },
            }, "MUSICLEDGE")
          ),
          h("div", {
            style: { fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: 5, display: "flex" },
          }, label),
          h("div", {
            style: {
              fontFamily: "BebasNeue", fontSize: 72, fontWeight: 400,
              color: "white", letterSpacing: 3, display: "flex", lineHeight: 1.0,
            },
          }, content.artist.toUpperCase()),
        ),

        // ── Full photo (no crop) ────────────────────────────────────
        h("img", {
          src: photoDataUrl,
          style: { width: photoW, height: photoH },
        }),

        // ── Title + caption + accent line below the photo ──────────
        h("div", {
          style: { width: 1080, display: "flex", flexDirection: "column" },
        },
          h("div", {
            style: {
              paddingLeft: 60, paddingRight: 60,
              paddingTop: 24,
              paddingBottom: content.imageCaption ? 12 : 20,
              display: "flex",
            },
          },
            h("div", {
              style: { fontSize: 62, fontWeight: 700, color: "white", lineHeight: 1.1 },
            }, content.title)
          ),
          content.imageCaption
            ? h("div", {
                style: { paddingLeft: 60, paddingRight: 60, paddingBottom: 20, display: "flex" },
              },
                h("div", {
                  style: { fontSize: 32, fontWeight: 400, color: "rgba(255,255,255,0.60)", lineHeight: 1.35 },
                }, content.imageCaption)
              )
            : h("div", { style: { display: "flex" } }),
          h("div", { style: { width: 1080, height: 8, background: accent } }),
        )
      )
    ),
    { width: 1080, height: 1920, fonts: fonts as never }
  );

  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

/** Transparent PNG overlay for karaoke word highlighting or plain slide text. */
async function renderWordOverlay(
  words: string[],
  activeIndex: number,
  content: { artist: string; category: string },
  fonts: FontEntry[]
): Promise<Buffer> {
  const { accent, badgeText, label } = accentInfo(content.category);

  // activeIndex === -1 → non-karaoke mode: render all words as a plain text block
  const wordEls = activeIndex === -1
    ? [h("div", {
        style: {
          fontSize: 58, fontWeight: 700, fontFamily: "Inter",
          color: "white", lineHeight: 1.35, textAlign: "center" as const,
          padding: "0 64px",
        },
      }, words.join(" ").toUpperCase())]
    : words.map((word, i) => {
        const isActive = i === activeIndex;
        return h("div", {
          key: String(i),
          style: {
            display: "flex",
            background: isActive ? accent : "transparent",
            borderRadius: 10,
            padding: "6px 18px",
          },
        },
          h("div", {
            style: {
              fontSize: 64, fontWeight: 700, fontFamily: "Inter",
              color: isActive && badgeText === "black" ? "black" : "white",
              lineHeight: 1.15,
            },
          }, word.toUpperCase())
        );
      });

  const svg = await satori(
    h("div", {
      style: {
        width: 1080, height: 1920,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,0,0,0.55)",
        fontFamily: "Inter",
        padding: "60px 0 60px 0",
      },
    },
      h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12 } },
        h("div", {
          style: {
            background: accent, borderRadius: 8, padding: "20px 40px",
            fontSize: 54, fontWeight: 700, color: badgeText, letterSpacing: 2, display: "flex",
          },
        }, "MUSICLEDGE"),
        h("div", { style: { fontSize: 28, fontWeight: 700, color: accent, letterSpacing: 3, display: "flex" } }, label)
      ),

      h("div", {
        style: {
          flex: 1,
          display: "flex", flexWrap: "wrap",
          alignItems: "center", justifyContent: "center", alignContent: "center",
          padding: "32px 72px", gap: 8,
        },
      }, ...wordEls),

      // Artist name on accent bar
      h("div", {
        style: {
          background: accent, borderRadius: 12,
          paddingTop: 18, paddingBottom: 18, paddingLeft: 52, paddingRight: 52,
          display: "flex",
        },
      },
        h("div", {
          style: {
            fontFamily: "BebasNeue", fontSize: 92, fontWeight: 400,
            color: badgeText === "black" ? "black" : "white", letterSpacing: 6,
          },
        }, content.artist.toUpperCase())
      )
    ),
    { width: 1080, height: 1920, fonts: fonts as never }
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Renders the follow slide as a full opaque JPEG (1080×1920).
 * Accent-colour gradient background + dark gradient overlay at bottom for readability.
 */
async function renderFollowFrame(
  category: string,
  fonts: FontEntry[]
): Promise<Buffer> {
  const { accent, gradient } = accentInfo(category);

  const svg = await satori(
    h("div", {
      style: {
        width: 1080, height: 1920,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between",
        background: gradient,
        fontFamily: "Inter",
        padding: "0 0 0 0",
      },
    },
      // Top spacer
      h("div", { style: { flex: 1 } }),

      // Center content
      h("div", {
        style: {
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 40,
        },
      },
        h("div", {
          style: {
            width: 130, height: 130, borderRadius: 65,
            border: "5px solid rgba(255,255,255,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          },
        },
          h("div", { style: { width: 36, height: 36, borderRadius: 18, border: "5px solid rgba(255,255,255,0.5)" } })
        ),
        h("div", { style: { fontSize: 64, fontWeight: 700, color: "white", letterSpacing: 6 } }, "MUSICLEDGE"),
        h("div", { style: { width: 60, height: 4, background: "rgba(255,255,255,0.45)", borderRadius: 2 } }),
        h("div", {
          style: {
            fontSize: 40, fontWeight: 700, color: "white",
            textAlign: "center", lineHeight: 1.5, padding: "0 100px",
          },
        }, "Follow for daily music stories & vinyl deep dives"),
        h("div", { style: { fontSize: 32, fontWeight: 400, color: "rgba(255,255,255,0.75)", letterSpacing: 3 } }, "@musicledge")
      ),

      // Bottom: dark gradient strip for readability
      h("div", {
        style: {
          flex: 1, width: 1080,
          background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          paddingBottom: 60,
        },
      },
        h("div", {
          style: {
            background: accent, borderRadius: 40, padding: "14px 40px",
            fontSize: 24, fontWeight: 700, color: "white", letterSpacing: 1,
          },
        }, "New post every day")
      )
    ),
    { width: 1080, height: 1920, fonts: fonts as never }
  );

  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

// ─── FFmpeg segment renderers ─────────────────────────────────────────────────

const FADE_DUR = 0.4;

/**
 * Renders a static (looped single-frame) segment.
 * Used for the intro slide which is already fully composed as a JPEG.
 */
async function renderStaticSegment(
  frameBuffer: Buffer,
  duration: number,
  opts: { fadeIn: boolean; fadeOut: boolean },
  tmpId: string,
  label: string
): Promise<string> {
  const framePath  = join("/tmp", `${label}_frame_${tmpId}.jpg`);
  const outputPath = join("/tmp", `${label}_seg_${tmpId}.mp4`);
  await writeFile(framePath, frameBuffer);

  const vfParts: string[] = [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    "setsar=1",
    "fps=24",
  ];
  if (opts.fadeIn)  vfParts.push(`fade=t=in:st=0:d=${FADE_DUR}`);
  if (opts.fadeOut) vfParts.push(`fade=t=out:st=${(duration - FADE_DUR).toFixed(3)}:d=${FADE_DUR}`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .addInput(framePath)
      .inputOptions(["-loop 1", `-t ${duration}`])
      .videoFilter(vfParts)
      .outputOptions(["-c:v libx264", "-preset fast", "-crf 24", "-pix_fmt yuv420p", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg static [${label}]: ${err.message}`)))
      .run();
  });

  await unlink(framePath).catch(() => {});
  return outputPath;
}

/**
 * Renders a zoompan+overlay segment.
 * The background photo gets a Ken Burns zoom; transparent PNG overlays are
 * composited on top from a concat list.
 */
async function renderZoompanSegment(
  bgBuffer: Buffer,
  overlayEntries: { path: string; duration: number }[],
  opts: { fadeIn: boolean; fadeOut: boolean; kbX: string; kbY: string },
  tmpId: string,
  label: string
): Promise<string> {
  const bgPath     = join("/tmp", `${label}_bg_${tmpId}.jpg`);
  const concatPath = join("/tmp", `${label}_ol_${tmpId}.txt`);
  const outputPath = join("/tmp", `${label}_seg_${tmpId}.mp4`);

  const bgResized = await sharp(bgBuffer)
    .resize(1080, 1920, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer();
  await writeFile(bgPath, bgResized);

  const segDuration = overlayEntries.reduce((s, e) => s + e.duration, 0);

  const concatLines = ["ffconcat version 1.0"];
  for (const e of overlayEntries) {
    concatLines.push(`file '${e.path}'`);
    concatLines.push(`duration ${e.duration.toFixed(3)}`);
  }
  concatLines.push(`file '${overlayEntries[overlayEntries.length - 1].path}'`);
  await writeFile(concatPath, concatLines.join("\n"));

  const fd = Math.min(FADE_DUR, segDuration * 0.3);
  const hasFade  = opts.fadeIn || opts.fadeOut;
  const olOut    = hasFade ? "[tmp]" : "[out]";
  const fadeParts: string[] = [];
  if (opts.fadeIn)  fadeParts.push(`fade=t=in:st=0:d=${fd.toFixed(3)}`);
  if (opts.fadeOut) fadeParts.push(`fade=t=out:st=${(segDuration - fd).toFixed(3)}:d=${fd.toFixed(3)}`);
  const fadeChain = hasFade ? `;[tmp]${fadeParts.join(",")}[out]` : "";

  const filterComplex =
    `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
    `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
    `zoompan=z='min(zoom+0.0006\\,1.08)':x='${opts.kbX}':y='${opts.kbY}':d=1:s=1080x1920:fps=24[bg];` +
    `[1:v]scale=1080:1920,setsar=1[ol];` +
    `[bg][ol]overlay=format=auto:shortest=1${olOut}` +
    fadeChain;

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .addInput(bgPath)
      .inputOptions(["-loop 1", `-t ${Math.ceil(segDuration + 2)}`])
      .addInput(concatPath)
      .inputOptions(["-f concat", "-safe 0"])
      .complexFilter(filterComplex)
      .outputOptions(["-map [out]", "-c:v libx264", "-preset fast", "-crf 24", "-pix_fmt yuv420p", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg zoompan [${label}]: ${err.message}`)))
      .run();
  });

  await Promise.allSettled([unlink(bgPath), unlink(concatPath)]);
  return outputPath;
}

// Ken Burns anchor points — cycled across content slides
const KB_TARGETS = [
  { x: "iw/2-(iw/zoom/2)",  y: "ih/2-(ih/zoom/2)"   },  // centre
  { x: "0",                  y: "0"                   },  // top-left
  { x: "iw*(1-1/zoom)",      y: "0"                   },  // top-right
  { x: "iw/2-(iw/zoom/2)",  y: "ih*(1-1/zoom)"        },  // bottom-centre
];

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Creates a karaoke-style reel video:
 *   1. Intro  — gradient bg, centered photo card, branding overlay (static, fade-out)
 *   2. Slides — per-slide background photo with Ken Burns + word-by-word highlight
 *   3. Follow — background photo + CTA overlay (fade-in)
 *
 * `imageBuffers[0]` is used for the intro card.
 * `imageBuffers[1..N]` (cycling) are used as slide backgrounds.
 * Falls back to imageBuffers[0] if fewer images are available.
 */
export async function createKaraokeReelVideo(
  imageBuffers: Buffer[],
  slides: string[],
  content: { artist: string; title: string; category: string; imageCaption?: string },
  audioPath?: string | null,
  karaoke = false
): Promise<Buffer> {
  if (imageBuffers.length === 0) throw new Error("createKaraokeReelVideo: no images provided");

  const tmpId  = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const fonts  = loadFonts();
  const INTRO_DURATION  = 3.0;
  const WORD_DURATION   = 0.40;
  const SLIDE_DURATION  = 5.0;
  const FOLLOW_DURATION = 3.0;

  const segmentPaths: string[] = [];
  const overlayPaths: string[] = [];

  const getBg = (idx: number) => imageBuffers[idx % imageBuffers.length];

  // ── Intro segment ──────────────────────────────────────────────────────────
  const introFrame = await renderIntroFrame(imageBuffers[0], content, fonts);
  const introSeg = await renderStaticSegment(
    introFrame, INTRO_DURATION,
    { fadeIn: false, fadeOut: true },
    tmpId, "intro"
  );
  segmentPaths.push(introSeg);

  // ── Content segments (one per slide) ──────────────────────────────────────
  for (let si = 0; si < slides.length; si++) {
    const words = slides[si].split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const entries: { path: string; duration: number }[] = [];

    if (karaoke) {
      // Word-by-word highlighting
      for (let wi = 0; wi < words.length; wi++) {
        const png = await renderWordOverlay(words, wi, content, fonts);
        const p   = join("/tmp", `kol_s${si}w${wi}_${tmpId}.png`);
        await writeFile(p, png);
        overlayPaths.push(p);
        entries.push({ path: p, duration: WORD_DURATION });
      }
    } else {
      // All words visible at once for the full slide duration
      const png = await renderWordOverlay(words, -1, content, fonts);
      const p   = join("/tmp", `kol_s${si}_${tmpId}.png`);
      await writeFile(p, png);
      overlayPaths.push(p);
      entries.push({ path: p, duration: SLIDE_DURATION });
    }

    const kb  = KB_TARGETS[si % KB_TARGETS.length];
    // Slide backgrounds cycle from index 1 onwards so intro image is separate
    const bgBuf = getBg(si + 1);
    const seg = await renderZoompanSegment(bgBuf, entries, { fadeIn: true, fadeOut: true, kbX: kb.x, kbY: kb.y }, tmpId, `slide${si}`);
    segmentPaths.push(seg);
  }

  // ── Follow segment — accent gradient frame, static ───────────────────────
  const followFrame = await renderFollowFrame(content.category, fonts);
  const followSeg = await renderStaticSegment(
    followFrame, FOLLOW_DURATION,
    { fadeIn: true, fadeOut: false },
    tmpId, "follow"
  );
  segmentPaths.push(followSeg);

  // ── Concat all segments ───────────────────────────────────────────────────
  const concatListPath = join("/tmp", `kfinal_concat_${tmpId}.txt`);
  const outputPath     = join("/tmp", `kreel_${tmpId}.mp4`);

  const concatLines = ["ffconcat version 1.0"];
  for (const p of segmentPaths) concatLines.push(`file '${p}'`);
  await writeFile(concatListPath, concatLines.join("\n"));

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg()
      .addInput(concatListPath)
      .inputOptions(["-f concat", "-safe 0"]);

    if (audioPath) {
      cmd = cmd
        .addInput(audioPath)
        .inputOptions(["-stream_loop -1"])
        .outputOptions([
          "-map 0:v",
          "-map 1:a",
          "-c:v copy",
          "-c:a aac",
          "-b:a 192k",
          "-shortest",
          "-movflags +faststart",
        ]);
    } else {
      cmd = cmd.outputOptions(["-c copy", "-movflags +faststart"]);
    }

    cmd
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg concat: ${err.message}`)))
      .run();
  });

  const videoBuffer = await readFile(outputPath);

  await Promise.allSettled([
    unlink(concatListPath),
    unlink(outputPath),
    ...segmentPaths.map((p) => unlink(p)),
    ...overlayPaths.map((p) => unlink(p)),
  ]);

  return videoBuffer;
}

// ─── Legacy helpers ───────────────────────────────────────────────────────────

export async function createShortsVideo(
  squareImageBuffer: Buffer,
  durationSeconds = 15
): Promise<Buffer> {
  const bgBlurred = await sharp(squareImageBuffer)
    .resize(1080, 1920, { fit: "cover" })
    .blur(20)
    .jpeg({ quality: 60 })
    .toBuffer();

  const overlay = await sharp(squareImageBuffer)
    .resize(1080, 1080, { fit: "contain", background: "#000000" })
    .jpeg({ quality: 90 })
    .toBuffer();

  const vertical = await sharp(bgBlurred)
    .composite([{ input: overlay, gravity: "centre" }])
    .jpeg({ quality: 88 })
    .toBuffer();

  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputPath  = join("/tmp", `frame_${tmpId}.jpg`);
  const outputPath = join("/tmp", `short_${tmpId}.mp4`);
  await writeFile(inputPath, vertical);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-loop 1"])
      .videoCodec("libx264")
      .outputOptions([`-t ${durationSeconds}`, "-r 1", "-pix_fmt yuv420p", "-preset ultrafast", "-crf 28", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg: ${err.message}`)))
      .run();
  });

  const videoBuffer = await readFile(outputPath);
  await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  return videoBuffer;
}

export async function createAnimatedReelVideo(slideBuffers: Buffer[]): Promise<Buffer> {
  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const slideDuration = 4;

  const slidePaths = await Promise.all(
    slideBuffers.map(async (buf, i) => {
      const resized = await sharp(buf).resize(1080, 1920, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
      const p = join("/tmp", `reel_slide_${tmpId}_${i}.jpg`);
      await writeFile(p, resized);
      return p;
    })
  );

  const outputPath = join("/tmp", `reel_anim_${tmpId}.mp4`);
  const n = slideBuffers.length;

  const scaleFilters = slidePaths
    .map((_, i) =>
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${i}]`
    )
    .join(";");

  const concatInputs = slidePaths.map((_, i) => `[v${i}]`).join("");
  const filterComplex =
    n === 1
      ? `[0:v]scale=1080:1920,setsar=1,fps=24[out]`
      : `${scaleFilters};${concatInputs}concat=n=${n}:v=1[out]`;

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg();
    slidePaths.forEach((p) => { cmd = cmd.addInput(p).inputOptions(["-loop 1", `-t ${slideDuration}`]); });
    cmd
      .complexFilter(filterComplex)
      .outputOptions(["-map [out]", "-c:v libx264", "-preset fast", "-crf 24", "-pix_fmt yuv420p", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg animated reel: ${err.message}`)))
      .run();
  });

  const videoBuffer = await readFile(outputPath);
  await Promise.allSettled([outputPath, ...slidePaths].map((p) => unlink(p)));
  return videoBuffer;
}

export async function createReelVideo(verticalImageBuffer: Buffer, durationSeconds = 15): Promise<Buffer> {
  const vertical = await sharp(verticalImageBuffer).resize(1080, 1920, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();

  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputPath  = join("/tmp", `reel_frame_${tmpId}.jpg`);
  const outputPath = join("/tmp", `reel_${tmpId}.mp4`);
  await writeFile(inputPath, vertical);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-loop 1"])
      .videoCodec("libx264")
      .outputOptions([`-t ${durationSeconds}`, "-r 24", "-pix_fmt yuv420p", "-preset ultrafast", "-crf 28", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg: ${err.message}`)))
      .run();
  });

  const videoBuffer = await readFile(outputPath);
  await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  return videoBuffer;
}
