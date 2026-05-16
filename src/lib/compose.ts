import sharp from "sharp";
import satori from "satori";
import { createElement as h } from "react";
import fs from "fs";
import path from "path";
import { StoryContent } from "@/types";

const STORY_W = 1080;
const STORY_H = 1920;

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

  // Accent colour: amber for music stories, teal for vinyl art, purple for harmony
  const accent = content.category === "vinyl_art" ? "#0891b2" : content.category === "harmony" ? "#a855f7" : "#f59e0b";

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
              display: "flex",
              flexDirection: "column",
              gap: 8,
            },
          },
          h(
            "div",
            {
              style: {
                background: accent,
                borderRadius: 4,
                padding: "10px 22px",
                fontSize: 30,
                fontWeight: 700,
                color: content.category === "vinyl_art" || content.category === "harmony" ? "white" : "black",
                letterSpacing: 2,
              },
            },
            "MUSICLEDGE"
          ),
          h(
            "div",
            {
              style: {
                fontSize: 20,
                fontWeight: 700,
                color: accent,
                letterSpacing: 4,
                paddingLeft: 4,
                textTransform: "uppercase",
              },
            },
            content.category === "vinyl_art" ? "VINYL ART" : content.category === "harmony" ? "HARMONY" : "MUSIC STORY"
          )
        ),
        h(
          "div",
          {
            style: {
              fontSize: 36,
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
              fontSize: 58,
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
              fontSize: 38,
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
            background: accent,
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

/**
 * Composes a 1080×1920 Instagram Story image.
 * Layout: amber gradient bg → top branding → square post image → bottom text.
 */
export async function composeStory(
  composedImageBuffer: Buffer,
  content: StoryContent
): Promise<Buffer> {
  const regularFont = loadFontBuffer("Inter-Regular.ttf");
  const boldFont    = loadFontBuffer("Inter-Bold.ttf");
  const fonts = [
    { name: "Inter", data: regularFont, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: boldFont,    weight: 700 as const, style: "normal" as const },
  ];

  const artist  = content.artist.toUpperCase();
  const title   = content.title;
  const caption = content.imageCaption || "";
  const storyAccent = content.category === "vinyl_art"
    ? "linear-gradient(160deg, #0891b2 0%, #0e7490 100%)"
    : content.category === "harmony"
    ? "linear-gradient(160deg, #a855f7 0%, #7c3aed 100%)"
    : "linear-gradient(160deg, #f59e0b 0%, #d97706 100%)";

  // Resize the square post image to fill story width with side padding
  const postImageSize = 1000;
  const postImageResized = await sharp(composedImageBuffer)
    .resize(postImageSize, postImageSize, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const postImageB64 = `data:image/jpeg;base64,${postImageResized.toString("base64")}`;

  // Build full story layout in Satori (supports img data URIs)
  const svg = await satori(
    h("div", {
      style: {
        width: STORY_W, height: STORY_H,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between",
        fontFamily: "Inter",
        background: storyAccent,
        padding: "60px 0 70px 0",
      },
    },
      // ── Top branding ──────────────────────────────────────────────
      h("div", {
        style: {
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 16,
        },
      },
        // Vinyl icon
        h("div", {
          style: {
            width: 100, height: 100, borderRadius: 50,
            border: "5px solid white",
            display: "flex", alignItems: "center", justifyContent: "center",
          },
        },
          h("div", { style: { width: 28, height: 28, borderRadius: 14, border: "5px solid white" } })
        ),
        h("div", {
          style: { fontSize: 38, fontWeight: 700, color: "white", letterSpacing: 5 },
        }, "MUSICLEDGE"),
        h("div", {
          style: {
            fontSize: 20, fontWeight: 700,
            color: "rgba(255,255,255,0.85)", letterSpacing: 4,
          },
        }, content.category === "vinyl_art" ? "VINYL ART" : content.category === "harmony" ? "HARMONY" : "MUSIC STORY"),
        h("div", { style: { width: 40, height: 3, background: "rgba(255,255,255,0.5)", borderRadius: 2 } }),
      ),

      // ── Post image ────────────────────────────────────────────────
      h("img", {
        src: postImageB64,
        style: {
          width: postImageSize, height: postImageSize,
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        },
      }),

      // ── Bottom text ───────────────────────────────────────────────
      h("div", {
        style: {
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 12, paddingTop: 8,
        },
      },
        h("div", { style: { width: 40, height: 3, background: "rgba(255,255,255,0.5)", borderRadius: 2 } }),
        h("div", {
          style: {
            fontSize: 22, fontWeight: 700, color: "white",
            letterSpacing: 4, textTransform: "uppercase",
          },
        }, artist),
        h("div", {
          style: {
            fontSize: 34, fontWeight: 700, color: "white",
            textAlign: "center", lineHeight: 1.2,
            paddingLeft: 60, paddingRight: 60,
          },
        }, title),
        h("div", {
          style: {
            fontSize: 22, fontWeight: 400,
            color: "rgba(255,255,255,0.85)",
            textAlign: "center",
            paddingLeft: 60, paddingRight: 60,
          },
        }, caption),
      ),
    ),
    { width: STORY_W, height: STORY_H, fonts }
  );

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 92 })
    .toBuffer();
}
