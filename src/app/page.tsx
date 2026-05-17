"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GeneratedPost, Platform, PostCategory } from "@/types";
import { ImageStyle, IMAGE_STYLE_LABELS } from "@/lib/imagegen";

type Tab = "dashboard" | "generate";

const PLATFORM_META: Partial<Record<Platform, { label: string; icon: string; color: string }>> = {
  instagram: { label: "Instagram", icon: "📸", color: "text-pink-400" },
  reel: { label: "Reel", icon: "🎬", color: "text-purple-400" },
  facebook: { label: "Facebook", icon: "👥", color: "text-blue-400" },
  tiktok: { label: "TikTok", icon: "🎵", color: "text-cyan-400" },
  youtube: { label: "YouTube", icon: "▶️", color: "text-red-400" },
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<GeneratedPost | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "instagram",
    "reel",
    "facebook",
  ]);
  const [selectedCategory, setSelectedCategory] = useState<PostCategory | "random">("random");
  const [selectedStyle, setSelectedStyle] = useState<ImageStyle>("random");
  const [breakingNews, setBreakingNews] = useState("");
  const [generatingStep, setGeneratingStep] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/history?limit=50");
      const data = await res.json();
      setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    setActiveSlide(0);
  }, [selectedPost?.id]);

  async function handleGenerate(publish: boolean) {
    setGenerating(true);
    setGeneratingStep(0);
    setError(null);

    // Advance steps on a timer matching approximate server durations
    const stepDelays = [4000, 10000, 28000, 38000, 55000, 100000, 115000, 130000];
    const timers: ReturnType<typeof setTimeout>[] = [];
    stepDelays.forEach((delay, i) => {
      timers.push(setTimeout(() => setGeneratingStep(i + 1), delay));
    });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          category: selectedCategory === "random" ? undefined : selectedCategory,
          imageStyle: selectedStyle,
          breakingNews: breakingNews.trim() || undefined,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (publish && data.post?.id && selectedPlatforms.length > 0) {
        setPosting(data.post.id);
        const postRes = await fetch("/api/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: data.post.id, platforms: selectedPlatforms }),
        });
        const postData = await postRes.json();
        if (postData.errors?.length) setError(postData.errors.join(" | "));
      }

      await fetchPosts();
      setTab("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      timers.forEach(clearTimeout);
      setGenerating(false);
      setGeneratingStep(0);
      setPosting(null);
    }
  }

  async function handleRefresh(postId: string) {
    setRefreshing(postId);
    setError(null);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await fetchPosts();
      if (selectedPost?.id === postId) setSelectedPost(data.post);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(null);
    }
  }

  async function handleDelete(postId: string) {
    setDeleting(postId);
    try {
      await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      await fetchPosts();
      if (selectedPost?.id === postId) setSelectedPost(null);
    } finally {
      setDeleting(null);
    }
  }

  async function handlePost(postId: string, platforms: Platform[]) {
    setPosting(postId);
    setError(null);
    try {
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, platforms }),
      });
      const data = await res.json();
      if (data.errors?.length) setError(data.errors.join(" | "));
      await fetchPosts();
      // Refresh the selected post if open
      if (selectedPost?.id === postId) {
        const updated = (await (await fetch("/api/history?limit=50")).json()).posts ?? [];
        setSelectedPost(updated.find((p: GeneratedPost) => p.id === postId) ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(null);
    }
  }

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  const platformBadge = (post: GeneratedPost, p: Platform) => {
    const meta = PLATFORM_META[p];
    if (!meta) return null;
    const result = post.platforms?.[p];
    if (!result || result.status === "pending")
      return <span key={p} className="text-gray-600 text-xs">{meta.icon}</span>;
    if (result.status === "posted")
      return <span key={p} className={`text-xs ${meta.color}`}>{meta.icon}✓</span>;
    if (result.status === "failed")
      return <span key={p} className="text-xs text-red-500">{meta.icon}✗</span>;
    return null;
  };

  const overallStatusColor = (status: GeneratedPost["status"]) => {
    switch (status) {
      case "posted": return "bg-green-900 text-green-300";
      case "image_ready": return "bg-blue-900 text-blue-300";
      case "failed": return "bg-red-900 text-red-300";
      default: return "bg-gray-700 text-gray-300";
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-amber-400">MusicLedge</h1>
          <p className="text-xs text-gray-500">
            Rock &amp; Pop Stories • Instagram · Facebook
          </p>
        </div>
        <nav className="flex gap-2 items-center">
          {(["dashboard", "generate"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-amber-500 text-black"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {t === "dashboard" ? "Posts" : "Generate"}
            </button>
          ))}
          <button
            onClick={async () => { await fetch("/api/auth", { method: "DELETE" }); router.push("/login"); }}
            className="px-3 py-2 rounded text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </nav>
      </header>

      {error && (
        <div className="mx-6 mt-4 bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      <main className="p-6">
        {/* Generate tab */}
        {tab === "generate" && (
          <div className="max-w-lg mx-auto mt-12">
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">🎸</div>
              <h2 className="text-2xl font-bold mb-2">Generate a New Post</h2>
              <p className="text-gray-400 text-sm">
                Claude picks a story → AI creates the image → optionally publishes to social.
              </p>
            </div>

            {/* Platform selector */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Post to</p>
              <div className="flex gap-3">
                {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      selectedPlatforms.includes(p)
                        ? "bg-gray-700 border-gray-500 text-white"
                        : "bg-gray-900 border-gray-700 text-gray-500"
                    }`}
                  >
                    {PLATFORM_META[p]?.icon} {PLATFORM_META[p]?.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category selector */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Content type</p>
              <div className="flex gap-2">
                {([["random", "🎲 Random"], ["music_story", "🎵 Music Story"], ["vinyl_art", "💿 Vinyl Art"], ["harmony", "🎸 Harmony"]] as [PostCategory | "random", string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setSelectedCategory(val)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      selectedCategory === val
                        ? val === "vinyl_art" ? "bg-cyan-900/50 border-cyan-600 text-cyan-300"
                        : val === "harmony" ? "bg-purple-900/50 border-purple-600 text-purple-300"
                        : "bg-gray-700 border-gray-500 text-white"
                        : "bg-gray-900 border-gray-700 text-gray-500"
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Image style selector — shown for music story or random */}
            {selectedCategory !== "vinyl_art" && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Image style</p>
                <div className="flex gap-2">
                  {(Object.entries(IMAGE_STYLE_LABELS) as [ImageStyle, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setSelectedStyle(val)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        selectedStyle === val
                          ? "bg-gray-700 border-gray-500 text-white"
                          : "bg-gray-900 border-gray-700 text-gray-500"
                      }`}
                    >{val === "random" ? "🎲 Random" : val === "vintage" ? "📷 Vintage" : val === "concert" ? "🎤 Concert" : "🎬 Editorial"}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Breaking news override */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Breaking news <span className="normal-case text-gray-600">(optional — overrides auto-pick)</span></p>
              <textarea
                value={breakingNews}
                onChange={(e) => setBreakingNews(e.target.value)}
                placeholder="e.g. Oasis announces reunion tour — Liam and Noel Gallagher to perform together again"
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            {generating && (() => {
              const steps = [
                { label: "Checking today's music events & news", icon: "📡", delay: 0 },
                { label: "Generating story with Claude", icon: "✍️", delay: 4000 },
                { label: "Creating AI image", icon: "🎨", delay: 10000 },
                { label: "Composing main slide", icon: "🖼️", delay: 28000 },
                { label: "Composing carousel slides 2–4", icon: "📐", delay: 38000 },
                { label: "Generating animated reel", icon: "🎬", delay: 55000 },
                { label: "Uploading to cloud", icon: "☁️", delay: 100000 },
                { label: "Creating Substack draft", icon: "📧", delay: 115000 },
                { label: posting ? "Publishing to social platforms" : "Finalising…", icon: posting ? "📲" : "✅", delay: 130000 },
              ];
              return (
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-4">
                  <div className="space-y-2.5">
                    {steps.map((step, i) => {
                      const active = i === generatingStep;
                      const done = i < generatingStep;
                      return (
                        <div key={i} className={`flex items-center gap-3 transition-opacity duration-300 ${done || active ? "opacity-100" : "opacity-25"}`}>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${done ? "bg-green-500" : active ? "bg-amber-500 animate-pulse" : "bg-gray-700"}`}>
                            {done ? "✓" : active ? "…" : ""}
                          </div>
                          <span className={`text-sm ${active ? "text-white font-medium" : done ? "text-gray-500 line-through" : "text-gray-600"}`}>
                            {step.icon} {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-4 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.round((generatingStep / (steps.length - 1)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2 text-center">Takes 2–3 minutes · please wait</p>
                </div>
              );
            })()}
            <div className="flex gap-3">
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-lg transition-colors"
              >
                {generating ? "Working…" : "Preview Only"}
              </button>
              <button
                onClick={() => handleGenerate(true)}
                disabled={generating || selectedPlatforms.length === 0}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-3 rounded-lg transition-colors"
              >
                {generating ? "Working…" : "Generate & Publish"}
              </button>
            </div>
            <p className="text-xs text-gray-600 text-center mt-3">
              Preview Only saves the post for manual review. Generate &amp; Publish posts immediately to selected platforms.
            </p>
          </div>
        )}

        {/* Dashboard tab */}
        {tab === "dashboard" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Post History ({posts.length})</h2>
              <button onClick={fetchPosts} className="text-sm text-gray-400 hover:text-gray-200">
                Refresh
              </button>
            </div>

            {loading && <p className="text-gray-500 text-sm">Loading…</p>}

            {!loading && posts.length === 0 && (
              <div className="text-center py-20 text-gray-600">
                <p className="text-4xl mb-4">📭</p>
                <p>No posts yet. Generate your first one!</p>
                <button
                  onClick={() => setTab("generate")}
                  className="mt-4 text-amber-400 hover:text-amber-300 text-sm"
                >
                  Go to Generate →
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden cursor-pointer hover:border-gray-600 transition-colors"
                  onClick={() => setSelectedPost(post)}
                >
                  {post.imageBase64 ? (
                    <img
                      src={`data:image/jpeg;base64,${post.imageBase64}`}
                      alt={post.content.title}
                      className="w-full aspect-square object-cover"
                    />
                  ) : post.blobUrl ? (
                    <img src={post.blobUrl} alt={post.content.title} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-gray-800 flex items-center justify-center text-gray-600 text-4xl">🎵</div>
                  )}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className={`text-xs font-semibold truncate ${post.content.category === "vinyl_art" ? "text-cyan-400" : post.content.category === "harmony" ? "text-purple-400" : "text-amber-400"}`}>{post.content.artist}</p>
                          {post.content.category === "vinyl_art" && (
                            <span className="text-xs bg-cyan-900/50 text-cyan-400 px-1.5 py-0.5 rounded shrink-0">Vinyl Art</span>
                          )}
                          {post.content.category === "harmony" && (
                            <span className="text-xs bg-purple-900/50 text-purple-400 px-1.5 py-0.5 rounded shrink-0">Harmony</span>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{post.content.title}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${overallStatusColor(post.status)}`}>
                        {post.status.replace("_", " ")}
                      </span>
                    </div>

                    {/* Platform badges */}
                    <div className="flex gap-2 mt-1 mb-2">
                      {(Object.keys(PLATFORM_META) as Platform[]).map((p) => platformBadge(post, p))}
                    </div>

                    {post.todayEvent && (
                      <p className="text-xs text-green-400 mb-1">🎂 {post.todayEvent}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {new Date(post.createdAt).toLocaleDateString()}
                      {(() => {
                        const postedAt = Object.values(post.platforms).find(p => p.postedAt)?.postedAt;
                        return postedAt ? ` · ${new Date(postedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
                      })()}
                    </p>

                    {post.blobUrl && selectedPlatforms.some(p => post.platforms[p]?.status === "pending") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePost(post.id, selectedPlatforms.filter(p => post.platforms[p]?.status === "pending")); }}
                        disabled={posting === post.id}
                        className="mt-2 w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded transition-all"
                      >
                        {posting === post.id ? "Posting…" : `Post to ${selectedPlatforms.filter(p => post.platforms[p]?.status === "pending").length} pending`}
                      </button>
                    )}
                    {post.status === "image_ready" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRefresh(post.id); }}
                        disabled={refreshing === post.id}
                        className="mt-1 w-full bg-gray-800 hover:bg-blue-900/40 disabled:opacity-50 text-gray-500 hover:text-blue-400 text-xs py-1 rounded transition-all"
                      >
                        {refreshing === post.id ? "Refreshing…" : "🔄 Refresh images"}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}
                      disabled={deleting === post.id}
                      className="mt-1 w-full bg-gray-800 hover:bg-red-900/40 disabled:opacity-50 text-gray-500 hover:text-red-400 text-xs py-1 rounded transition-all"
                    >
                      {deleting === post.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Post detail modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {(selectedPost.status === "pending" || selectedPost.status === "image_ready") && (
              <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                {selectedPost.status === "image_ready" && (
                  <button
                    onClick={() => handleRefresh(selectedPost.id)}
                    disabled={refreshing === selectedPost.id}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    {refreshing === selectedPost.id ? "Refreshing images…" : "🔄 Refresh images"}
                  </button>
                )}
                {selectedPost.status === "pending" && <span />}
                <button
                  onClick={() => handleDelete(selectedPost.id)}
                  disabled={deleting === selectedPost.id}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {deleting === selectedPost.id ? "Removing…" : "🗑 Remove this post"}
                </button>
              </div>
            )}
            {/* Carousel viewer — uses carouselBlobUrls when available, else main image */}
            {(() => {
              const slides = selectedPost.carouselBlobUrls?.length
                ? selectedPost.carouselBlobUrls
                : selectedPost.imageBase64
                ? [`data:image/jpeg;base64,${selectedPost.imageBase64}`]
                : selectedPost.blobUrl
                ? [selectedPost.blobUrl]
                : [];
              if (!slides.length) return null;
              const total = slides.length;
              return (
                <div className="relative rounded-t-2xl overflow-hidden">
                  <img
                    src={slides[activeSlide]}
                    alt={`Slide ${activeSlide + 1}`}
                    className="w-full"
                  />
                  {/* Prev / Next */}
                  {activeSlide > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveSlide(i => i - 1); }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full w-9 h-9 flex items-center justify-center text-lg transition-colors"
                    >‹</button>
                  )}
                  {activeSlide < total - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveSlide(i => i + 1); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full w-9 h-9 flex items-center justify-center text-lg transition-colors"
                    >›</button>
                  )}
                  {/* Dot indicators */}
                  {total > 1 && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {slides.map((_, i) => (
                        <button
                          key={i}
                          onClick={(e) => { e.stopPropagation(); setActiveSlide(i); }}
                          className={`rounded-full transition-all ${i === activeSlide ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/40"}`}
                        />
                      ))}
                    </div>
                  )}
                  {/* Counter */}
                  {total > 1 && (
                    <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                      {activeSlide + 1} / {total}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="p-6">
<div className="flex items-center gap-2 mb-1">
                <p className={`text-sm font-bold ${selectedPost.content.category === "vinyl_art" ? "text-cyan-400" : selectedPost.content.category === "harmony" ? "text-purple-400" : "text-amber-400"}`}>{selectedPost.content.artist}</p>
                {selectedPost.content.category === "vinyl_art" && (
                  <span className="text-xs bg-cyan-900/50 text-cyan-400 px-2 py-0.5 rounded">Vinyl Art</span>
                )}
                {selectedPost.content.category === "harmony" && (
                  <span className="text-xs bg-purple-900/50 text-purple-400 px-2 py-0.5 rounded">Harmony</span>
                )}
              </div>
              <h3 className="text-xl font-bold mb-1">{selectedPost.content.title}</h3>
              {selectedPost.todayEvent && (
                <p className="text-xs text-green-400 mb-3">🎂 {selectedPost.todayEvent}</p>
              )}
              <p className="text-gray-300 text-sm mb-4">{selectedPost.content.story}</p>

              {/* Harmony details */}
              {selectedPost.content.category === "harmony" && (
                <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-4 mb-4 space-y-2">
                  {selectedPost.content.influenceSource && (
                    <div className="text-xs"><span className="text-purple-400 font-semibold">Original: </span><span className="text-gray-300">{selectedPost.content.influenceSource}</span></div>
                  )}
                  {selectedPost.content.influencedWork && (
                    <div className="text-xs"><span className="text-purple-400 font-semibold">Influenced: </span><span className="text-gray-300">{selectedPost.content.influencedWork}</span></div>
                  )}
                  {selectedPost.content.genre && (
                    <div className="text-xs"><span className="text-purple-400 font-semibold">Genre lineage: </span><span className="text-gray-300">{selectedPost.content.genre}</span></div>
                  )}
                  {selectedPost.content.similarityLevel && (
                    <div className="text-xs"><span className="text-purple-400 font-semibold">Similarity: </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        selectedPost.content.similarityLevel === "nearly_identical" ? "bg-red-900/50 text-red-300" :
                        selectedPost.content.similarityLevel === "clear_influence" ? "bg-yellow-900/50 text-yellow-300" :
                        "bg-green-900/50 text-green-300"
                      }`}>
                        {selectedPost.content.similarityLevel.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}
                  {selectedPost.content.emotion && (
                    <div className="text-xs"><span className="text-purple-400 font-semibold">Emotion: </span><span className="text-gray-300 capitalize">{selectedPost.content.emotion}</span></div>
                  )}
                  {selectedPost.content.activityTags && selectedPost.content.activityTags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap pt-1">
                      {selectedPost.content.activityTags.map((tag) => (
                        <span key={tag} className="text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Platform status */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
                  const result = selectedPost.platforms?.[p];
                  const meta = PLATFORM_META[p];
                  if (!meta) return null;
                  return (
                    <div key={p} className="bg-gray-800 rounded-lg p-3 text-center">
                      <div className="text-lg mb-1">{meta.icon}</div>
                      <div className="text-xs font-medium">{meta.label}</div>
                      <div className={`text-xs mt-1 ${
                        result?.status === "posted" ? "text-green-400" :
                        result?.status === "failed" ? "text-red-400" :
                        "text-gray-500"
                      }`}>
                        {result?.status ?? "pending"}
                      </div>
                      {result?.postId && p === "youtube" && (
                        <a href={`https://www.youtube.com/shorts/${result.postId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">View</a>
                      )}
                      {result?.postId && p === "facebook" && (
                        <a href={`https://www.facebook.com/${result.postId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">View</a>
                      )}
                      {result?.postId && p === "reel" && (
                        <a href={`https://www.instagram.com/reel/${result.postId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">View</a>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-800 pt-4 mb-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Caption</p>
                <p className="text-sm text-gray-300 whitespace-pre-line">{selectedPost.content.caption}</p>
                <p className="text-sm text-blue-400 mt-2">
                  {selectedPost.content.hashtags.map((h) => `#${h}`).join(" ")}
                </p>
              </div>

              {/* Related music links */}
              <div className="border-t border-gray-800 pt-4 mb-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Music Links</p>
                <div className="flex gap-2 flex-wrap">
                  {(() => {
                    const artistQ = encodeURIComponent(selectedPost.content.artist);
                    const fullQ = encodeURIComponent(`${selectedPost.content.artist} ${selectedPost.content.title}`);
                    const wikiSlug = encodeURIComponent(selectedPost.content.artist.trim().replace(/ /g, "_"));
                    return (
                      <>
                        <a href={`https://open.spotify.com/search/${fullQ}`} target="_blank" rel="noopener noreferrer"
                          className="flex-1 text-center bg-green-900/20 border border-green-700/40 text-green-400 text-xs font-medium py-2 rounded-lg hover:bg-green-900/40 transition-colors">
                          🎧 Spotify
                        </a>
                        <a href={`https://www.youtube.com/results?search_query=${fullQ}`} target="_blank" rel="noopener noreferrer"
                          className="flex-1 text-center bg-red-900/20 border border-red-700/40 text-red-400 text-xs font-medium py-2 rounded-lg hover:bg-red-900/40 transition-colors">
                          ▶️ YouTube
                        </a>
                        <a href={`https://en.wikipedia.org/wiki/${wikiSlug}`} target="_blank" rel="noopener noreferrer"
                          className="flex-1 text-center bg-gray-700/30 border border-gray-600/40 text-gray-300 text-xs font-medium py-2 rounded-lg hover:bg-gray-700/50 transition-colors">
                          📖 Wikipedia
                        </a>
                        <a href={`https://music.apple.com/search?term=${artistQ}`} target="_blank" rel="noopener noreferrer"
                          className="flex-1 text-center bg-pink-900/20 border border-pink-700/40 text-pink-400 text-xs font-medium py-2 rounded-lg hover:bg-pink-900/40 transition-colors">
                          🍎 Apple Music
                        </a>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Monetisation + Story links */}
              <div className="flex gap-3 mb-4 flex-wrap">
                {selectedPost.affiliateUrl && (
                  <a
                    href={selectedPost.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 text-xs font-medium py-2 rounded-lg hover:bg-yellow-600/30 transition-colors"
                  >
                    🛒 Amazon affiliate link
                  </a>
                )}
                {selectedPost.substackDraftUrl && (
                  <a
                    href={selectedPost.substackDraftUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-orange-600/20 border border-orange-600/40 text-orange-400 text-xs font-medium py-2 rounded-lg hover:bg-orange-600/30 transition-colors"
                  >
                    📧 Review Substack draft
                  </a>
                )}
                {selectedPost.storyBlobUrl && (
                  <a
                    href={selectedPost.storyBlobUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-amber-600/20 border border-amber-600/40 text-amber-400 text-xs font-medium py-2 rounded-lg hover:bg-amber-600/30 transition-colors"
                  >
                    📲 Download Story
                  </a>
                )}
                {selectedPost.reelBlobUrl && (
                  <a
                    href={selectedPost.reelBlobUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-purple-600/20 border border-purple-600/40 text-purple-400 text-xs font-medium py-2 rounded-lg hover:bg-purple-600/30 transition-colors"
                  >
                    🎬 Download Reel
                  </a>
                )}
              </div>

              {selectedPost.blobUrl && (Object.values(selectedPost.platforms).some(p => p.status === "pending")) && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Post to</p>
                  <div className="flex gap-2 mb-3">
                    {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
                      const isPending = selectedPost.platforms[p]?.status === "pending";
                      return (
                        <button
                          key={p}
                          onClick={() => isPending && togglePlatform(p)}
                          disabled={!isPending}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            !isPending
                              ? "bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed"
                              : selectedPlatforms.includes(p)
                              ? "bg-gray-700 border-gray-500 text-white"
                              : "bg-gray-900 border-gray-700 text-gray-500"
                          }`}
                        >
                          {PLATFORM_META[p]?.icon} {PLATFORM_META[p]?.label}
                          {!isPending && <span className="block text-xs opacity-50">done</span>}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => { handlePost(selectedPost.id, selectedPlatforms.filter(p => selectedPost.platforms[p]?.status === "pending")); setSelectedPost(null); }}
                    disabled={posting === selectedPost.id || selectedPlatforms.filter(p => selectedPost.platforms[p]?.status === "pending").length === 0}
                    className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-all"
                  >
                    {posting === selectedPost.id ? "Posting…" : `Post to ${selectedPlatforms.filter(p => selectedPost.platforms[p]?.status === "pending").length} platform${selectedPlatforms.filter(p => selectedPost.platforms[p]?.status === "pending").length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
