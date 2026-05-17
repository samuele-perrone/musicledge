import { NextResponse } from "next/server";
import { generateStoryContent, buildAffiliateUrl, buildRelatedLinks, buildRelatedLinksHtml, getTodaysMusicEvent, getBreakingMusicNews } from "@/lib/claude";
import { generateImage, fetchImageAsBase64, ImageStyle } from "@/lib/imagegen";
import { composeImage, composeStory, composeCarouselSlide, makeVerticalSlide, composeFollowSlide } from "@/lib/compose";
import { uploadImageToBlob, uploadVideoToBlob } from "@/lib/blob";
import { createShortsVideo, createReelVideo, createAnimatedReelVideo } from "@/lib/video";
import { createSubstackDraft } from "@/lib/substack";
import { savePost, getRecentArtists, getRecentPostSummaries } from "@/lib/store";
import { GeneratedPost, defaultPlatforms, PostCategory } from "@/types";
import crypto from "crypto";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const forceArtist: string | undefined = body?.artist;
    const forceCategory: PostCategory | undefined = body?.category;
    const forceStyle: ImageStyle | undefined = body?.imageStyle;
    const manualNews: string | undefined = body?.breakingNews;

    const [todayEvent, autoNews] = await Promise.all([
      getTodaysMusicEvent(new Date()),
      manualNews ? Promise.resolve(null) : getBreakingMusicNews(),
    ]);
    const breakingNews = manualNews ?? autoNews ?? undefined;

    const usedArtists = await getRecentArtists(40);
    const recentSummaries = await getRecentPostSummaries(40);
    const category = forceCategory ?? todayEvent?.suggestedCategory;
    const content = await generateStoryContent(
      forceArtist ? [] : usedArtists,
      category,
      breakingNews ? undefined : (todayEvent ?? undefined),
      recentSummaries,
      breakingNews
    );
    if (forceArtist) content.artist = forceArtist;

    // Build Amazon affiliate URL
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

    // Generate and compose image
    const imageBase64 = await generateImage(content.imagePrompt, forceStyle);
    const composedBuffer = await composeImage(imageBase64, content);
    post.imageBase64 = composedBuffer.toString("base64");

    // Upload post image to Vercel Blob
    const blobUrl = await uploadImageToBlob(composedBuffer, `posts/${post.id}.jpg`);
    post.blobUrl = blobUrl;

    // Compose and upload Story image
    const storyBuffer = await composeStory(composedBuffer, content);
    const storyBlobUrl = await uploadImageToBlob(storyBuffer, `posts/${post.id}-story.jpg`);
    post.storyBlobUrl = storyBlobUrl;

    // Generate carousel slides (slides 2-4)
    const carouselBlobUrls: string[] = [blobUrl]; // slide 1 = main image
    if (content.carouselSlides?.length) {
      for (let i = 0; i < content.carouselSlides.length; i++) {
        try {
          const slideBuffer = await composeCarouselSlide(imageBase64, content, content.carouselSlides[i], i + 2, 4);
          const slideUrl = await uploadImageToBlob(slideBuffer, `posts/${post.id}-slide${i + 2}.jpg`);
          carouselBlobUrls.push(slideUrl);
        } catch (e) {
          console.warn(`[generate] Slide ${i + 2} failed:`, e);
        }
      }
    }
    // Add follow slide as final carousel slide
    try {
      const followBuffer = await composeFollowSlide(content);
      const followUrl = await uploadImageToBlob(followBuffer, `posts/${post.id}-follow.jpg`);
      carouselBlobUrls.push(followUrl);
    } catch (e) {
      console.warn("[generate] Follow slide failed:", e);
    }
    post.carouselBlobUrls = carouselBlobUrls;

    // Generate and upload Reel video using animated carousel frames
    try {
      const slide1Vertical = storyBuffer;
      const verticalFrames: Buffer[] = [slide1Vertical];
      if (content.carouselSlides?.length && carouselBlobUrls.length > 1) {
        for (let i = 1; i < carouselBlobUrls.length - 1; i++) {
          const slideBuffer = await composeCarouselSlide(imageBase64, content, content.carouselSlides[i - 1], i + 1, carouselBlobUrls.length);
          verticalFrames.push(await makeVerticalSlide(slideBuffer));
        }
      }
      // Add vertical follow slide as last reel frame
      const followBuffer = await composeFollowSlide(content);
      verticalFrames.push(await makeVerticalSlide(followBuffer));
      const reelBuffer = await createAnimatedReelVideo(verticalFrames);
      const reelBlobUrl = await uploadVideoToBlob(reelBuffer, `posts/${post.id}-reel.mp4`);
      post.reelBlobUrl = reelBlobUrl;
    } catch (reelErr) {
      console.warn("[generate] Reel video creation failed:", reelErr);
    }

    post.status = "image_ready";
    await savePost(post);

    // Create Substack draft (non-fatal if it fails)
    const relatedLinks = buildRelatedLinks(content.artist, content.title);
    const newsletterHtmlWithLinks = content.newsletterHtml + "\n\n" + buildRelatedLinksHtml(relatedLinks, affiliateUrl);
    try {
      const { id, url } = await createSubstackDraft(
        content.newsletterTitle,
        content.title,
        newsletterHtmlWithLinks,
        affiliateUrl
      );
      post.substackDraftId = id;
      post.substackDraftUrl = url;
      await savePost(post);
    } catch (substackErr) {
      console.warn("[generate] Substack draft failed:", substackErr);
    }

    return NextResponse.json({ success: true, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to generate a new post" });
}
