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
      content: `Here are recent music news headlines from the last 48 hours. Is any of these significant breaking news that a rock and pop music history brand should feature immediately?\n\nThe brand covers: classic rock, alternative, indie, punk, metal, grunge, and iconic internationally known pop/soul artists (e.g. Michael Jackson, Prince, David Bowie, Elton John, Madonna, Whitney Houston, Stevie Wonder, Marvin Gaye, Amy Winehouse).\n\nDo NOT select headlines about: K-pop, modern pop acts, hip-hop, R&B, country, EDM, or niche/regional artists with limited international recognition.\n\nLook for: band reunions, surprise album drops, major artist deaths, landmark tours, major awards.\n\nHeadlines:\n${headlines.slice(0, 15).map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nIf yes, return ONLY the single most significant headline as plain text. If nothing qualifies, return null.`,
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
  return `You are creating content for a music history brand across Instagram and Facebook — similar to @explainingpaintings but for rock and pop music.

Generate a fascinating, lesser-known story about ${artist} — a specific song, album, recording session, or pivotal career moment.

Write in a natural, human tone. Use commas and short sentences instead of em dashes. Avoid bullet points, numbered lists, and overly formal phrasing. Sound like a knowledgeable music fan writing to a friend, not an AI.

Return ONLY valid JSON with this exact structure:
{
  "category": "music_story",
  "artist": "${artist}",
  "title": "Short punchy title (max 8 words)",
  "story": "2-3 sentences summarising the story, used internally",
  "imageCaption": "One short punchy line for the image overlay — max 55 characters, hooks the viewer instantly",
  "caption": "Instagram/Facebook caption: 2-3 paragraphs with the full story, context, and a question to spark discussion",
  "imagePrompt": "Detailed AI image prompt specific to THIS artist and story — vary the setting creatively: it could be a concert venue, a specific era's street scene, iconic instruments, album sleeve objects, a tour bus, a festival crowd, backstage equipment, or a symbolic still life tied to the story's theme. Capture the exact decade's visual style and colour palette. Do NOT show any human face or figure. Do NOT use generic dark studio gear. Be specific and visually distinct. High contrast, cinematic, square format.",
  "carouselSlides": ["Slide 1 — one punchy hook sentence, max 80 chars, bold and direct like a headline", "Slide 2 — one or two short sentences telling the core of the story, max 100 chars, conversational", "Slide 3 — one closing line with a question or reflection, max 80 chars"],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol"],
  "amazonSearchTerms": "3-6 words to search Amazon for the most relevant vinyl record or CD — e.g. Pink Floyd Dark Side Moon vinyl",
  "instagramHandle": "artist's Instagram handle without @ — e.g. kylieminogue (use your best knowledge, or omit if unknown)",
  "tagAccounts": ["1-2 relevant music media Instagram handles without @ — e.g. rollingstonemagazine or pitchfork — pick accounts that would genuinely be interested in this story"]
}`;
}

function buildHarmonyPrompt(artist: string): string {
  return `You are creating content for a music history brand — exploring musical DNA, influence, and the lineage of sound across rock and pop history.

Generate a "Harmony" post exploring how a specific riff, chord progression, or musical motif connected to ${artist} was borrowed, adapted, or directly copied between songs. Pick a pair of songs where the musical connection is clear, specific, and musically interesting — one that established the sound and one that borrowed it (or vice versa involving ${artist}).

Write in a natural, human tone. Use commas and short sentences instead of em dashes. Avoid bullet points, numbered lists, and overly formal phrasing. Sound like a knowledgeable music fan writing to a friend, not an AI.

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
  "carouselSlides": ["Slide 1 — one punchy hook about the musical connection, max 80 chars, bold and direct", "Slide 2 — one or two short sentences on the borrowed riff/chord, max 100 chars, plain language", "Slide 3 — one verdict line with a question, max 80 chars"],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol", "include MusicInfluence MusicDNA SoundAlike"],
  "amazonSearchTerms": "3-6 words to search Amazon for the most relevant vinyl or CD",
  "instagramHandle": "artist's Instagram handle without @ — e.g. kylieminogue (use your best knowledge, or omit if unknown)",
  "tagAccounts": ["1-2 relevant music media Instagram handles without @ — e.g. rollingstonemagazine or pitchfork"]
}`;
}

function buildVinylArtPrompt(artist: string): string {
  return `You are creating content for a music history brand across Instagram and Facebook — similar to @explainingpaintings but for rock and pop music.

Generate a fascinating, lesser-known story about the album cover artwork or sleeve design of a specific ${artist} record — focusing on the photographer, art director, visual concept, hidden meaning, or behind-the-scenes story of how the artwork was created.

Write in a natural, human tone. Use commas and short sentences instead of em dashes. Avoid bullet points, numbered lists, and overly formal phrasing. Sound like a knowledgeable music fan writing to a friend, not an AI.

Return ONLY valid JSON with this exact structure:
{
  "category": "vinyl_art",
  "artist": "${artist}",
  "title": "Short punchy title about the artwork (max 8 words)",
  "story": "2-3 sentences summarising the artwork story, used internally",
  "imageCaption": "One short punchy line for the image overlay — max 55 characters, about the artwork",
  "caption": "Instagram/Facebook caption: 2-3 paragraphs telling the full story of the artwork — the design concept, the photographer or artist behind it, hidden details, controversies, or how it was made. End with a question to spark discussion.",
  "imagePrompt": "Detailed prompt for an AI image generator: create a photorealistic still life image that evokes the aesthetic, colour palette, textures, and mood of this specific album cover artwork — reference the visual elements, lighting style, and era without depicting any real person. Focus on objects, surfaces, typography feel, light and shadow. Square format, editorial quality.",
  "carouselSlides": ["Slide 1 — one punchy hook about the album art, max 80 chars, bold and direct like a headline", "Slide 2 — one or two short sentences on the story behind the artwork, max 100 chars, conversational", "Slide 3 — one closing line that reframes the cover, max 80 chars"],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol", "include AlbumArt VinylCover RecordSleeve"],
  "albumName": "Exact album title as it appears on the sleeve — e.g. The Dark Side of the Moon",
  "amazonSearchTerms": "3-6 words to search Amazon for this specific vinyl record — e.g. Pink Floyd Dark Side Moon vinyl",
  "instagramHandle": "artist's Instagram handle without @ — e.g. kylieminogue (use your best knowledge, or omit if unknown)",
  "tagAccounts": ["1-2 relevant music media Instagram handles without @ — e.g. rollingstonemagazine or pitchfork"]
}`;
}

export async function generateStoryContent(
  usedArtists: string[] = [],
  forcedCategory?: PostCategory,
  todayEvent?: TodayEvent,
  recentSummaries: { artist: string; title: string; category: string }[] = [],
  breakingNews?: string
): Promise<StoryContent> {
  // Artists posted in the last 3 posts — block them from being selected again
  const last3Artists = new Set(recentSummaries.slice(0, 3).map((s) => s.artist.toLowerCase()));

  const available = ARTISTS_POOL.filter(
    (a) => !usedArtists.includes(a) && !last3Artists.has(a.toLowerCase())
  );
  const pool = available.length > 0 ? available : ARTISTS_POOL.filter((a) => !last3Artists.has(a.toLowerCase()));
  const finalPool = pool.length > 0 ? pool : ARTISTS_POOL;
  const randomArtist = finalPool[Math.floor(Math.random() * finalPool.length)];

  // Event takes priority, but skip if that artist was in the last 3 posts
  const eventArtist = todayEvent && !last3Artists.has(todayEvent.artist.toLowerCase())
    ? todayEvent.artist
    : undefined;
  const artist = eventArtist ?? randomArtist;
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
    ? `\n\nBREAKING NEWS CONTEXT: The following music news just broke: "${breakingNews}". Make this the focus of your story — write about this event, the artist(s) involved, and why it matters. Make the post feel timely, relevant, and exciting. Adjust the artist and title fields to match the news subject. IMPORTANT: Only proceed if this news is about a rock, alternative, indie, punk, metal, classic rock artist, or a globally iconic pop/soul legend (e.g. Michael Jackson, Prince, Elton John, Madonna, Whitney Houston, Stevie Wonder). If the news is about a K-pop act, modern pop, hip-hop, R&B, or any artist without major international rock/pop legacy, ignore it and generate a regular vinyl_art post instead.`
    : "";

  // Append event context only when the event artist is actually being used
  const eventSuffix = !breakingNews && todayEvent && eventArtist
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
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse Claude response as JSON");

  let content: StoryContent;
  try {
    content = JSON.parse(jsonMatch[0]) as StoryContent;
  } catch {
    // Salvage: replace smart quotes, dashes, and other non-ASCII punctuation
    const sanitized = jsonMatch[0]
      .replace(/[\u0000-\u001F\u007F]/g, " ")   // control chars
      .replace(/[\u2018\u2019\u02BC\u0060]/g, "'") // smart single quotes
      .replace(/[\u201C\u201D]/g, '"')             // smart double quotes
      .replace(/[\u2013\u2014]/g, "-")             // en/em dashes
      .replace(/[\u2026]/g, "...")                  // ellipsis
      .replace(/[\u00A0]/g, " ");                   // non-breaking space
    try {
      content = JSON.parse(sanitized) as StoryContent;
    } catch (e2) {
      // Last resort: extract JSON field by field with a regex-based fallback
      throw new Error(`Claude JSON unparseable after sanitization: ${e2 instanceof Error ? e2.message : e2}\n\nRaw: ${jsonMatch[0].slice(0, 200)}`);
    }
  }
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

export function buildRelatedLinks(
  artist: string,
  title: string,
  overrides?: { spotifyUrl?: string; appleMusicUrl?: string; albumName?: string }
): RelatedLinks {
  const artistQ = artist.trim().replace(/\s+/g, "+");
  // Use album name for search queries if available; fall back to artist-only
  const searchSubject = overrides?.albumName ?? artist;
  const searchQ = `${artist} ${searchSubject}`.trim().replace(/\s+/g, "+");
  const wikiSlug = artist.trim().replace(/ /g, "_");
  return {
    spotify: overrides?.spotifyUrl ?? `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${searchSubject}`)}`,
    youtube: `https://www.youtube.com/results?search_query=${searchQ}`,
    wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiSlug)}`,
    appleMusic: overrides?.appleMusicUrl ?? `https://music.apple.com/search?term=${artistQ}`,
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

