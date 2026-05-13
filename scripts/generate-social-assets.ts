/**
 * Generates the full set of MusicLedge social media assets:
 *   - logo.jpg              1080×1080  profile picture (Facebook + Instagram)
 *   - cover-photo.jpg       1640×624   Facebook cover photo
 *   - cover-photo-ig.jpg    1080×608   Instagram channel cover (optional)
 *   - highlight-cover.jpg   1080×1920  Instagram Stories highlight cover template
 *
 * Run: npx ts-node --skip-project scripts/generate-social-assets.ts
 */

import OpenAI from "openai";
import sharp from "sharp";
import satori from "satori";
import { createElement as h } from "react";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const regularFont = fs.readFileSync(path.join(process.cwd(), "public/fonts/Inter-Regular.ttf"));
const boldFont    = fs.readFileSync(path.join(process.cwd(), "public/fonts/Inter-Bold.ttf"));

const FONTS = [
  { name: "Inter", data: regularFont, weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: boldFont,    weight: 700 as const, style: "normal" as const },
];

function save(buffer: Buffer, filename: string) {
  const p = path.join(process.cwd(), "social-assets", filename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buffer);
  console.log(`  ✓ ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function generateBg(prompt: string, size: "1024x1024" | "1536x1024"): Promise<Buffer> {
  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size,
    quality: "high",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return Buffer.from(b64, "base64");
}

// ─── 1. LOGO / PROFILE PICTURE ───────────────────────────────────────────────
async function makeLogo() {
  console.log("\n[1/3] Generating logo background...");

  const bg = await generateBg(
    `Minimal, clean logo background for a music history brand called MusicLedge.
    Warm cream / off-white background with subtle vintage texture.
    Abstract music motifs: a vinyl record groove, a subtle waveform, faint musical staff lines.
    Soft warm tones — cream, warm white, light amber/gold accents.
    No text. No faces. Elegant, editorial, timeless. Square format.`,
    "1024x1024"
  );

  const bgResized = await sharp(bg).resize(1080, 1080, { fit: "cover" }).toBuffer();

  const overlay = await satori(
    h("div", {
      style: {
        width: 1080, height: 1080,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontFamily: "Inter",
        gap: 0,
      },
    },
      // Amber circle backdrop
      h("div", {
        style: {
          width: 580, height: 580,
          borderRadius: 290,
          background: "rgba(245,158,11,0.12)",
          border: "3px solid rgba(245,158,11,0.35)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 18,
        },
      },
        // Big M
        h("div", {
          style: {
            fontSize: 220, fontWeight: 700,
            color: "#1a1a1a", lineHeight: 1,
            letterSpacing: -8,
          },
        }, "M"),
        // Amber divider
        h("div", { style: { width: 80, height: 4, background: "#f59e0b", borderRadius: 2 } }),
        // Brand name
        h("div", {
          style: {
            fontSize: 36, fontWeight: 700,
            color: "#1a1a1a", letterSpacing: 10,
            textTransform: "uppercase",
          },
        }, "MUSICLEDGE"),
        // Tagline
        h("div", {
          style: {
            fontSize: 18, fontWeight: 400,
            color: "#666", letterSpacing: 4,
            textTransform: "uppercase",
          },
        }, "The stories behind the songs"),
      )
    ),
    { width: 1080, height: 1080, fonts: FONTS }
  );

  const out = await sharp(bgResized)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  save(out, "logo.jpg");
}

// ─── 2. FACEBOOK COVER (lighter) ─────────────────────────────────────────────
async function makeFacebookCover() {
  console.log("\n[2/3] Generating Facebook cover background...");

  const W = 1640, H = 624;

  const bg = await generateBg(
    `Wide panoramic banner for a music history brand.
    Warm, lighter tone — amber, golden hour light, warm sepia.
    Vintage concert atmosphere: stage lights from above, silhouetted crowd hands reaching up,
    classic instruments in background (guitars, microphone, vinyl records).
    Warm golden amber tones, NOT dark — bright and inviting yet editorial and cinematic.
    Horizontal wide landscape format. No text. No faces.`,
    "1536x1024"
  );

  const bgResized = await sharp(bg).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();

  const overlay = await satori(
    h("div", {
      style: {
        width: W, height: H,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Inter",
        background: "linear-gradient(to right, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.45) 100%)",
      },
    },
      h("div", {
        style: {
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 14,
        },
      },
        h("div", { style: { width: 56, height: 4, background: "#f59e0b", borderRadius: 2 } }),
        h("div", {
          style: {
            fontSize: 88, fontWeight: 700,
            color: "white", letterSpacing: 6,
          },
        }, "MUSICLEDGE"),
        h("div", {
          style: {
            fontSize: 26, fontWeight: 400,
            color: "rgba(255,255,255,0.85)", letterSpacing: 8,
            textTransform: "uppercase",
          },
        }, "The stories behind the songs"),
        h("div", { style: { width: 56, height: 4, background: "#f59e0b", borderRadius: 2 } }),
      )
    ),
    { width: W, height: H, fonts: FONTS }
  );

  const out = await sharp(bgResized)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  save(out, "facebook-cover.jpg");
}

// ─── 3. INSTAGRAM HIGHLIGHT COVER ────────────────────────────────────────────
async function makeHighlightCover() {
  console.log("\n[3/3] Generating Instagram highlight cover...");

  // Simple branded highlight cover — amber background with a music icon
  const W = 1080, H = 1920;

  const overlay = await satori(
    h("div", {
      style: {
        width: W, height: H,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontFamily: "Inter",
        background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
        gap: 24,
      },
    },
      // Vinyl record icon (pure shapes, no emoji)
      h("div", {
        style: {
          width: 160, height: 160, borderRadius: 80,
          border: "6px solid white",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 8,
        },
      },
        h("div", {
          style: {
            width: 48, height: 48, borderRadius: 24,
            border: "6px solid white",
          },
        })
      ),
      h("div", {
        style: {
          fontSize: 52, fontWeight: 700,
          color: "white", letterSpacing: 4,
          textTransform: "uppercase",
        },
      }, "MUSICLEDGE"),
      h("div", {
        style: {
          fontSize: 28, fontWeight: 400,
          color: "rgba(255,255,255,0.8)", letterSpacing: 2,
        },
      }, "Stories"),
    ),
    { width: W, height: H, fonts: FONTS }
  );

  const out = await sharp(Buffer.from(overlay))
    .jpeg({ quality: 95 })
    .toBuffer();

  save(out, "instagram-highlight-cover.jpg");
}

// ─── RUN ALL ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("Generating MusicLedge social media assets...");
  await makeLogo();
  await makeFacebookCover();
  await makeHighlightCover();
  console.log("\nAll assets saved to: ./social-assets/");
  console.log("\nUpload guide:");
  console.log("  Facebook profile pic  →  logo.jpg (1080×1080)");
  console.log("  Facebook cover        →  facebook-cover.jpg (1640×624)");
  console.log("  Instagram profile pic →  logo.jpg (crop to circle)");
  console.log("  Instagram highlights  →  instagram-highlight-cover.jpg");
}

main().catch(console.error);
