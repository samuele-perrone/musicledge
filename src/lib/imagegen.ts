import OpenAI from "openai";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function generateImage(prompt: string): Promise<string> {
  const response = await getClient().images.generate({
    model: "gpt-image-1",
    prompt: `${prompt}. Style: vintage editorial illustration, high contrast, no text in image, cinematic mood, square format. No real people, no human faces, no human figures — only objects, instruments, environments, and abstract symbols.`,
    n: 1,
    size: "1024x1024",
    quality: "high",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from gpt-image-1");
  return b64;
}

export async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
