import OpenAI from "openai";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function generateImage(prompt: string): Promise<string> {
  const response = await getClient().images.generate({
    model: "dall-e-3",
    prompt: `${prompt}. Style: vintage editorial illustration, high contrast, no text in image, cinematic mood, square format.`,
    n: 1,
    size: "1024x1024",
    quality: "hd",
    response_format: "url",
  });

  const url = response.data?.[0]?.url;
  if (!url) throw new Error("No image URL returned from DALL-E");
  return url;
}

export async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
