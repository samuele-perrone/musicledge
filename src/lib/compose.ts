import sharp from "sharp";
import { StoryContent } from "@/types";

const WIDTH = 1080;
const HEIGHT = 1080;

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function composeImage(
  imageBase64: string,
  content: StoryContent
): Promise<Buffer> {
  const imageBuffer = Buffer.from(imageBase64, "base64");

  // Resize background to square
  const bg = await sharp(imageBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .toBuffer();

  const storyLines = wrapText(content.story, 38);
  const lineHeight = 52;
  const storyBlockHeight = storyLines.length * lineHeight;
  const overlayHeight = storyBlockHeight + 200; // padding + artist name + title

  const artistSafe = escapeXml(content.artist.toUpperCase());
  const titleSafe = escapeXml(content.title);

  // Build text SVG lines
  const textY = HEIGHT - overlayHeight + 60;
  const storyTextElements = storyLines
    .map(
      (line, i) =>
        `<text x="54" y="${textY + 80 + i * lineHeight}" font-family="Georgia, serif" font-size="36" fill="white" opacity="0.95">${escapeXml(line)}</text>`
    )
    .join("\n");

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <!-- Gradient overlay at bottom -->
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="40%" stop-color="black" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.92"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${HEIGHT - overlayHeight - 100}" width="${WIDTH}" height="${overlayHeight + 100}" fill="url(#grad)"/>

    <!-- Artist name -->
    <text x="54" y="${textY}" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#f59e0b" letter-spacing="4" text-transform="uppercase">${artistSafe}</text>

    <!-- Title -->
    <text x="54" y="${textY + 44}" font-family="Georgia, serif" font-size="42" font-weight="bold" fill="white" font-style="italic">${titleSafe}</text>

    <!-- Story text -->
    ${storyTextElements}

    <!-- Bottom bar -->
    <rect x="0" y="${HEIGHT - 10}" width="${WIDTH}" height="10" fill="#f59e0b"/>
  </svg>`;

  const svgBuffer = Buffer.from(svg);

  const composed = await sharp(bg)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();

  return composed;
}
