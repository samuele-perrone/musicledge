import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { StoryContent, PostCategory } from "@/types";

export interface TodayEvent {
  artist: string;
  event: string;          // e.g. "70th birthday" or "50th anniversary of Dark Side of the Moon"
  suggestedCategory: PostCategory; // vinyl_art for album anniversaries, music_story for birthdays/milestones
}

// Switch provider via AI_PROVIDER env var: "gemini" (default) or "claude"
async function generate(prompt: string, maxTokens = 8192): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? "gemini";

  if (provider === "claude") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000 });
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0].type === "text" ? response.content[0].text : "";
  }

  // Default: Gemini
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const model = client.getGenerativeModel({
    model: "gemini-2.5-pro",
    generationConfig: { maxOutputTokens: maxTokens },
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function getTodaysMusicEvent(date: Date): Promise<TodayEvent | null> {
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const monthDay = date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  const text = await generate(`Today is ${dateStr}. Is there a significant rock or pop music anniversary, birthday, or milestone on ${monthDay} that would make a compelling social media post for a music history brand?

Focus on: artist birthdays (round numbers preferred), iconic album release anniversaries (especially round years like 25th, 30th, 40th, 50th), landmark recording sessions, or major career events.

Only return an event if you are confident it is historically accurate. If nothing significant falls on this date, return null.

Return ONLY valid JSON in one of these two formats:

If an event exists:
{"artist": "Artist Name", "event": "description of the event e.g. 70th birthday or 50th anniversary of Abbey Road", "suggestedCategory": "music_story"}

For album cover/release anniversaries where the artwork is iconic, use "vinyl_art" instead.

If nothing significant: null`, 512);

  const trimmed = text.trim();
  if (trimmed === "null" || !trimmed || trimmed.toLowerCase().includes("null")) return null;

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as TodayEvent;
  } catch {
    return null;
  }
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

  const text = await generate(`Here are recent music news headlines from the last 48 hours. Is any of these significant breaking news that a rock and pop music history brand should feature immediately?

The brand covers: classic rock, alternative, indie, punk, metal, grunge, and iconic internationally known pop/soul artists (e.g. Michael Jackson, Prince, David Bowie, Elton John, Madonna, Whitney Houston, Stevie Wonder, Marvin Gaye, Amy Winehouse).

Do NOT select headlines about: K-pop, modern pop acts, hip-hop, R&B, country, EDM, or niche/regional artists with limited international recognition.

Look for: band reunions, surprise album drops, major artist deaths, landmark tours, major awards.

Headlines:
${headlines.slice(0, 15).map((h, i) => `${i + 1}. ${h}`).join("\n")}

If yes, return ONLY the single most significant headline as plain text. If nothing qualifies, return null.`, 256);

  const trimmed = text.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

// How far back to look when blocking a recently used artist, widest window first.
// Only the narrower tiers apply if ARTISTS_POOL is ever trimmed below the window.
const RECENCY_TIERS = [90, 60, 30, 15, 5];

// Anniversary and birthday posts are date-bound, so they use a tighter window
// than the random rotation — but still far wider than the previous 3 posts.
const EVENT_RECENCY = 30;

// Artist pool for scheduled posts. Sized well above the recency window in
// RECENCY_TIERS so the selector never has to fall back to a recently used artist.
const ARTISTS_POOL = [
  // Foundational rock, 60s and 70s
  "The Beatles",
  "The Rolling Stones",
  "Led Zeppelin",
  "Pink Floyd",
  "The Who",
  "The Kinks",
  "Cream",
  "Deep Purple",
  "Black Sabbath",
  "Jefferson Airplane",
  "The Byrds",
  "Creedence Clearwater Revival",
  "Santana",
  "The Allman Brothers Band",
  "Lynyrd Skynyrd",
  "ZZ Top",
  "AC/DC",
  "Aerosmith",
  "Thin Lizzy",
  "Rush",
  "Yes",
  "Genesis",
  "King Crimson",
  "Jethro Tull",
  "Roxy Music",
  "T. Rex",
  "The Band",
  "Crosby, Stills & Nash",
  "Simon & Garfunkel",
  "The Beach Boys",
  "Steely Dan",
  "Eagles",
  "Heart",
  "Electric Light Orchestra",
  "Fleetwood Mac",
  "Queen",
  "The Doors",
  "Jimi Hendrix",
  "Janis Joplin",
  "Grateful Dead",
  "Neil Young",
  "Bruce Springsteen",
  "David Bowie",

  // Songwriters and roots
  "Bob Dylan",
  "Joni Mitchell",
  "Tom Waits",
  "Leonard Cohen",
  "Van Morrison",
  "Nick Drake",
  "Carole King",
  "Johnny Cash",
  "Roy Orbison",
  "Chuck Berry",
  "Little Richard",
  "Buddy Holly",
  "Elvis Presley",
  "Paul Simon",
  "Billy Joel",

  // Punk, post-punk and new wave
  "Ramones",
  "Sex Pistols",
  "The Clash",
  "The Damned",
  "Buzzcocks",
  "The Jam",
  "Elvis Costello",
  "Television",
  "The Stooges",
  "MC5",
  "New York Dolls",
  "Patti Smith",
  "Blondie",
  "Dead Kennedys",
  "Black Flag",
  "Bad Brains",
  "Hüsker Dü",
  "The Replacements",
  "Devo",
  "Talking Heads",
  "The Velvet Underground",
  "Joy Division",
  "New Order",
  "The Cure",
  "Siouxsie and the Banshees",
  "Bauhaus",
  "The Specials",
  "Madness",
  "The Police",
  "XTC",
  "Gang of Four",
  "Wire",
  "Echo and the Bunnymen",
  "Depeche Mode",
  "The Smiths",

  // Shoegaze, Britpop and 90s alternative
  "The Jesus and Mary Chain",
  "Cocteau Twins",
  "My Bloody Valentine",
  "Slowdive",
  "Ride",
  "The Stone Roses",
  "Happy Mondays",
  "Primal Scream",
  "Oasis",
  "Blur",
  "Pulp",
  "Suede",
  "Manic Street Preachers",
  "The Verve",
  "Massive Attack",
  "Portishead",
  "Radiohead",
  "Jeff Buckley",
  "Nick Cave and the Bad Seeds",
  "Tori Amos",
  "Fiona Apple",
  "PJ Harvey",
  "Kate Bush",
  "Björk",
  "Hole",
  "Garbage",
  "The Breeders",
  "Pixies",
  "Dinosaur Jr.",
  "Sonic Youth",
  "Mudhoney",
  "Nirvana",
  "Pearl Jam",
  "Soundgarden",
  "Alice in Chains",
  "Stone Temple Pilots",
  "Rage Against the Machine",
  "Jane's Addiction",
  "Red Hot Chili Peppers",
  "Faith No More",
  "Pavement",
  "Elliott Smith",
  "Beck",
  "Weezer",
  "Foo Fighters",
  "R.E.M.",
  "Smashing Pumpkins",

  // Indie and art rock, 2000s onward
  "The Flaming Lips",
  "Wilco",
  "Modest Mouse",
  "Belle and Sebastian",
  "Neutral Milk Hotel",
  "Gorillaz",
  "The Strokes",
  "The White Stripes",
  "Arctic Monkeys",
  "Interpol",
  "Yeah Yeah Yeahs",
  "The Killers",
  "Franz Ferdinand",
  "LCD Soundsystem",
  "Arcade Fire",
  "The National",
  "Vampire Weekend",
  "Spoon",
  "Death Cab for Cutie",
  "TV on the Radio",
  "Sigur Rós",
  "Muse",
  "Coldplay",
  "The Libertines",

  // Metal and hard rock
  "Metallica",
  "Iron Maiden",
  "Judas Priest",
  "Motörhead",
  "Slayer",
  "Megadeth",
  "Anthrax",
  "Pantera",
  "Slipknot",
  "System of a Down",
  "Tool",
  "Mastodon",
  "Queens of the Stone Age",
  "Ozzy Osbourne",
  "Van Halen",
  "Guns N' Roses",
  "Def Leppard",
  "Scorpions",

  // Iconic pop and soul
  "Michael Jackson",
  "Prince",
  "Madonna",
  "Elton John",
  "Whitney Houston",
  "Stevie Wonder",
  "Marvin Gaye",
  "Amy Winehouse",
  "Aretha Franklin",
  "Ray Charles",
  "James Brown",
  "Otis Redding",
  "Sam Cooke",
  "Nina Simone",
  "Tina Turner",
  "Diana Ross",
  "Al Green",
  "Curtis Mayfield",
  "Sly and the Family Stone",
  "Earth, Wind & Fire",
  "Chic",
  "Donna Summer",
  "George Michael",
  "Peter Gabriel",
  "Dusty Springfield",
  "Annie Lennox",
];

function buildMusicStoryPrompt(artist: string): string {
  return `You are creating content for a music history brand on Instagram — similar to @explainingpaintings but for rock and pop music.

Generate a fascinating, lesser-known story about ${artist} — a specific song, album, recording session, or pivotal career moment.

Write in a natural, human tone. Use commas and short sentences instead of em dashes. Avoid bullet points, numbered lists, and overly formal phrasing. Sound like a knowledgeable music fan writing to a friend, not an AI.

Return ONLY valid JSON with this exact structure:
{
  "category": "music_story",
  "artist": "${artist}",
  "title": "Max 8 words. Follow the TITLE RULES at the end of this prompt.",
  "story": "2-3 sentences summarising the story, used internally",
  "imageCaption": "One short punchy line for the image overlay — max 55 characters, hooks the viewer instantly",
  "caption": "Instagram caption: open with the numbered hook from Slide 1 (e.g. '5 facts about [Song] most fans don't know'). Then list each fact as a numbered item (1. … 2. … etc.), one per line, 1-2 sentences each. End with a question to spark discussion.",
  "imagePrompt": "Detailed AI image prompt specific to THIS artist and story — vary the setting creatively: it could be a concert venue, a specific era's street scene, iconic instruments, album sleeve objects, a tour bus, a festival crowd, backstage equipment, or a symbolic still life tied to the story's theme. Capture the exact decade's visual style and colour palette. Do NOT show any human face or figure. Do NOT use generic dark studio gear. Be specific and visually distinct. High contrast, cinematic, square format.",
  "carouselSlides": ["Slide 1 — a numbered saves-bait hook, pick a number 3-7, e.g. '5 facts about [Song] most fans don't know' — max 80 chars, bold and specific. You may use one emoji max.", "Slide 2 — two of those facts as very short punchy sentences back-to-back, max 110 chars total. You may use one emoji max.", "Slide 3 — save-bait CTA e.g. 'Save this. Which fact surprised you most?' — max 80 chars. You may use one emoji max."],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol"],
  "amazonSearchTerms": "3-6 words to search Amazon for the most relevant vinyl record or CD — e.g. Pink Floyd Dark Side Moon vinyl",
  "musicGenre": "heavy OR melodic — heavy for metal, hard rock, punk, grunge, thrash; melodic for classic rock, pop rock, alternative, indie, soft rock",
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
  "title": "Max 8 words, about the musical connection. Follow the TITLE RULES at the end of this prompt.",
  "story": "2-3 sentences summarising the musical DNA connection, used internally",
  "imageCaption": "One punchy line for the image overlay — max 55 characters, about the sonic connection",
  "caption": "Instagram caption: open with a bold hook naming both songs (e.g. 'Most fans don't realise [Song B] borrowed this exact riff from [Song A]'). Then explain the specific riff, chord progression, or motif that was borrowed, the genre lineage, and rate the similarity (subtle nod / clear influence / nearly identical). End with a question like 'Can you hear it?' or 'Inspiration or imitation?'",
  "influenceSource": "Original artist — Song title (year)",
  "influencedWork": "Later artist — Song title (year)",
  "similarityLevel": "subtle_nod OR clear_influence OR nearly_identical",
  "genre": "the genre lineage e.g. blues → hard rock, or soul → funk → hip-hop",
  "emotion": "one word: the primary emotion this sound evokes e.g. euphoric / melancholic / defiant / tender / tense / nostalgic / energetic",
  "activityTags": ["2-4 tags from this list only: workout, running, driving, cycling, background, chill out, party, focus, romance, morning, late night"],
  "imagePrompt": "Detailed prompt for an AI image generator: a photorealistic image evoking the atmosphere of both songs merging — instruments, studio gear, stage light, textures that span both eras. No human faces or figures. Square format, cinematic, high contrast.",
  "carouselSlides": ["Slide 1 — a bold hook naming both songs, e.g. 'Most fans don't know [Song B] copied this riff from [Song A]' — max 80 chars. You may use one emoji max.", "Slide 2 — the specific riff/chord detail in plain language, max 100 chars. You may use one emoji max.", "Slide 3 — save-bait verdict e.g. 'Save this. Inspiration or imitation?' — max 80 chars. You may use one emoji max."],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol", "include MusicInfluence MusicDNA SoundAlike"],
  "amazonSearchTerms": "3-6 words to search Amazon for the most relevant vinyl or CD",
  "musicGenre": "heavy OR melodic — heavy for metal, hard rock, punk, grunge, thrash; melodic for classic rock, pop rock, alternative, indie, soft rock",
  "instagramHandle": "artist's Instagram handle without @ — e.g. kylieminogue (use your best knowledge, or omit if unknown)",
  "tagAccounts": ["1-2 relevant music media Instagram handles without @ — e.g. rollingstonemagazine or pitchfork"]
}`;
}

function buildVinylArtPrompt(artist: string): string {
  return `You are creating content for a music history brand on Instagram — similar to @explainingpaintings but for rock and pop music.

Generate a fascinating, lesser-known story about the album cover artwork or sleeve design of a specific ${artist} record — focusing on the photographer, art director, visual concept, hidden meaning, or behind-the-scenes story of how the artwork was created.

Write in a natural, human tone. Use commas and short sentences instead of em dashes. Avoid bullet points, numbered lists, and overly formal phrasing. Sound like a knowledgeable music fan writing to a friend, not an AI.

Return ONLY valid JSON with this exact structure:
{
  "category": "vinyl_art",
  "artist": "${artist}",
  "title": "Max 8 words, about the artwork. Follow the TITLE RULES at the end of this prompt.",
  "story": "2-3 sentences summarising the artwork story, used internally",
  "imageCaption": "One short punchy line for the image overlay — max 55 characters, about the artwork",
  "caption": "Instagram caption: open with the numbered hook from Slide 1 (e.g. '5 hidden details in [Album] cover art most fans miss'). Then list each hidden detail as a numbered item (1. … 2. … etc.), one per line, 1-2 sentences each. End with a question to spark discussion.",
  "imagePrompt": "Detailed prompt for an AI image generator: create a photorealistic still life image that evokes the aesthetic, colour palette, textures, and mood of this specific album cover artwork — reference the visual elements, lighting style, and era without depicting any real person. Focus on objects, surfaces, typography feel, light and shadow. Square format, editorial quality.",
  "carouselSlides": ["Slide 1 — a numbered saves-bait hook, pick a number 3-7, e.g. '5 hidden details in [Album] cover art most fans miss' — max 80 chars, bold and specific. You may use one emoji max.", "Slide 2 — two of those hidden details as very short punchy sentences back-to-back, max 110 chars total. You may use one emoji max.", "Slide 3 — save-bait CTA e.g. 'Save this. Which detail surprised you most?' — max 80 chars. You may use one emoji max."],
  "hashtags": ["10", "relevant", "hashtags", "without", "hash", "symbol", "include AlbumArt VinylCover RecordSleeve"],
  "albumName": "Exact album title as it appears on the sleeve — e.g. The Dark Side of the Moon",
  "amazonSearchTerms": "3-6 words to search Amazon for this specific vinyl record — e.g. Pink Floyd Dark Side Moon vinyl",
  "musicGenre": "heavy OR melodic — heavy for metal, hard rock, punk, grunge, thrash; melodic for classic rock, pop rock, alternative, indie, soft rock",
  "instagramHandle": "artist's Instagram handle without @ — e.g. kylieminogue (use your best knowledge, or omit if unknown)",
  "tagAccounts": ["1-2 relevant music media Instagram handles without @ — e.g. rollingstonemagazine or pitchfork"]
}`;
}

/**
 * Title rules, appended to every category prompt.
 *
 * The title is the large text on the reel's opening frame, so it is the first
 * thing a scroller reads and it decides whether they stay. Left unconstrained,
 * the model converged hard on one construction — "The Ping That Built Echoes",
 * "The Dulcimer That Built Blue", "The Cassette That Built Heart Of Glass" — and
 * ran it for most of 455 posts. Those titles read as riddles: they name an object
 * the viewer has no context for and hide what is actually being offered.
 *
 * The two best-performing posts on the account both broke the pattern, which is
 * why they are quoted below as the target.
 */
/**
 * The construction TITLE_RULES bans: "The <1-3 words> That/Behind/Hidden ...".
 * A generated title matching this means the prompt guidance stopped holding, which
 * is worth seeing in the logs rather than discovering months later in the grid.
 */
const FORMULAIC_TITLE = /^the\s+(?:\S+\s+){1,3}(?:that|which|behind|hidden)\b/i;

const TITLE_RULES = `

TITLE RULES — these override any title guidance above.

The title is the first line a scrolling viewer reads. Write it as a plain, human
sentence someone would say out loud. Put the surprising part in the title itself
rather than hinting at it.

Never use the construction "The <noun> That <verb>ed <thing>" or its relatives:
"That Built", "That Became", "That Named", "That Silenced", "Behind", "Hidden In".
This shape has been overused on this account and now reads as a formula.

Titles that worked, and why:
- "The Drummer Who Actually Had No Beard" — a concrete, funny contradiction
- "Blackmore Hated Deep Purple Farewell" — plain speech, a real opinion, names names

Titles that failed, and why:
- "The Ping That Built Echoes" — abstract, offers the reader nothing
- "The Dulcimer That Built Blue" — the reader cannot tell what the story is

Vary the grammatical shape from post to post. Do not settle into a new formula.`;

/** Extracts the first complete JSON object from text, correctly tracking brace depth. */
function extractFirstJson(text: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return text.slice(start, i + 1); }
  }
  return null;
}

export async function generateStoryContent(
  usedArtists: string[] = [],
  forcedCategory?: PostCategory,
  todayEvent?: TodayEvent,
  recentSummaries: { artist: string; title: string; category: string }[] = [],
  breakingNews?: string
): Promise<StoryContent> {
  // Pick an artist that has not featured recently, widening the window only as
  // far as needed. The previous version fell straight back to "anything not in
  // the last 3 posts" whenever the pool was exhausted, which let the same artist
  // reappear within a few days.
  const recent = usedArtists.map((a) => a.toLowerCase());
  let finalPool: string[] = [];
  for (const tier of RECENCY_TIERS) {
    const blocked = new Set(recent.slice(0, tier));
    finalPool = ARTISTS_POOL.filter((a) => !blocked.has(a.toLowerCase()));
    if (finalPool.length > 0) break;
  }
  if (finalPool.length === 0) finalPool = ARTISTS_POOL;
  const randomArtist = finalPool[Math.floor(Math.random() * finalPool.length)];

  // Event takes priority, but skip if that artist featured recently
  const eventBlocked = new Set(recent.slice(0, EVENT_RECENCY));
  const eventArtist = todayEvent && !eventBlocked.has(todayEvent.artist.toLowerCase())
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
    ? `\n\nDO NOT repeat any of the following stories that have already been published. Choose a completely different song, album, event, or aspect of the artist's career. Also vary your title's sentence shape from theirs — if several share a construction, do not write a fourth in that mould:\n${dedupeLines}${artistSummaries.length > 0 ? `\n\nThis artist (${artist}) has already been featured ${artistSummaries.length} time(s) — pick a different era, album, or story angle.` : ""}`
    : "";

  const prompt = basePrompt + newsSuffix + eventSuffix + dedupeSuffix + TITLE_RULES;

  const text = await generate(prompt);
  const rawJson = extractFirstJson(text);
  if (!rawJson) throw new Error("Failed to parse Gemini response as JSON");

  let content: StoryContent;
  try {
    content = JSON.parse(rawJson) as StoryContent;
  } catch {
    // Salvage: replace smart quotes, dashes, and other non-ASCII punctuation
    const sanitized = rawJson
      .replace(/[ -]/g, " ")   // control chars
      .replace(/[‘’ʼ`]/g, "'") // smart single quotes
      .replace(/[“”]/g, '"')             // smart double quotes
      .replace(/[–—]/g, "-")             // en/em dashes
      .replace(/[…]/g, "...")                  // ellipsis
      .replace(/[ ]/g, " ");                   // non-breaking space
    try {
      content = JSON.parse(sanitized) as StoryContent;
    } catch (e2) {
      throw new Error(`Gemini JSON unparseable after sanitization: ${e2 instanceof Error ? e2.message : e2}\n\nRaw: ${rawJson.slice(0, 200)}`);
    }
  }
  // Always enforce category; only enforce artist when no breaking news
  // (breaking news lets the model set the artist from the news subject)
  content.category = category;
  if (!breakingNews) content.artist = artist;

  if (FORMULAIC_TITLE.test(content.title ?? "")) {
    console.warn(`[claude] formulaic title slipped through: "${content.title}"`);
  }

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
  const searchSubject = overrides?.albumName
    ? `${artist} ${overrides.albumName}`
    : artist;
  const searchQ = searchSubject.trim().replace(/\s+/g, "+");
  const wikiSlug = artist.trim().replace(/ /g, "_");
  return {
    spotify: overrides?.spotifyUrl ?? `https://open.spotify.com/search/${encodeURIComponent(searchSubject)}`,
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
