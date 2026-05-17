import Anthropic from "@anthropic-ai/sdk";
import { StoryContent, PostCategory } from "@/types";

export interface TodayEvent {
  artist: string;
  event: string;          // e.g. "70th birthday" or "50th anniversary of Dark Side of the Moon"
  suggestedCategory: PostCategory; // vinyl_art for album anniversaries, music_story for birthdays/milestones
}

export async function getTodaysMusicEvent(date: Date): Promise<TodayEvent | null> {
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const monthDay = date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  const response = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Today is ${dateStr}. Is there a significant rock or pop music anniversary, birthday, or milestone on ${monthDay} that would make a compelling social media post for a music history brand?

Focus on: artist birthdays (round numbers preferred), iconic album release anniversaries (especially round years like 25th, 30th, 40th, 50th), landmark recording sessions, or major career events.

Only return an event if you are confident it is historically accurate. If nothing significant falls on this date, return null.

Return ONLY valid JSON in one of these two formats:

If an event exists:
{"artist": "Artist Name", "event": "description of the event e.g. 70th birthday or 50th anniversary of Abbey Road", "suggestedCategory": "music_story"}

For album cover/release anniversaries where the artwork is iconic, use "vinyl_art" instead.

If nothing significant: null`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  if (text === "null" || !text || text.toLowerCase().includes("null")) return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as TodayEvent;
  } catch {
    return null;
  }
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function getBreakingMusicNews(): Promise<string | null> {
  const feeds = [
    "https://www.nme.com/feed",
    "https://www.rollingstone.com/music/feed/",
    "https://pitchfork.com/rss/news/feed/rss",
  ];

  const headlines: string[] = [];

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
      for (const item of itemMatches) {
        const titleMatch = item[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
        const pubDateMatch = item[1].match(/<pubDate>(.*?)<\/pubDate>/);
        if (titleMatch && pubDateMatch) {
          const pubDate = new Date(pubDateMatch[1]);
          if (Date.now() - pubDate.getTime() < 48 * 60 * 60 * 1000) {
            const title = (titleMatch[1] ?? titleMatch[2] ?? "").trim();
            if (title) headlines.push(title);
          }
        }
      }
    } catch {
      // ignore failed feeds
    }
  }

  if (headlines.length === 0) return null;

  const response = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `Here are recent music news headlines from the last 48 hours. Is any of these significant breaking news that a rock/pop music history brand should feature immediately? Look for: band reunions, surprise album drops, major artist deaths, landmark tours, major awards, or cultural moments.\n\nHeadlines:\n${headlines.slice(0, 15).map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nIf yes, return ONLY the single most significant headline as plain text. If nothing is significant enough for an immediate post, return null.`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  if (!text || text.toLowerCase() === "null") return null;
  return text;
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
  "carouselSlides": ["Punchy hook for slide 2 (max 100 chars, surprising fact or bold statement)", "Main story beat for slide 3 (max 120 chars, the most compelling detail)", "Closing thought for slide 4 (max 100 chars, end with an implicit question or reflection)"],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol"],
  "amazonSearchTerms": "3-6 words to search Amazon for the most relevant vinyl record or CD — e.g. Pink Floyd Dark Side Moon vinyl",
  "newsletterTitle": "Email subject line: compelling, 6-10 words, no clickbait",
  "newsletterHtml": "Full newsletter article in HTML (no <html>/<body> tags). 400-600 words. Include: an engaging opening hook, the full story with rich detail and context, why it matters to music history, a closing reflection. Use <p>, <h2>, <strong>, <em> tags. End with a <p> inviting readers to reply with their thoughts."
}`;
}

function buildHarmonyPrompt(artist: string): string {
  return `You are creating content for a music history brand — exploring musical DNA, influence, and the lineage of sound across rock and pop history.

Generate a "Harmony" post exploring how a specific riff, chord progression, or musical motif connected to ${artist} was borrowed, adapted, or directly copied between songs. Pick a pair of songs where the musical connection is clear, specific, and musically interesting — one that established the sound and one that borrowed it (or vice versa involving ${artist}).

Return ONLY valid JSON with this exact structure:
{
  "category": "harmony",
  "artist": "${artist}",
  "title": "Short punchy title about the musical connection (max 8 words)",
  "story": "2-3 sentences summarising the musical DNA connection, used internally",
  "imageCaption": "One punchy line for the image overlay — max 55 characters, about the sonic connection",
  "caption": "Instagram/Facebook caption: name both songs and artists. Describe the specific riff, chord progression, or motif that was borrowed. Explain the genre lineage. Rate the similarity (subtle nod / clear influence / nearly identical). End with a question like 'Can you hear it?' or 'Inspiration or imitation?'",
  "influenceSource": "Original artist — Song title (year)",
  "influencedWork": "Later artist — Song title (year)",
  "similarityLevel": "subtle_nod OR clear_influence OR nearly_identical",
  "genre": "the genre lineage e.g. blues → hard rock, or soul → funk → hip-hop",
  "emotion": "one word: the primary emotion this sound evokes e.g. euphoric / melancholic / defiant / tender / tense / nostalgic / energetic",
  "activityTags": ["2-4 tags from this list only: workout, running, driving, cycling, background, chill out, party, focus, romance, morning, late night"],
  "imagePrompt": "Detailed prompt for an AI image generator: a photorealistic image evoking the atmosphere of both songs merging — instruments, studio gear, stage light, textures that span both eras. No human faces or figures. Square format, cinematic, high contrast.",
  "carouselSlides": ["The original song context — who made it, when, and why it mattered (max 100 chars)", "How the sound was borrowed or adapted — the specific riff, chord, or motif (max 120 chars)", "The verdict — inspiration or imitation? Leave the listener with a question (max 100 chars)"],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol", "include MusicInfluence MusicDNA SoundAlike"],
  "amazonSearchTerms": "3-6 words to search Amazon for the most relevant vinyl or CD",
  "newsletterTitle": "Email subject line: compelling, 6-10 words about the musical connection",
  "newsletterHtml": "Full newsletter article in HTML (no <html>/<body> tags). 400-600 words. Deep dive into the musical DNA: describe the specific notes, chords, or rhythm borrowed. Discuss whether it crosses into plagiarism. Include listener cues ('Listen at 0:32 for the moment...'). Explore how influence works in music history. Use <p>, <h2>, <strong>, <em> tags. End with a <p> inviting readers to share which version they prefer."
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
  "carouselSlides": ["Punchy hook for slide 2 (max 100 chars, surprising fact or bold statement about the artwork)", "Main story beat for slide 3 (max 120 chars, the most compelling detail about how the cover was made)", "Closing thought for slide 4 (max 100 chars, end with an implicit question or reflection about the artwork)"],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol", "include AlbumArt VinylCover RecordSleeve"],
  "amazonSearchTerms": "3-6 words to search Amazon for this specific vinyl record — e.g. Pink Floyd Dark Side Moon vinyl",
  "newsletterTitle": "Email subject line about the artwork story: compelling, 6-10 words",
  "newsletterHtml": "Full newsletter article in HTML (no <html>/<body> tags). 400-600 words. Include: an engaging opening hook about the artwork, the full story of how it was conceived and created, why the visual design matters to music history, hidden details listeners might have missed. Use <p>, <h2>, <strong>, <em> tags. End with a <p> inviting readers to reply with their thoughts."
}`;
}

export async function generateStoryContent(
  usedArtists: string[] = [],
  forcedCategory?: PostCategory,
  todayEvent?: TodayEvent,
  recentSummaries: { artist: string; title: string; category: string }[] = [],
  breakingNews?: string
): Promise<StoryContent> {
  const available = ARTISTS_POOL.filter((a) => !usedArtists.includes(a));
  const pool = available.length > 0 ? available : ARTISTS_POOL;
  const randomArtist = pool[Math.floor(Math.random() * pool.length)];

  // Event takes priority: use the event's artist and suggested category
  const artist = todayEvent?.artist ?? randomArtist;
  const randomCategory = (): PostCategory => {
    const r = Math.random();
    if (r < 0.4) return "music_story";
    if (r < 0.7) return "vinyl_art";
    return "harmony";
  };
  const category: PostCategory = forcedCategory ?? todayEvent?.suggestedCategory ?? randomCategory();

  const basePrompt = category === "vinyl_art"
    ? buildVinylArtPrompt(artist)
    : category === "harmony"
    ? buildHarmonyPrompt(artist)
    : buildMusicStoryPrompt(artist);

  // Append breaking news context — takes highest priority if present
  const newsSuffix = breakingNews
    ? `\n\nBREAKING NEWS CONTEXT: The following music news just broke: "${breakingNews}". Make this the focus of your story — write about this event, the artist(s) involved, and why it matters. Make the post feel timely, relevant, and exciting. Adjust the artist and title fields to match the news subject.`
    : "";

  // Append event context so Claude tailors the story to the specific anniversary/birthday
  const eventSuffix = !breakingNews && todayEvent
    ? `\n\nIMPORTANT: Today is specifically the ${todayEvent.event}. Make the story directly about this occasion — mention the anniversary/milestone in the caption opening and make it feel timely and celebratory.`
    : "";

  // Append deduplication context — list previously covered stories to avoid repeats
  const artistSummaries = recentSummaries.filter((s) => s.artist === artist);
  const dedupeLines = recentSummaries
    .map((s) => `- ${s.artist}: "${s.title}" (${s.category})`)
    .join("\n");
  const dedupeSuffix = dedupeLines
    ? `\n\nDO NOT repeat any of the following stories that have already been published. Choose a completely different song, album, event, or aspect of the artist's career:\n${dedupeLines}${artistSummaries.length > 0 ? `\n\nThis artist (${artist}) has already been featured ${artistSummaries.length} time(s) — pick a different era, album, or story angle.` : ""}`
    : "";

  const prompt = basePrompt + newsSuffix + eventSuffix + dedupeSuffix;

  const response = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse Claude response as JSON");

  const content = JSON.parse(jsonMatch[0]) as StoryContent;
  // Always enforce category; only enforce artist when no breaking news
  // (breaking news lets Claude set the artist from the news subject)
  content.category = category;
  if (!breakingNews) content.artist = artist;
  return content;
}

export function buildAffiliateUrl(searchTerms: string): string {
  const tag = process.env.AMAZON_AFFILIATE_TAG;
  const encoded = searchTerms.trim().replace(/\s+/g, "+");
  const base = `https://www.amazon.com/s?k=${encoded}`;
  return tag ? `${base}&tag=${tag}` : base;
}

export interface RelatedLinks {
  spotify: string;
  youtube: string;
  wikipedia: string;
  appleMusic: string;
}

export function buildRelatedLinks(artist: string, title: string): RelatedLinks {
  const artistQ = encodeURIComponent(artist);
  const fullQ = encodeURIComponent(`${artist} ${title}`);
  const wikiSlug = artist.trim().replace(/ /g, "_");
  return {
    spotify: `https://open.spotify.com/search/${fullQ}`,
    youtube: `https://www.youtube.com/results?search_query=${fullQ}`,
    wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiSlug)}`,
    appleMusic: `https://music.apple.com/search?term=${artistQ}`,
  };
}

export function buildRelatedLinksCaption(links: RelatedLinks, affiliateUrl: string): string {
  return [
    `🎵 Spotify: ${links.spotify}`,
    `▶️ YouTube: ${links.youtube}`,
    `📖 Wikipedia: ${links.wikipedia}`,
    `🍎 Apple Music: ${links.appleMusic}`,
    affiliateUrl ? `🛒 Find the vinyl: ${affiliateUrl}` : "",
  ].filter(Boolean).join("\n");
}

export function buildRelatedLinksHtml(links: RelatedLinks, affiliateUrl: string): string {
  const items = [
    `<a href="${links.spotify}">🎵 Listen on Spotify</a>`,
    `<a href="${links.youtube}">▶️ Watch on YouTube</a>`,
    `<a href="${links.wikipedia}">📖 Read more on Wikipedia</a>`,
    `<a href="${links.appleMusic}">🍎 Find on Apple Music</a>`,
    affiliateUrl ? `<a href="${affiliateUrl}">🛒 Find the vinyl on Amazon</a>` : "",
  ].filter(Boolean).map((item) => `<li>${item}</li>`).join("\n");
  return `<h2>Related Links</h2>\n<ul>\n${items}\n</ul>`;
}
