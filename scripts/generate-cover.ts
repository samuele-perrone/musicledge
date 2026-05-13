/**
 * Generates a Facebook/Instagram cover photo for MusicLedge.
 * Output: cover-photo.jpg (1640x624) in the project root.
 *
 * Run: npx ts-node --skip-project scripts/generate-cover.ts
 */

import OpenAI from "openai";
import sharp from "sharp";
import satori from "satori";
import { createElement as h } from "react";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const W = 1640;
const H = 624;

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log("Generating background image with gpt-image-1...");

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: `Wide panoramic banner for a music history brand called MusicLedge.
    A rich, atmospheric collage of iconic rock and pop music imagery: vintage concert stage lights,
    silhouetted crowd, classic instruments (guitars, microphones, vinyl records, drum kits),
    retro amplifiers. Dark, moody, cinematic. Deep blacks and warm amber/gold tones.
    Vintage editorial illustration style, high contrast, no text, no people faces.
    Horizontal wide format, landscape orientation.`,
    n: 1,
    size: "1536x1024",
    quality: "high",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");

  console.log("Compositing text overlay...");

  const imageBuffer = Buffer.from(b64, "base64");
  const bg = await sharp(imageBuffer)
    .resize(W, H, { fit: "cover", position: "centre" })
    .toBuffer();

  const regularFont = fs.readFileSync(path.join(process.cwd(), "public/fonts/Inter-Regular.ttf"));
  const boldFont = fs.readFileSync(path.join(process.cwd(), "public/fonts/Inter-Bold.ttf"));

  const svg = await satori(
    h(
      "div",
      {
        style: {
          width: W,
          height: H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter",
          background: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.55) 100%)",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          },
        },
        // Amber accent line
        h("div", {
          style: { width: 64, height: 4, background: "#f59e0b", borderRadius: 2 },
        }),
        // Brand name
        h(
          "div",
          {
            style: {
              fontSize: 96,
              fontWeight: 700,
              color: "white",
              letterSpacing: 6,
              textTransform: "uppercase",
            },
          },
          "MUSICLEDGE"
        ),
        // Tagline
        h(
          "div",
          {
            style: {
              fontSize: 28,
              fontWeight: 400,
              color: "rgba(255,255,255,0.75)",
              letterSpacing: 8,
              textTransform: "uppercase",
            },
          },
          "The stories behind the songs"
        ),
        // Amber accent line
        h("div", {
          style: { width: 64, height: 4, background: "#f59e0b", borderRadius: 2 },
        })
      )
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Inter", data: regularFont, weight: 400, style: "normal" },
        { name: "Inter", data: boldFont, weight: 700, style: "normal" },
      ],
    }
  );

  const output = await sharp(bg)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  const outPath = path.join(process.cwd(), "cover-photo.jpg");
  fs.writeFileSync(outPath, output);
  console.log(`\nSaved: ${outPath}`);
  console.log(`Size: ${(output.length / 1024).toFixed(0)} KB`);
  console.log("\nUpload this to Facebook: Page → Edit cover photo");
  console.log("Upload this to Instagram: Edit profile → Edit cover photo (if using channel)");
}

main().catch(console.error);
