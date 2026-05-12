import Anthropic from "@anthropic-ai/sdk";
import { StoryContent } from "@/types";

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

export async function generateStoryContent(
  usedArtists: string[] = []
): Promise<StoryContent> {
  const available = ARTISTS_POOL.filter((a) => !usedArtists.includes(a));
  const pool = available.length > 0 ? available : ARTISTS_POOL;
  const randomArtist = pool[Math.floor(Math.random() * pool.length)];

  const response = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are creating content for an Instagram account similar to @explainingpaintings but for rock and pop music.

Generate a fascinating, lesser-known story about ${randomArtist} — it can be about a specific song, album, recording session, or a pivotal moment in their career.

Return ONLY valid JSON with this exact structure:
{
  "artist": "${randomArtist}",
  "title": "Short punchy title (max 8 words)",
  "story": "The main story text to display on the image (2-3 sentences, max 200 characters — must be concise enough to read at a glance on a phone screen)",
  "caption": "Engaging Instagram caption (2-3 paragraphs) with the full story, some context, and a question to spark discussion",
  "imagePrompt": "A detailed DALL-E prompt for a stylized, artistic image that captures the mood and era of this story — NO real faces, use abstract or symbolic imagery, vintage aesthetic, editorial illustration style",
  "hashtags": ["list", "of", "10", "relevant", "hashtags", "without", "the", "hash", "symbol"]
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse Claude response as JSON");

  return JSON.parse(jsonMatch[0]) as StoryContent;
}
