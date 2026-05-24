/**
 * Creates a 15-second vertical MP4 video (1080x1920) from a square image buffer.
 * Used for YouTube Shorts and TikTok video format.
 * Uses ffmpeg (installed via @ffmpeg-installer/ffmpeg).
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function createShortsVideo(
  squareImageBuffer: Buffer,
  durationSeconds = 15
): Promise<Buffer> {
  // Convert square 1080x1080 to vertical 1080x1920 with blurred bg
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
  const inputPath = join("/tmp", `frame_${tmpId}.jpg`);
  const outputPath = join("/tmp", `short_${tmpId}.mp4`);

  await writeFile(inputPath, vertical);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-loop 1"])
      .videoCodec("libx264")
      .outputOptions([
        `-t ${durationSeconds}`,
        "-r 1",
        "-pix_fmt yuv420p",
        "-preset ultrafast",
        "-crf 28",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg: ${err.message}`)))
      .run();
  });

  const videoBuffer = await readFile(outputPath);
  await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  return videoBuffer;
}

/**
 * Creates an animated reel video from multiple vertical (1080x1920) image buffers.
 * Each slide is shown for 4 seconds, concatenated with hard cuts.
 * Uses concat filter (FFmpeg 4.1+ compatible — no xfade which requires 4.3+).
 * Total duration ~16 seconds for 4 slides.
 */
export async function createAnimatedReelVideo(
  slideBuffers: Buffer[]
): Promise<Buffer> {
  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const slideDuration = 4;

  // Resize all slides and write to /tmp
  const slidePaths = await Promise.all(
    slideBuffers.map(async (buf, i) => {
      const resized = await sharp(buf)
        .resize(1080, 1920, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();
      const p = join("/tmp", `reel_slide_${tmpId}_${i}.jpg`);
      await writeFile(p, resized);
      return p;
    })
  );

  const outputPath = join("/tmp", `reel_anim_${tmpId}.mp4`);
  const n = slideBuffers.length;

  // Scale each looped image to exactly 1080x1920 @ 24fps, then concat
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
    slidePaths.forEach((p) => {
      cmd = cmd.addInput(p).inputOptions(["-loop 1", `-t ${slideDuration}`]);
    });
    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        "-map [out]",
        "-c:v libx264",
        "-preset fast",
        "-crf 24",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg animated reel: ${err.message}`)))
      .run();
  });

  const videoBuffer = await readFile(outputPath);
  await Promise.allSettled([outputPath, ...slidePaths].map((p) => unlink(p)));
  return videoBuffer;
}

/**
 * Creates a 15-second vertical MP4 video (1080x1920) suitable for Instagram Reels.
 * Accepts an already-composed 1080x1920 story-style image (amber gradient layout).
 * Uses 24fps as required by Instagram's minimum frame rate for Reels.
 */
export async function createReelVideo(
  verticalImageBuffer: Buffer,
  durationSeconds = 15
): Promise<Buffer> {
  // Ensure the frame is exactly 1080x1920 JPEG
  const vertical = await sharp(verticalImageBuffer)
    .resize(1080, 1920, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();

  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputPath = join("/tmp", `reel_frame_${tmpId}.jpg`);
  const outputPath = join("/tmp", `reel_${tmpId}.mp4`);

  await writeFile(inputPath, vertical);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-loop 1"])
      .videoCodec("libx264")
      .outputOptions([
        `-t ${durationSeconds}`,
        "-r 24",
        "-pix_fmt yuv420p",
        "-preset ultrafast",
        "-crf 28",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`ffmpeg: ${err.message}`)))
      .run();
  });

  const videoBuffer = await readFile(outputPath);
  await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  return videoBuffer;
}
