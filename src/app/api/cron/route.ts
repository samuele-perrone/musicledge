/**
 * Vercel Cron endpoint — runs at 08:30 and 11:30 UTC.
 * Generates one post, creates a karaoke reel video, and publishes it
 * as an Instagram Reel.
 */
import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, buildRelatedLinks, buildRelatedLinksCaption, getTodaysMusicEvent, getBreakingMusicNews } from "@/lib/claude";
import { searchAlbum, fetchAlbumArtAsBase64, searchArtistInfo, fetchImageAsBase64FromUrl, searchAdditionalImages } from "@/lib/musicapi";
import { composeImage } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createKaraokeReelVideo, findAudioTrack, REEL_COVER_OFFSET_MS } from "@/lib/video";
import { savePost, getRecentArtists, getRecentPostSummaries } from "@/lib/store";
import { scheduledSeries, seriesMeta } from "@/lib/series";
import { createReelContainer, checkContainerStatus, publishMediaContainer, buildPostTags } from "@/lib/instagram";
import { GeneratedPost, defaultPlatforms, PostCategory } from "@/types";
import crypto from "crypto";

export const maxDuration = 300;

async function sendErrorAlert(errors: string[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Musicledge <onboarding@resend.dev>",
      to,
      subject: "Musicledge cron errors",
      html: `<p>The following errors occurred during today's cron run:</p><ul>${errors.map(e => `<li>${e}</li>`).join("")}</ul>`,
    }),
  });
}

// POST — triggered manually from the dashboard
export async function POST() {
  return runCron();
}

// GET — triggered by Vercel cron scheduler (secret required)
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron();
}

async function runCron() {
  const log: string[] = [];

  try {
    const today = new Date();
    const [todayEvent, breakingNews] = await Promise.all([
      getTodaysMusicEvent(today),
      getBreakingMusicNews(),
    ]);

    if (breakingNews) log.push(`Breaking news: ${breakingNews}`);
    if (todayEvent) log.push(`Today's event: ${todayEvent.event} — ${todayEvent.artist}`);

    // Pulled deeper than the prompt summaries: this list only blocks artist reuse,
    // so it can cover a wide window without inflating the generation prompt.
    const usedArtists = await getRecentArtists(90);
    const recentSummaries = await getRecentPostSummaries(40);

    // Suppress breaking news if the artist was already covered recently
    const recentNewsArtists = usedArtists.slice(0, 10).map((a) => a.toLowerCase());
    const newsAboutRecentArtist = breakingNews && recentNewsArtists.some((a) =>
      a.split(/[\s/,]+/).some((word) => word.length > 3 && breakingNews.toLowerCase().includes(word))
    );
    const activeBreakingNews = newsAboutRecentArtist ? null : breakingNews;
    if (newsAboutRecentArtist) log.push(`Breaking news suppressed — artist recently posted`);

    // Each series owns fixed slots so a viewer can learn that, say, Tuesday is
    // Banned. Breaking news still takes the slot, using the general format —
    // running today's news as "Banned" or "Same Riff" would read as nonsense.
    const scheduled = scheduledSeries();
    const category: PostCategory = activeBreakingNews ? "music_story" : scheduled;
    log.push(`Series: ${seriesMeta(category).label}${activeBreakingNews ? ` (breaking news took the ${seriesMeta(scheduled).label} slot)` : ""}`);

    console.log(`[cron] generating content, category=${category}`);
    const content = await generateStoryContent(
      usedArtists,
      category,
      activeBreakingNews ? undefined : (todayEvent ?? undefined),
      recentSummaries,
      activeBreakingNews ?? undefined
    );
    log.push(`Post: "${content.title}" — ${content.artist}`);
    console.log(`[cron] content ready: "${content.title}" — ${content.artist}`);

    const affiliateUrl = buildAffiliateUrl(content.amazonSearchTerms);
    const post: GeneratedPost = {
      id: crypto.randomUUID(),
      content,
      affiliateUrl,
      todayEvent: todayEvent?.event,
      platforms: defaultPlatforms(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await savePost(post);

    // Fetch real image — never fall back to AI
    console.log(`[cron] fetching image for ${content.artist}`);
    let imageBase64: string;
    if (category === "sleeve_stories" && content.albumName) {
      const albumInfo = await searchAlbum(content.artist, content.albumName).catch(() => null);
      if (albumInfo) {
        imageBase64 = await fetchAlbumArtAsBase64(albumInfo.artworkUrl);
        post.albumInfo = albumInfo;
        log.push(`Album art: ${albumInfo.albumName}`);
      } else {
        // Fall back to artist photo if album not found
        const artistInfo = await searchArtistInfo(content.artist).catch(() => null);
        if (!artistInfo) throw new Error(`No real image found for ${content.artist}`);
        imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
        post.artistInfo = artistInfo;
        log.push(`Album art not found, using artist photo: ${artistInfo.artistName}`);
      }
    } else {
      const artistInfo = await searchArtistInfo(content.artist).catch(() => null);
      if (!artistInfo) throw new Error(`No real image found for ${content.artist}`);
      imageBase64 = await fetchImageAsBase64FromUrl(artistInfo.imageUrl);
      post.artistInfo = artistInfo;
      log.push(`Artist photo: ${artistInfo.artistName}`);
    }

    // Compose cover image (for dashboard preview + intro reel frame)
    console.log(`[cron] composing cover image`);
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;

    // Create karaoke reel
    const slides = content.carouselSlides ?? [];
    const primaryBuffer = Buffer.from(imageBase64, "base64");

    // Same logic for all categories: slides 2-3 use real artist photo (Deezer/Spotify)
    const isRealArtistPhoto = !!post.artistInfo?.isArtistPhoto;
    let artistPhotoBuffer: Buffer | null = isRealArtistPhoto ? primaryBuffer : null;

    if (!isRealArtistPhoto) {
      try {
        const info = await searchArtistInfo(content.artist);
        if (info?.isArtistPhoto && info.imageUrl) {
          artistPhotoBuffer = Buffer.from(
            await fetchImageAsBase64FromUrl(info.imageUrl), "base64"
          );
          log.push(`Artist photo for slides: ${info.artistName}`);
        }
      } catch {}
    }

    // For sleeve_stories without artist photo: repeat the album cover (consistent look).
    // For other categories: fetch additional album arts for visual variety.
    const albumArts = (!artistPhotoBuffer && category !== "sleeve_stories")
      ? await searchAdditionalImages(content.artist, 2).catch(() => [] as Buffer[])
      : ([] as Buffer[]);

    const imageBuffers = [
      primaryBuffer,
      primaryBuffer,
      artistPhotoBuffer ?? albumArts[0] ?? primaryBuffer,
      artistPhotoBuffer ?? albumArts[1] ?? primaryBuffer,
    ];

    console.log(`[cron] creating reel video`);
    const reelBuffer = await createKaraokeReelVideo(
      imageBuffers,
      slides,
      { artist: content.artist, title: content.title, category: content.category ?? "music_story", imageCaption: content.imageCaption },
      findAudioTrack(content.musicGenre)
    );
    console.log(`[cron] reel encoded (${reelBuffer.length} bytes), uploading`);
    const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel.mp4`);
    post.reelBlobUrl = reelBlobUrl;
    log.push(`Reel video: ${reelBlobUrl}`);

    // Build caption
    const hashtags = content.hashtags.map((h) => `#${h}`).join(" ");
    const relatedLinks = buildRelatedLinks(content.artist, content.title, {
      spotifyUrl: post.albumInfo?.spotifyUrl ?? post.artistInfo?.spotifyUrl,
      appleMusicUrl: post.albumInfo?.appleMusicUrl ?? post.artistInfo?.appleMusicUrl,
      albumName: post.albumInfo?.albumName ?? content.albumName,
    });
    const linksBlock = buildRelatedLinksCaption(relatedLinks, affiliateUrl);
    const creditLine = post.albumInfo
      ? `\n📷 Album artwork © ${post.albumInfo.artistName}, via ${post.albumInfo.source === "deezer" ? "@deezer" : "@applemusic"}`
      : post.artistInfo
      ? `\n📷 Photo © ${post.artistInfo.artistName}, via @spotify`
      : "";
    const { artistHandle, userTags, mentionLine } = buildPostTags(content);
    if (artistHandle) log.push(`Tagging @${artistHandle}`);
    else if (content.instagramHandle) {
      log.push(`Handle "${content.instagramHandle}" rejected — does not match ${content.artist}`);
    }

    const suffix = `${mentionLine}${creditLine}\n\n${hashtags}\n\n${linksBlock}`;
    const maxBody = 2200 - suffix.length - 4;
    const captionBody = content.caption.length > maxBody
      ? content.caption.slice(0, maxBody).trimEnd() + "…"
      : content.caption;
    const caption = `${captionBody}${suffix}`;

    post.status = "image_ready";
    await savePost(post);

    const errors: string[] = [];

    // ── Instagram Reels ───────────────────────────────────────────────────────
    try {
      console.log(`[cron] creating Instagram reel container`);
      const containerId = await createReelContainer(reelBlobUrl, caption, {
        thumbOffsetMs: REEL_COVER_OFFSET_MS,
        userTags,
        shareToFeed: true,
      });
      let status = "IN_PROGRESS";
      let attempts = 0;
      while (status === "IN_PROGRESS" && attempts < 12) {
        await new Promise((r) => setTimeout(r, 5000));
        status = await checkContainerStatus(containerId);
        attempts++;
      }
      if (status !== "FINISHED") throw new Error(`Reel container not ready: ${status}`);
      const mediaId = await publishMediaContainer(containerId);
      post.platforms.reel = { status: "posted", postId: mediaId, postedAt: new Date().toISOString() };
      log.push(`Instagram Reel: ${mediaId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post.platforms.reel = { status: "failed", error: msg };
      errors.push(`Instagram Reel: ${msg}`);
      log.push(`Instagram Reel failed: ${msg}`);
    }

    post.status = post.platforms.reel?.status === "posted" ? "posted" : "failed";
    await savePost(post);

    if (errors.length > 0) {
      await sendErrorAlert(errors).catch(() => {});
    }

    return NextResponse.json({ success: errors.length === 0, log, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron] FATAL:`, error);
    log.push(`FATAL: ${message}`);
    await sendErrorAlert([`FATAL: ${message}`]).catch(() => {});
    return NextResponse.json({ success: false, log, error: message }, { status: 500 });
  }
}
