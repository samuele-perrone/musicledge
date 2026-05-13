import sharp from "sharp";
import satori from "satori";
import { createElement as h } from "react";
import fs from "fs";

const regularFont = fs.readFileSync("public/fonts/Inter-Regular.ttf");
const boldFont = fs.readFileSync("public/fonts/Inter-Bold.ttf");
const FONTS = [
  { name: "Inter", data: regularFont, weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: boldFont,    weight: 700 as const, style: "normal" as const },
];

const W = 1080, H = 1080;

const svg = await satori(
  h("div", {
    style: {
      width: W, height: H,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Inter",
      background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
      gap: 20,
    },
  },
    h("div", {
      style: {
        width: 200, height: 200, borderRadius: 100,
        border: "7px solid white",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 12,
      },
    },
      h("div", {
        style: { width: 60, height: 60, borderRadius: 30, border: "7px solid white" },
      })
    ),
    h("div", {
      style: { fontSize: 72, fontWeight: 700, color: "white", letterSpacing: 5 },
    }, "MUSICLEDGE"),
    h("div", {
      style: { fontSize: 28, fontWeight: 400, color: "rgba(255,255,255,0.8)", letterSpacing: 3 },
    }, "Stories"),
  ),
  { width: W, height: H, fonts: FONTS }
);

const out = await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
fs.writeFileSync("social-assets/logo-amber.jpg", out);
console.log("Saved: social-assets/logo-amber.jpg");
