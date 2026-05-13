import sharp from "sharp";
import satori from "satori";
import { createElement as h } from "react";
import fs from "fs";
import path from "path";
import { StoryContent } from "@/types";

const WIDTH = 1080;
const HEIGHT = 1080;

function loadFontBuffer(filename: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", "fonts", filename));
}

export async function composeImage(
  imageBase64: string,
  content: StoryContent
): Promise<Buffer> {
  const imageBuffer = Buffer.from(imageBase64, "base64");

  const bg = await sharp(imageBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .toBuffer();

  const regularFont = loadFontBuffer("Inter-Regular.ttf");
  const boldFont = loadFontBuffer("Inter-Bold.ttf");

  const artist = content.artist.toUpperCase();
  const title = content.title;
  const caption = content.imageCaption || "";

  // Satori renders HTML/CSS to SVG using our bundled fonts — no system font needed
  const svg = await satori(
    h(
      "div",
      {
        style: {
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "Inter",
        },
      },
      // Top bar: gradient + MUSICLEDGE badge + artist name
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "44px 48px 80px 48px",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%)",
          },
        },
        h(
          "div",
          {
            style: {
              background: "#f59e0b",
              borderRadius: 4,
              padding: "6px 14px",
              fontSize: 15,
              fontWeight: 700,
              color: "black",
              letterSpacing: 2,
            },
          },
          "MUSICLEDGE"
        ),
        h(
          "div",
          {
            style: {
              fontSize: 22,
              fontWeight: 700,
              color: "white",
              letterSpacing: 3,
              opacity: 0.9,
            },
          },
          artist
        )
      ),
      // Bottom bar: gradient + title + caption + amber strip
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "80px 48px 0 48px",
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
            gap: 10,
          },
        },
        h(
          "div",
          {
            style: {
              fontSize: 46,
              fontWeight: 700,
              color: "white",
              lineHeight: 1.15,
            },
          },
          title
        ),
        h(
          "div",
          {
            style: {
              fontSize: 26,
              fontWeight: 400,
              color: "rgba(255,255,255,0.85)",
              paddingBottom: 24,
            },
          },
          caption
        ),
        h("div", {
          style: {
            height: 8,
            background: "#f59e0b",
            marginLeft: -48,
            marginRight: -48,
          },
        })
      )
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Inter", data: regularFont, weight: 400, style: "normal" },
        { name: "Inter", data: boldFont, weight: 700, style: "normal" },
      ],
    }
  );

  const overlayBuffer = Buffer.from(svg);

  return sharp(bg)
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
