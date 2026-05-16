import Anthropic from "@anthropic-ai/sdk";
import { StoryContent, PostCategory } from "@/types";

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const ARTISTS_POOL = [
  "The Beatles",
  "Led Zeppelin",
  "Pink Floyd",
  "David Bowie",
  "Fleetwood Mac",
  "The Rolling Stones",
  "Queen",
  "Nirvana",
  "Radiohead",
  "Bruce Springsteen",
  "Bob Dylan",
  "Joni Mitchell",
  "Tom Waits",
  "The Velvet Underground",
  "R.E.M.",
  "Talking Heads",
  "Joy Division",
  "The Clash",
  "Blondie",
  "Patti Smith",
  "Neil Young",
  "The Doors",
  "Jimi Hendrix",
  "Janis Joplin",
  "Grateful Dead",
  "The Smiths",
  "Depeche Mode",
  "New Order",
  "Sonic Youth",
  "Pixies",
  "Smashing Pumpkins",
  "Pearl Jam",
  "Soundgarden",
  "Alice in Chains",
  "Foo Fighters",
  "Weezer",
  "Beck",
  "Bjork",
  "PJ Harvey",
  "Kate Bush",
];

function buildMusicStoryPrompt(artist: string): string {
  return `You are creating content for a music history brand across Instagram, Facebook, and a Substack newsletter — similar to @explainingpaintings but for rock and pop music.

Generate a fascinating, lesser-known story about ${artist} — a specific song, album, recording session, or pivotal career moment.

Return ONLY valid JSON with this exact structure:
{
  "category": "music_story",
  "artist": "${artist}",
  "title": "Short punchy title (max 8 words)",
  "story": "2-3 sentences summarising the story, used internally",
  "imageCaption": "One short punchy line for the image overlay — max 55 characters, hooks the viewer instantly",
  "caption": "Instagram/Facebook caption: 2-3 paragraphs with the full story, context, and a question to spark discussion",
  "imagePrompt": "Detailed prompt for an AI image generator: create a photorealistic image evoking the era and mood of this music story — reference the recording studio atmosphere, instruments, stage lighting, or iconic visual symbols associated with this artist's era. Do NOT mention any real person's name. Do NOT depict any human face or figure. Focus on objects, environments, light, color, and mood. High contrast, cinematic, square format.",
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol"],
  "amazonSearchTerms": "3-6 words to search Amazon for the most relevant vinyl record or CD — e.g. Pink Floyd Dark Side Moon vinyl",
  "newsletterTitle": "Email subject line: compelling, 6-10 words, no clickbait",
  "newsletterHtml": "Full newsletter article in HTML (no <html>/<body> tags). 400-600 words. Include: an engaging opening hook, the full story with rich detail and context, why it matters to music history, a closing reflection. Use <p>, <h2>, <strong>, <em> tags. End with a <p> inviting readers to reply with their thoughts."
}`;
}

function buildVinylArtPrompt(artist: string): string {
  return `You are creating content for a music history brand across Instagram, Facebook, and a Substack newsletter — similar to @explainingpaintings but for rock and pop music.

Generate a fascinating, lesser-known story about the album cover artwork or sleeve design of a specific ${artist} record — focusing on the photographer, art director, visual concept, hidden meaning, or behind-the-scenes story of how the artwork was created.

Return ONLY valid JSON with this exact structure:
{
  "category": "vinyl_art",
  "artist": "${artist}",
  "title": "Short punchy title about the artwork (max 8 words)",
  "story": "2-3 sentences summarising the artwork story, used internally",
  "imageCaption": "One short punchy line for the image overlay — max 55 characters, about the artwork",
  "caption": "Instagram/Facebook caption: 2-3 paragraphs telling the full story of the artwork — the design concept, the photographer or artist behind it, hidden details, controversies, or how it was made. End with a question to spark discussion.",
  "imagePrompt": "Detailed prompt for an AI image generator: create a photorealistic still life image that evokes the aesthetic, colour palette, textures, and mood of this specific album cover artwork — reference the visual elements, lighting style, and era without depicting any real person. Focus on objects, surfaces, typography feel, light and shadow. Square format, editorial quality.",
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol", "include AlbumArt VinylCover RecordSleeve"],
  "amazonSearchTerms": "3-6 words to search Amazon for this specific vinyl record — e.g. Pink Floyd Dark Side Moon vinyl",
  "newsletterTitle": "Email subject line about the artwork story: compelling, 6-10 words",
  "newsletterHtml": "Full newsletter article in HTML (no <html>/<body> tags). 400-600 words. Include: an engaging opening hook about the artwork, the full story of how it was conceived and created, why the visual design matters to music history, hidden details listeners might have missed. Use <p>, <h2>, <strong>, <em> tags. End with a <p> inviting readers to reply with their thoughts."
}`;
}

export async function generateStoryContent(
  usedArtists: string[] = [],
  forcedCategory?: PostCategory
): Promise<StoryContent> {
  const available = ARTISTS_POOL.filter((a) => !usedArtists.includes(a));
  const pool = available.length > 0 ? available : ARTISTS_POOL;
  const randomArtist = pool[Math.floor(Math.random() * pool.length)];

  // Use forced category if provided, otherwise 50/50 split
  const category: PostCategory = forcedCategory ?? (Math.random() < 0.5 ? "music_story" : "vinyl_art");
  const prompt = category === "vinyl_art"
    ? buildVinylArtPrompt(randomArtist)
    : buildMusicStoryPrompt(randomArtist);

  const response = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse Claude response as JSON");

  const content = JSON.parse(jsonMatch[0]) as StoryContent;
  // Ensure category is always set correctly
  content.category = category;
  return content;
}

export function buildAffiliateUrl(searchTerms: string): string {
  const tag = process.env.AMAZON_AFFILIATE_TAG;
  const encoded = searchTerms.trim().replace(/\s+/g, "+");
  const base = `https://www.amazon.com/s?k=${encoded}`;
  return tag ? `${base}&tag=${tag}` : base;
}
