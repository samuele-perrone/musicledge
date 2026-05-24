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
      // Top bar: gradient + centered MUSICLEDGE badge + category + artist
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: "44px 48px 80px 48px",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%)",
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
              display: "flex",
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
              textTransform: "uppercase",
              display: "flex",
            },
          },
          content.category === "vinyl_art" ? "VINYL ART" : content.category === "harmony" ? "HARMONY" : "MUSIC STORY"
        ),
        h(
          "div",
          {
            style: {
              fontSize: 32,
              fontWeight: 700,
              color: "white",
              letterSpacing: 3,
              opacity: 0.9,
              display: "flex",
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
 * Composes a 1080×1080 carousel slide (slides 2, 3, 4).
 * Layout: AI image background with heavy dark overlay, MUSICLEDGE badge top-left,
 * large centred slide text, accent strip + slide dots at the bottom.
 */
export async function composeCarouselSlide(
  imageBase64: string,
  content: StoryContent,
  slideText: string,
  slideIndex: number,   // 1-based: slide 2 = 2, slide 3 = 3, slide 4 = 4
  totalSlides: number   // 4
): Promise<Buffer> {
  const imageBuffer = Buffer.from(imageBase64, "base64");

  const bg = await sharp(imageBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .toBuffer();

  const regularFont = loadFontBuffer("Inter-Regular.ttf");
  const boldFont = loadFontBuffer("Inter-Bold.ttf");

  const accent =
    content.category === "vinyl_art"
      ? "#0891b2"
      : content.category === "harmony"
      ? "#a855f7"
      : "#f59e0b";

  const categoryLabel =
    content.category === "vinyl_art"
      ? "VINYL ART"
      : content.category === "harmony"
      ? "HARMONY"
      : "MUSIC STORY";

  // Build slide dots: solid accent circle for current slide, dim white for others
  const dots = Array.from({ length: totalSlides }, (_, i) => {
    const isCurrent = i + 1 === slideIndex;
    return h("div", {
      key: i,
      style: {
        width: 10,
        height: 10,
        borderRadius: 5,
        background: isCurrent ? accent : "rgba(255,255,255,0.35)",
      },
    });
  });

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
      // Top-left: MUSICLEDGE badge + category label
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "36px 40px 60px 40px",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%)",
          },
        },
        h(
          "div",
          {
            style: {
              background: accent,
              borderRadius: 4,
              padding: "7px 16px",
              fontSize: 22,
              fontWeight: 700,
              color:
                content.category === "vinyl_art" || content.category === "harmony"
                  ? "white"
                  : "black",
              letterSpacing: 2,
              display: "flex",
            },
          },
          "MUSICLEDGE"
        ),
        h(
          "div",
          {
            style: {
              fontSize: 16,
              fontWeight: 700,
              color: accent,
              letterSpacing: 4,
              textTransform: "uppercase",
              display: "flex",
            },
          },
          categoryLabel
        )
      ),
      // Centre: large bold slide text
      h(
        "div",
        {
          style: {
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 56px",
          },
        },
        h(
          "div",
          {
            style: {
              fontSize: 52,
              fontWeight: 700,
              color: "white",
              textAlign: "center",
              lineHeight: 1.2,
            },
          },
          slideText
        )
      ),
      // Bottom: accent strip + row with artist name left + slide dots right
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)",
            padding: "60px 40px 0 40px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 20,
            },
          },
          h(
            "div",
            {
              style: {
                fontSize: 20,
                fontWeight: 700,
                color: "rgba(255,255,255,0.85)",
                letterSpacing: 3,
                textTransform: "uppercase",
              },
            },
            content.artist
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
              },
            },
            ...dots
          )
        ),
        h("div", {
          style: {
            height: 8,
            background: accent,
            marginLeft: -40,
            marginRight: -40,
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

  // Dark overlay composite
  const overlayBuffer = Buffer.from(svg);

  // Create a dark overlay layer
  const darkOverlay = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.78 },
    },
  })
    .png()
    .toBuffer();

  return sharp(bg)
    .composite([
      { input: darkOverlay, top: 0, left: 0 },
      { input: overlayBuffer, top: 0, left: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Composes a full-bleed 1080×1920 vertical reel slide.
 * Layout: MUSICLEDGE badge top, text centered, artist name (Bebas Neue) at bottom.
 */
export async function composeStorySlide(
  imageBase64: string,
  content: StoryContent,
  slideText: string,
  slideIndex: number,  // 1-based
  totalSlides: number  // excluding follow slide
): Promise<Buffer> {
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const bg = await sharp(imageBuffer)
    .resize(STORY_W, STORY_H, { fit: "cover" })
    .toBuffer();

  const regularFont = loadFontBuffer("Inter-Regular.ttf");
  const boldFont = loadFontBuffer("Inter-Bold.ttf");
  const bebasFont = loadFontBuffer("BebasNeue-Regular.ttf");

  const accent = content.category === "vinyl_art" ? "#0891b2" : content.category === "harmony" ? "#a855f7" : "#f59e0b";
  const categoryLabel = content.category === "vinyl_art" ? "VINYL ART" : content.category === "harmony" ? "HARMONY" : "MUSIC STORY";
  const badgeTextColor = content.category === "music_story" ? "black" : "white";

  const dots = Array.from({ length: totalSlides }, (_, i) =>
    h("div", {
      key: i,
      style: {
        width: 12, height: 12, borderRadius: 6,
        background: i + 1 === slideIndex ? "white" : "rgba(255,255,255,0.3)",
      },
    })
  );

  const svg = await satori(
    h("div", {
      style: {
        width: STORY_W, height: STORY_H,
        display: "flex", flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "Inter",
      },
    },
      // Top: MUSICLEDGE badge + category (centered)
      h("div", {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          padding: "56px 52px 80px 52px",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)",
        },
      },
        h("div", {
          style: {
            background: accent, borderRadius: 8, padding: "20px 36px",
            fontSize: 56, fontWeight: 700, color: badgeTextColor, letterSpacing: 2,
            display: "flex",
          },
        }, "MUSICLEDGE"),
        h("div", {
          style: {
            fontSize: 34, fontWeight: 700, color: accent,
            letterSpacing: 3, textTransform: "uppercase",
            display: "flex",
          },
        }, categoryLabel)
      ),

      // Center: slide dots + text (Inter Bold)
      h("div", {
        style: {
          flex: 1,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "0 72px",
          gap: 32,
        },
      },
        h("div", {
          style: { display: "flex", flexDirection: "row", gap: 12, alignItems: "center" },
        }, ...dots),
        h("div", {
          style: {
            fontSize: 68, fontWeight: 700,
            color: "white", textAlign: "center", lineHeight: 1.2,
          },
        }, slideText)
      ),

      // Bottom: artist name in Bebas Neue
      h("div", {
        style: {
          display: "flex", flexDirection: "row",
          justifyContent: "space-between", alignItems: "flex-end",
          padding: "80px 52px 80px 52px",
          background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
        },
      },
        h("div", {
          style: {
            fontFamily: "BebasNeue",
            fontSize: 80, fontWeight: 400, color: "white",
            letterSpacing: 4, lineHeight: 1,
          },
        }, content.artist.toUpperCase())
      )
    ),
    {
      width: STORY_W, height: STORY_H,
      fonts: [
        { name: "Inter", data: regularFont, weight: 400, style: "normal" },
        { name: "Inter", data: boldFont, weight: 700, style: "normal" },
        { name: "BebasNeue", data: bebasFont, weight: 400, style: "normal" },
      ],
    }
  );

  // Dark overlay so centered text is readable against any photo
  const darkOverlay = await sharp({
    create: { width: STORY_W, height: STORY_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.50 } },
  }).png().toBuffer();

  const overlayBuffer = Buffer.from(svg);
  return sharp(bg)
    .composite([{ input: darkOverlay }, { input: overlayBuffer }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Converts a 1080×1080 square slide buffer into a 1080×1920 vertical frame
 * suitable for use in animated reels.
 * Background: blurred/darkened stretch of the square; foreground: centred 960×960.
 */
export async function makeVerticalSlide(squareBuffer: Buffer): Promise<Buffer> {
  const blurredBg = await sharp(squareBuffer)
    .resize(1080, 1920, { fit: "cover" })
    .blur(18)
    .modulate({ brightness: 0.55 })
    .jpeg({ quality: 70 })
    .toBuffer();

  const centered = await sharp(squareBuffer)
    .resize(960, 960, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Place the 960x960 centred: top offset = (1920 - 960) / 2 = 480, left offset = (1080 - 960) / 2 = 60
  return sharp(blurredBg)
    .composite([{ input: centered, top: 480, left: 60 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Composes a branded 1080×1080 "Follow Us" slide — always the last carousel slide.
 * Pure gradient background matching the post's category accent colour.
 */
export async function composeFollowSlide(content: StoryContent): Promise<Buffer> {
  const accent      = content.category === "vinyl_art" ? "#0891b2" : content.category === "harmony" ? "#a855f7" : "#f59e0b";
  const accentDark  = content.category === "vinyl_art" ? "#0e7490" : content.category === "harmony" ? "#7c3aed" : "#d97706";
  const textColor   = content.category === "vinyl_art" || content.category === "harmony" ? "white" : "black";

  const regularFont = loadFontBuffer("Inter-Regular.ttf");
  const boldFont    = loadFontBuffer("Inter-Bold.ttf");

  const svg = await satori(
    h("div", {
      style: {
        width: WIDTH, height: HEIGHT,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: `linear-gradient(140deg, ${accent} 0%, ${accentDark} 100%)`,
        fontFamily: "Inter",
        gap: 28,
      },
    },
      // Vinyl record icon
      h("div", {
        style: {
          width: 110, height: 110, borderRadius: 55,
          border: "5px solid rgba(255,255,255,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        },
      },
        h("div", { style: { width: 32, height: 32, borderRadius: 16, border: "5px solid rgba(255,255,255,0.35)" } })
      ),
      // MUSICLEDGE wordmark
      h("div", { style: { fontSize: 44, fontWeight: 700, color: "white", letterSpacing: 5 } }, "MUSICLEDGE"),
      // Divider
      h("div", { style: { width: 50, height: 3, background: "rgba(255,255,255,0.45)", borderRadius: 2 } }),
      // Call to action
      h("div", {
        style: {
          fontSize: 30, fontWeight: 700, color: "white",
          textAlign: "center", lineHeight: 1.45, padding: "0 90px",
        },
      }, "Follow us for daily music stories, vinyl deep dives & more"),
      // Handle
      h("div", { style: { fontSize: 22, fontWeight: 400, color: "rgba(255,255,255,0.7)", letterSpacing: 2 } }, "@musicledge"),
      // Badge
      h("div", {
        style: {
          marginTop: 12,
          background: "rgba(255,255,255,0.2)",
          borderRadius: 30, padding: "10px 28px",
          fontSize: 18, fontWeight: 700,
          color: "white", letterSpacing: 1,
        },
      }, "New post every day"),
    ),
    {
      width: WIDTH, height: HEIGHT,
      fonts: [
        { name: "Inter", data: regularFont, weight: 400, style: "normal" },
        { name: "Inter", data: boldFont, weight: 700, style: "normal" },
      ],
    }
  );

  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Composes a 1080×1920 vertical follow slide for Story/Reel sequences.
 */
export async function composeFollowSlideVertical(content: StoryContent): Promise<Buffer> {
  const accent      = content.category === "vinyl_art" ? "#0891b2" : content.category === "harmony" ? "#a855f7" : "#f59e0b";
  const accentDark  = content.category === "vinyl_art" ? "#0e7490" : content.category === "harmony" ? "#7c3aed" : "#d97706";
  const regularFont = loadFontBuffer("Inter-Regular.ttf");
  const boldFont    = loadFontBuffer("Inter-Bold.ttf");

  const svg = await satori(
    h("div", {
      style: {
        width: STORY_W, height: STORY_H,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: `linear-gradient(140deg, ${accent} 0%, ${accentDark} 100%)`,
        fontFamily: "Inter", gap: 36,
      },
    },
      h("div", {
        style: {
          width: 130, height: 130, borderRadius: 65,
          border: "5px solid rgba(255,255,255,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        },
      },
        h("div", { style: { width: 38, height: 38, borderRadius: 19, border: "5px solid rgba(255,255,255,0.35)" } })
      ),
      h("div", { style: { fontSize: 52, fontWeight: 700, color: "white", letterSpacing: 5 } }, "MUSICLEDGE"),
      h("div", { style: { width: 60, height: 3, background: "rgba(255,255,255,0.45)", borderRadius: 2 } }),
      h("div", {
        style: {
          fontSize: 36, fontWeight: 700, color: "white",
          textAlign: "center", lineHeight: 1.5, padding: "0 100px",
        },
      }, "Follow us for daily music stories, vinyl deep dives & more"),
      h("div", { style: { fontSize: 26, fontWeight: 400, color: "rgba(255,255,255,0.75)", letterSpacing: 2 } }, "@musicledge"),
      h("div", {
        style: {
          marginTop: 16, background: "rgba(255,255,255,0.2)",
          borderRadius: 40, padding: "14px 36px",
          fontSize: 22, fontWeight: 700, color: "white", letterSpacing: 1,
        },
      }, "New post every day")
    ),
    {
      width: STORY_W, height: STORY_H,
      fonts: [
        { name: "Inter", data: regularFont, weight: 400, style: "normal" },
        { name: "Inter", data: boldFont, weight: 700, style: "normal" },
      ],
    }
  );

  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
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

/**
 * Vinyl Art intro slide (1080×1920): full-bleed album art, no badge or overlay,
 * just the title in large Bebas Neue at the very bottom with 20px bottom padding.
 */
export async function composeVinylIntroSlide(
  imageBase64: string,
  content: StoryContent
): Promise<Buffer> {
  const bg = await sharp(Buffer.from(imageBase64, "base64"))
    .resize(STORY_W, STORY_H, { fit: "cover" })
    .jpeg({ quality: 92 })
    .toBuffer();

  const bebasFont = loadFontBuffer("BebasNeue-Regular.ttf");

  const svg = await satori(
    h("div", {
      style: {
        width: STORY_W, height: STORY_H,
        display: "flex", flexDirection: "column",
        justifyContent: "flex-end",
        fontFamily: "BebasNeue",
      },
    },
      h("div", {
        style: {
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)",
          padding: "120px 52px 20px 52px",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
        },
      },
        h("div", {
          style: {
            fontSize: 116, fontWeight: 400, color: "white",
            lineHeight: 1.05, letterSpacing: 2,
          },
        }, content.title)
      )
    ),
    {
      width: STORY_W, height: STORY_H,
      fonts: [{ name: "BebasNeue", data: bebasFont, weight: 400, style: "normal" }],
    }
  );

  return sharp(bg)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
