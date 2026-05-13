/**
 * Regenerates Facebook cover and Instagram highlight cover
 * using the amber vinyl-record logo style.
 *
 * Run: npx ts-node --skip-project scripts/generate-covers-v2.ts
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

// Vinyl record icon — reusable component
function VinylIcon(size: number, strokeWidth: number) {
  const inner = size * 0.22;
  return h("div", {
    style: {
      width: size, height: size, borderRadius: size / 2,
      border: `${strokeWidth}px solid white`,
      display: "flex", alignItems: "center", justifyContent: "center",
    },
  },
    h("div", {
      style: {
        width: inner, height: inner, borderRadius: inner / 2,
        border: `${strokeWidth}px solid white`,
      },
    })
  );
}

// ─── 1. FACEBOOK COVER ───────────────────────────────────────────────────────
async function makeFacebookCover() {
  console.log("\n[1/2] Generating Facebook cover...");

  const W = 1640, H = 624;

  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt: `Wide panoramic banner background for a music history brand.
    Warm golden amber tones, lighter and inviting — golden hour concert atmosphere.
    Silhouetted crowd hands reaching up, classic instruments (guitars, microphone, vinyl records)
    in background. Warm amber / sepia palette. NOT dark. Horizontal wide landscape. No text. No faces.`,
    n: 1, size: "1536x1024", quality: "high",
  });
  const bg = Buffer.from(res.data![0].b64_json!, "base64");
  const bgResized = await sharp(bg).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();

  const overlay = await satori(
    h("div", {
      style: {
        width: W, height: H,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Inter",
        background: "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.5) 100%)",
      },
    },
      h("div", {
        style: {
          display: "flex", flexDirection: "row",
          alignItems: "center", gap: 48,
        },
      },
        // Left: vinyl icon
        VinylIcon(140, 6),
        // Divider
        h("div", { style: { width: 2, height: 120, background: "rgba(255,255,255,0.3)" } }),
        // Right: text stack
        h("div", {
          style: { display: "flex", flexDirection: "column", gap: 10 },
        },
          h("div", {
            style: { fontSize: 88, fontWeight: 700, color: "white", letterSpacing: 5, lineHeight: 1 },
          }, "MUSICLEDGE"),
          h("div", {
            style: { fontSize: 24, fontWeight: 400, color: "rgba(255,255,255,0.8)", letterSpacing: 7 },
          }, "THE STORIES BEHIND THE SONGS"),
          // Amber underline
          h("div", { style: { width: 80, height: 4, background: "#f59e0b", borderRadius: 2, marginTop: 4 } }),
        ),
      )
    ),
    { width: W, height: H, fonts: FONTS }
  );

  const out = await sharp(bgResized)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  save(out, "facebook-cover-v2.jpg");
}

// ─── 2. INSTAGRAM HIGHLIGHT COVER ────────────────────────────────────────────
async function makeHighlightCover() {
  console.log("\n[2/2] Generating Instagram highlight cover...");

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
      VinylIcon(220, 8),
      h("div", { style: { height: 24 } }),
      h("div", {
        style: { fontSize: 64, fontWeight: 700, color: "white", letterSpacing: 5 },
      }, "MUSICLEDGE"),
      h("div", { style: { width: 60, height: 4, background: "rgba(255,255,255,0.5)", borderRadius: 2 } }),
      h("div", {
        style: { fontSize: 28, fontWeight: 400, color: "rgba(255,255,255,0.8)", letterSpacing: 4 },
      }, "Stories"),
    ),
    { width: W, height: H, fonts: FONTS }
  );

  const out = await sharp(Buffer.from(overlay)).jpeg({ quality: 95 }).toBuffer();
  save(out, "instagram-highlight-cover-v2.jpg");
}

async function main() {
  console.log("Generating covers with amber vinyl logo style...");
  await makeFacebookCover();
  await makeHighlightCover();
  console.log("\nDone! Files in ./social-assets/");
}

main().catch(console.error);
