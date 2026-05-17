import OpenAI from "openai";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const IMAGE_STYLES = [
  // Style 1: Vintage 35mm film photography
  "Shot on 35mm film, vintage Kodachrome grain, warm amber and faded tones, shallow depth of field, soft natural light, 1970s music photography aesthetic. Photorealistic, like an actual photograph taken at the time. No text, no people, no human figures.",

  // Style 2: Live concert / stage photography
  "Concert stage photography, dramatic colored spotlights, deep shadows, vivid neon lighting, smoke haze, professional photojournalism. Photorealistic, like an actual photograph shot from the pit. No text, no people, no human figures.",

  // Style 3: Moody editorial / studio still life
  "Dark moody studio still life photography, single dramatic key light, deep blacks, rich textures, professional editorial quality, like a Rolling Stone or NME magazine feature photograph. Photorealistic. No text, no people, no human figures.",
];

export type ImageStyle = "vintage" | "concert" | "editorial" | "random";

export const IMAGE_STYLE_LABELS: Record<ImageStyle, string> = {
  vintage: "Vintage Film",
  concert: "Live Concert",
  editorial: "Moody Editorial",
  random: "Random",
};

const STYLE_MAP: Record<Exclude<ImageStyle, "random">, number> = {
  vintage: 0,
  concert: 1,
  editorial: 2,
};

// Fallback prompt used when the original is rejected by the safety system
const SAFE_FALLBACK_PROMPT =
  "Abstract music-inspired still life: vinyl record, guitar pick, sheet music, warm studio lighting. Photorealistic editorial photography. No text, no people, no human figures.";

export async function generateImage(prompt: string, style: ImageStyle = "random"): Promise<string> {
  const idx = style === "random"
    ? Math.floor(Math.random() * IMAGE_STYLES.length)
    : STYLE_MAP[style];
  const selectedStyle = IMAGE_STYLES[idx];

  const client = getClient();

  async function callApi(p: string): Promise<string> {
    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt: p,
      n: 1,
      size: "1024x1024",
      quality: "high",
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned from gpt-image-1");
    return b64;
  }

  try {
    return await callApi(`${prompt}. ${selectedStyle}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("safety system") || msg.includes("400")) {
      console.warn("[imagegen] Safety rejection, retrying with fallback prompt");
      return await callApi(`${SAFE_FALLBACK_PROMPT} ${selectedStyle}`);
    }
    throw err;
  }
}

export async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
