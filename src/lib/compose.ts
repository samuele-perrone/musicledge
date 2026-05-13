import sharp from "sharp";
import fs from "fs";
import path from "path";
import { StoryContent } from "@/types";

const WIDTH = 1080;
const HEIGHT = 1080;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadFont(filename: string): string {
  const fontPath = path.join(process.cwd(), "public", "fonts", filename);
  const fontData = fs.readFileSync(fontPath);
  return fontData.toString("base64");
}

export async function composeImage(
  imageBase64: string,
  content: StoryContent
): Promise<Buffer> {
  const imageBuffer = Buffer.from(imageBase64, "base64");

  const bg = await sharp(imageBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .toBuffer();

  const regularB64 = loadFont("Inter-Regular.ttf");
  const boldB64 = loadFont("Inter-Bold.ttf");

  const artistSafe = escapeXml(content.artist.toUpperCase());
  const titleSafe = escapeXml(content.title);
  const captionSafe = escapeXml(content.imageCaption || "");

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        @font-face {
          font-family: 'Inter';
          font-weight: 400;
          src: url('data:font/truetype;base64,${regularB64}') format('truetype');
        }
        @font-face {
          font-family: 'Inter';
          font-weight: 700;
          src: url('data:font/truetype;base64,${boldB64}') format('truetype');
        }
      </style>
      <!-- Top gradient -->
      <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="black" stop-opacity="0"/>
      </linearGradient>
      <!-- Bottom gradient -->
      <linearGradient id="botGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
      </linearGradient>
    </defs>

    <!-- Top overlay: brand + artist -->
    <rect x="0" y="0" width="${WIDTH}" height="180" fill="url(#topGrad)"/>

    <!-- Brand label -->
    <rect x="48" y="44" width="140" height="32" rx="4" fill="#f59e0b"/>
    <text x="118" y="65" font-family="Inter" font-weight="700" font-size="15" fill="black" text-anchor="middle" letter-spacing="2">MUSICLEDGE</text>

    <!-- Artist name top right -->
    <text x="${WIDTH - 48}" y="68" font-family="Inter" font-weight="700" font-size="22" fill="white" text-anchor="end" letter-spacing="3" opacity="0.9">${artistSafe}</text>

    <!-- Bottom overlay: title + caption -->
    <rect x="0" y="${HEIGHT - 220}" width="${WIDTH}" height="220" fill="url(#botGrad)"/>

    <!-- Title -->
    <text x="48" y="${HEIGHT - 120}" font-family="Inter" font-weight="700" font-size="46" fill="white">${titleSafe}</text>

    <!-- Short caption line -->
    <text x="48" y="${HEIGHT - 64}" font-family="Inter" font-weight="400" font-size="26" fill="white" opacity="0.85">${captionSafe}</text>

    <!-- Amber bottom bar -->
    <rect x="0" y="${HEIGHT - 8}" width="${WIDTH}" height="8" fill="#f59e0b"/>
  </svg>`;

  const svgBuffer = Buffer.from(svg);

  return sharp(bg)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
