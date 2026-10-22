import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import {
  Users,
  Repeat,
  Camera,
  Rotate3d,
  Heart,
  ShieldCheck,
  Accessibility,
  Send,
  Share2,
  MessageSquare,
  Sparkles,
  Tag,
  Volume2,
  VolumeX,
  Bookmark,
  Clock,
  ArrowUpRight,
  Image as ImageIcon,
  Flame,
  CheckCircle2,
  Calendar,
  MapPin,
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import SecureExchange from "../components/SecureExchange";
import { Button, Badge, Card, Textarea, cx } from "../components/ui";

const tabs = [
  { id: "feed", label: "EaseConnect", icon: Users, desc: "Discussions & fan forums" },
  { id: "exchange", label: "EaseXchange", icon: Repeat, desc: "Ticket swaps" },
  { id: "views", label: "EasePix", icon: Camera, desc: "Real seat views" },
  { id: "access", label: "EaseXplore", icon: Accessibility, desc: "Venue guides" },
] as const;

type FilterType = "all" | "following" | "views" | "questions";

export default function Community() {
  const { posts, events, user, addPost } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = tabs.find((item) => item.id === requestedTab)?.id ?? "feed";

  const [draft, setDraft] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortOrder, setSortOrder] = useState<"trending" | "newest" | "discussed">("trending");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [likesCount, setLikesCount] = useState<Record<string, number>>({});
  const [activeVoicePlaying, setActiveVoicePlaying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [preview360Photo, setPreview360Photo] = useState<{ url: string; title: string; section?: string } | null>(null);

  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const setTab = (id: (typeof tabs)[number]["id"]) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", id);
      next.delete("view");
      return next;
    });
    const found = tabs.find((t) => t.id === id);
    if (found) {
      showToast(`${found.label} selected`);
    }
  };

  const eventName = (id: string) => events.find((e) => e.id === id)?.title ?? "Live Music";

  // Initialize event id for tagging
  useEffect(() => {
    if (events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Handle post likes
  const toggleLike = (postId: string, initialLikes: number) => {
    setLikedPosts((prev) => {
      const isLiked = !prev[postId];
      setLikesCount((prevCounts) => ({
        ...prevCounts,
        [postId]: (prevCounts[postId] ?? initialLikes) + (isLiked ? 1 : -1),
      }));
      showToast(isLiked ? "Added to your liked posts ❤️" : "Unliked post");
      return { ...prev, [postId]: isLiked };
    });
  };

  // Submit new post
  const submitPost = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!draft.trim()) {
      showToast("Write a little something before sharing.");
      textareaRef.current?.focus();
      return;
    }
    if (!user) {
      showToast("Please sign in to join the conversation.");
      navigate("/login");
      return;
    }

    const targetEventId = selectedEventId || (events[0]?.id ?? "ev-aurora");
    addPost({
      eventId: targetEventId,
      author: user.name.split(" ")[0] || "You",
      body: draft.trim(),
      section: photoUrl ? "C" : undefined,
      photo: photoUrl.trim() || undefined,
    });

    setDraft("");
    setPhotoUrl("");
    setShowPhotoInput(false);
    showToast("Your post has been shared to the community! ✨");
  };

  // EaseVoice narration toggle
  const toggleEaseVoice = () => {
    if (!("speechSynthesis" in window)) {
      showToast("Speech synthesis is not supported on this device.");
      return;
    }

    if (activeVoicePlaying) {
      window.speechSynthesis.cancel();
      setActiveVoicePlaying(false);
      showToast("EaseVoice audio paused.");
    } else {
      const topPost = posts[0];
      const textToSpeak = topPost
        ? `EaseVoice narration. Community post by ${topPost.author} on ${eventName(topPost.eventId)}. ${topPost.body}`
        : "Welcome to EaseComms. The night is better together. Discover real seat views, trade tickets securely, and find your people.";

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      utterance.onend = () => setActiveVoicePlaying(false);
      utterance.onerror = () => setActiveVoicePlaying(false);

      window.speechSynthesis.speak(utterance);
      setActiveVoicePlaying(true);
      showToast("Playing EaseVoice feed narration ▷");
    }
  };

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Filtered posts
  const filteredPosts = posts.filter((p) => {
    if (filter === "views") return Boolean(p.photo);
    if (filter === "questions") return p.body.includes("?") || p.body.toLowerCase().includes("ask");
    if (filter === "following") return p.author === "Nadia" || p.author === "Jules";
    return true;
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* 1. CINEMATIC LIVE-EVENT HERO BANNER */}
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-white/20 shadow-2xl transition-all">
        {/* Background Image & Multi-Stop Gradients */}
        <div
          className="relative min-h-[360px] sm:min-h-[390px] lg:min-h-[420px] p-6 sm:p-10 lg:p-12 text-white flex flex-col justify-between"
          style={{
            backgroundImage: `
              linear-gradient(90deg, rgba(27,7,44,0.92) 0%, rgba(50,19,79,0.80) 30%, rgba(50,19,79,0.42) 60%, rgba(216,61,165,0.20) 100%),
              linear-gradient(0deg, rgba(20,7,31,0.45) 0%, transparent 50%),
              url('/Neon_Festival_Lights_and_Euphoria.png')
            `,
            backgroundSize: "cover",
            backgroundPosition: "center 48%",
          }}
        >
          {/* Subtle Concentric Rings & Sparkle Overlay */}
          <div className="pointer-events-none absolute -top-40 -right-20 h-96 w-96 rounded-full border border-white/10 shadow-[0_0_0_35px_rgba(255,255,255,0.03),0_0_0_70px_rgba(255,255,255,0.02)]" />
          <div className="pointer-events-none absolute right-8 bottom-6 text-7xl sm:text-8xl lg:text-9xl font-black text-brand-orange/90 opacity-90 select-none drop-shadow-[0_0_40px_rgba(255,101,0,0.5)]">
            ✦
          </div>

          {/* Hero Content */}
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-brand-deep/60 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-lilac backdrop-blur-md">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-orange shadow-[0_0_0_4px_rgba(255,101,0,0.35)] animate-pulse" />
              YOUR PEOPLE. YOUR NEXT BIG NIGHT.
            </div>

            <h1 className="mt-4 font-brand text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[0.96] drop-shadow-md">
              THE NIGHT IS <br />
              <span className="font-feature italic font-black text-brand-orange drop-shadow-[0_4px_28px_rgba(255,101,0,0.45)]">
                BETTER TOGETHER.
              </span>
            </h1>

            <p className="mt-4 max-w-lg text-sm sm:text-base leading-relaxed text-brand-warm/95 drop-shadow">
              Find your people. Discover the view. Get hyped before the lights go down.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => {
                  composerRef.current?.scrollIntoView({ behavior: "smooth" });
                  setTimeout(() => textareaRef.current?.focus(), 400);
                }}
                className="cursor-pointer inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-orange to-brand-amber px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-brand-orange/30 transition-transform hover:-translate-y-0.5 hover:shadow-brand-orange/45 active:translate-y-0"
              >
                Get in the mix <ArrowUpRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  document.getElementById("community-grid")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-2xl border border-white/25 bg-white/10 px-4.5 py-3 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
              >
                Explore the community ↓
              </button>
            </div>
          </div>

          {/* Floating Community Live Stats Card */}
          <div className="relative z-10 mt-8 w-full max-w-xs rounded-2xl border border-white/60 bg-brand-warm/95 p-4.5 text-brand-deep shadow-xl backdrop-blur-xl sm:self-end lg:absolute lg:right-8 lg:bottom-8 lg:mt-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <small className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  YOUR COMMUNITY THIS WEEK
                </small>
                <h3 className="mt-0.5 font-brand text-xl font-extrabold tracking-tight text-brand-deep">
                  Feel the buzz.
                </h3>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-2.5 py-1 text-[10px] font-black text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" /> LIVE
              </span>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-brand-line bg-white/90 p-2.5">
                <strong className="block font-brand text-xl font-extrabold text-brand-deep">2.4k</strong>
                <span className="text-[10px] text-muted">Fans chatting</span>
              </div>
              <div className="rounded-xl border border-brand-line bg-white/90 p-2.5">
                <strong className="block font-brand text-xl font-extrabold text-brand-deep">186</strong>
                <span className="text-[10px] text-muted">Seat views shared</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THE BUZZ CONTINUOUS MARQUEE / TICKER BANNER */}
      <section
        className="mb-8 flex h-11 items-center gap-4 overflow-hidden rounded-xl bg-brand-deep text-white shadow-md shadow-brand-deep/15"
        aria-label="EventEase community highlights"
      >
        <span className="flex h-full shrink-0 items-center bg-brand-orange px-4 text-[10px] font-black uppercase tracking-wider text-white">
          THE BUZZ
        </span>
        <div className="flex min-w-0 items-center gap-6 overflow-hidden text-xs font-extrabold tracking-wider whitespace-nowrap">
          <span className="text-white">✦ FIND YOUR CROWD</span>
          <i className="not-italic text-brand-magenta text-sm">✳</i>
          <span className="text-brand-amber">SHARE THE VIEW</span>
          <i className="not-italic text-brand-purple text-sm">✦</i>
          <span className="text-white">SWAP YOUR SEAT</span>
          <i className="not-italic text-brand-magenta text-sm">✳</i>
          <span className="text-brand-amber">MAKE IT A NIGHT</span>
          <i className="not-italic text-brand-purple text-sm">✦</i>
          <span className="text-white">ACCESSIBLE FOR ALL</span>
          <i className="not-italic text-brand-magenta text-sm">✳</i>
          <span className="text-brand-amber">FEEL THE MOMENT</span>
          <i className="not-italic text-brand-purple text-sm">✦</i>
          <span className="text-white">LIVE MUSIC & THEATRE</span>
        </div>
      </section>

      {/* 3. CONTENT GRID: 3 COLUMNS ON EASECONNECT, 2 COLUMNS ON OTHER CHANNELS */}
      <div
        id="community-grid"
        className={cx(
          "grid gap-6",
          tab === "feed"
            ? "lg:grid-cols-[240px_minmax(0,1fr)_280px]"
            : "lg:grid-cols-[240px_minmax(0,1fr)]",
        )}
      >
        {/* LEFT RAIL: EXPLORE CHANNELS & YOUR SPACE */}
        <aside className="space-y-4">
          <div className="rounded-3xl border border-brand-line bg-white p-4 shadow-sm lg:sticky lg:top-24">
            <div className="px-2 pb-2 text-[10px] font-black uppercase tracking-wider text-muted">
              Explore community
            </div>

            <div className="space-y-1.5" role="tablist" aria-label="EaseComms channels">
              {tabs.map((t) => {
                const isSelected = tab === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cx(
                      "cursor-pointer group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all",
                      isSelected
                        ? "bg-gradient-to-r from-brand-purple to-brand-magenta text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                        : "text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple",
                    )}
                  >
                    <div
                      className={cx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-brand-lilac/70 text-brand-purple group-hover:bg-brand-purple group-hover:text-white",
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="font-feature text-sm font-black italic tracking-tight leading-tight block">
                        {t.label}
                      </b>
                      <small
                        className={cx(
                          "block text-[10px] truncate",
                          isSelected ? "text-white/80" : "text-muted",
                        )}
                      >
                        {t.desc}
                      </small>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="my-3.5 h-px bg-brand-line" />

            <div className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-wider text-muted">
              Your space
            </div>
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => showToast("You have 4 saved posts.")}
                className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
              >
                <Bookmark className="h-4 w-4 text-brand-purple" /> Saved posts
              </button>
              <button
                type="button"
                onClick={() => showToast("You are part of: Live Music Fans & Festival Crew")}
                className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
              >
                <Users className="h-4 w-4 text-brand-magenta" /> My groups
              </button>
              <button
                type="button"
                onClick={() => showToast("All recent activity is up to date.")}
                className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
              >
                <Clock className="h-4 w-4 text-brand-orange" /> Recent activity
              </button>
            </nav>

            <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-lilac/70 via-brand-warm to-brand-lilac/40 p-3.5 border border-brand-purple/15">
              <strong className="block font-brand text-xs font-bold text-brand-deep">
                Make someone’s night ✨
              </strong>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Share a seat view or a useful tip to help another fan feel event-ready.
              </p>
              <button
                type="button"
                onClick={() => showToast("Every verified seat view earns +15 EasePoints!")}
                className="cursor-pointer mt-2 text-[11px] font-extrabold text-brand-purple hover:underline"
              >
                How it works ↗
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: FEED / EXCHANGE / VIEWS / ACCESS */}
        <main className="min-w-0 space-y-5">
          {/* Channel Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h2 className="font-brand text-2xl font-bold tracking-tight text-brand-deep">
                {tab === "feed" && "The conversation"}
                {tab === "exchange" && "Swap with confidence"}
                {tab === "views" && "Real views, real seats"}
                {tab === "access" && "Explore before you go"}
              </h2>
              <p className="text-xs text-muted">
                {tab === "feed" && "What fans are talking about right now across Singapore"}
                {tab === "exchange" && "Secure, face-value ticket swaps backed by community verification"}
                {tab === "views" && "Explore 360° views and verified photos before buying"}
                {tab === "access" && "Accessibility guides, companion assistance, and step-free navigation"}
              </p>
            </div>

            {tab === "feed" && (
              <div className="flex items-center gap-2">
                <select
                  aria-label="Sort posts"
                  value={sortOrder}
                  onChange={(e) => {
                    const val = e.target.value as typeof sortOrder;
                    setSortOrder(val);
                    showToast(`Sorting by ${val}`);
                  }}
                  className="cursor-pointer rounded-xl border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-deep outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
                >
                  <option value="trending">Trending first</option>
                  <option value="newest">Newest first</option>
                  <option value="discussed">Most discussed</option>
                </select>
              </div>
            )}
          </div>

          {/* TAB 1: EASECONNECT FEED */}
          {tab === "feed" && (
            <div className="space-y-4">
              {/* Interactive Post Composer */}
              <div
                ref={composerRef}
                className="rounded-3xl border-2 border-brand-purple/20 bg-white p-5 shadow-sm transition-all focus-within:border-brand-purple focus-within:ring-4 focus-within:ring-brand-purple/10"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta font-bold text-white shadow-sm">
                    {user?.name?.[0] ?? "Y"}
                  </div>
                  <div>
                    <b className="block text-xs font-bold text-brand-deep">What’s the story?</b>
                    <small className="block text-[11px] text-muted">
                      Ask the crowd, share a tip, or post a seat view.
                    </small>
                  </div>
                </div>

                <div className="mt-3.5">
                  <Textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder="Drop a tip, ask the crowd, or share the moment…"
                    className="border-brand-line bg-brand-warm/30 text-sm focus:border-brand-purple"
                  />
                </div>

                {/* Photo URL Input Bar if toggled */}
                {showPhotoInput && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-brand-line bg-brand-lilac/30 p-2">
                    <ImageIcon className="h-4 w-4 text-brand-purple" />
                    <input
                      type="url"
                      placeholder="Paste seat photo URL (e.g. Unsplash or direct image link)"
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      className="flex-1 bg-transparent text-xs text-brand-deep outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPhotoInput(false)}
                      className="text-muted hover:text-brand-deep"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-line/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPhotoInput(!showPhotoInput);
                        if (!showPhotoInput) {
                          setPhotoUrl("https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=85");
                          showToast("Sample concert seat view photo attached!");
                        }
                      }}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-bold text-muted transition hover:border-brand-purple hover:text-brand-purple"
                    >
                      <ImageIcon className="h-3.5 w-3.5" /> ＋ Photo / video
                    </button>

                    <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-1 text-xs font-bold text-muted">
                      <Tag className="h-3.5 w-3.5 text-brand-orange" />
                      <select
                        aria-label="Tag event"
                        value={selectedEventId}
                        onChange={(e) => setSelectedEventId(e.target.value)}
                        className="cursor-pointer bg-transparent text-xs text-brand-deep outline-none"
                      >
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => submitPost()}
                    className="border-0 bg-gradient-to-r from-brand-orange to-brand-amber font-bold text-white shadow-md shadow-brand-orange/20 hover:shadow-brand-orange/35"
                  >
                    <Send className="h-4 w-4" /> Share post ↗
                  </Button>
                </div>
              </div>

              {/* Feed Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(
                  [
                    { id: "all", label: "For you" },
                    { id: "following", label: "Following" },
                    { id: "views", label: "Seat views" },
                    { id: "questions", label: "Questions" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFilter(f.id);
                      showToast(`Filter: ${f.label}`);
                    }}
                    className={cx(
                      "cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold whitespace-nowrap transition-all",
                      filter === f.id
                        ? "bg-brand-lilac text-brand-purple shadow-sm ring-1 ring-brand-purple/30 font-extrabold"
                        : "text-muted hover:bg-brand-lilac/40 hover:text-brand-deep",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Feed Posts List */}
              <div className="space-y-4">
                {filteredPosts.map((p) => {
                  const isLiked = likedPosts[p.id] ?? false;
                  const currentLikes = likesCount[p.id] ?? p.likes;

                  return (
                    <article
                      key={p.id}
                      className="group rounded-3xl border border-brand-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta font-bold text-white shadow-sm">
                          {p.author[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <b className="text-xs font-bold text-brand-deep">
                                {p.author}{" "}
                                <span className="font-normal text-muted">· Live Music Fans</span>
                              </b>
                              <div className="text-[11px] text-muted">
                                {p.when} on{" "}
                                <span className="font-semibold text-brand-deep">
                                  {eventName(p.eventId)}
                                </span>{" "}
                                ·{" "}
                                <span className="font-bold text-brand-purple">
                                  {p.photo ? "EasePix contributor" : "Community tip"}
                                </span>
                              </div>
                            </div>
                            <span className="rounded-full bg-brand-warm px-2 py-0.5 text-[10px] font-bold text-muted border border-brand-line">
                              {p.section ? `Sec ${p.section}` : "Fan Post"}
                            </span>
                          </div>

                          <p className="mt-3 text-sm leading-relaxed text-brand-deep/90">
                            {p.body}
                          </p>

                          {/* Post Photo / Seat View with Dark Gradient & Badge */}
                          {p.photo && (
                            <div className="relative mt-3.5 h-64 overflow-hidden rounded-2xl border border-brand-line bg-brand-deep shadow-sm">
                              <img
                                src={p.photo}
                                alt="Seat view"
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                onError={(e) => {
                                  // Fallback gradient if photo fails
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-transparent to-transparent pointer-events-none" />
                              <div className="absolute left-3.5 bottom-3.5 flex items-center gap-2 text-xs font-extrabold text-white">
                                <span className="rounded bg-brand-orange px-2 py-0.5 text-[10px] uppercase font-black tracking-wider">
                                  SEAT VIEW
                                </span>
                                <span>{eventName(p.eventId)} · Section {p.section ?? "C"}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreview360Photo({
                                    url: p.photo!,
                                    title: eventName(p.eventId),
                                    section: p.section,
                                  })
                                }
                                className="cursor-pointer absolute right-3.5 bottom-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-deep/85 px-3 py-1 text-xs font-bold text-white backdrop-blur-md transition hover:bg-brand-purple"
                              >
                                <Rotate3d className="h-3.5 w-3.5 text-brand-orange" /> Preview 360°
                              </button>
                            </div>
                          )}

                          {/* Post Footer Actions */}
                          <div className="mt-4 flex items-center gap-4 pt-3 border-t border-brand-line/60 text-xs text-muted font-bold">
                            <button
                              type="button"
                              onClick={() => toggleLike(p.id, p.likes)}
                              className={cx(
                                "cursor-pointer inline-flex items-center gap-1.5 transition-colors",
                                isLiked ? "text-brand-magenta" : "hover:text-brand-magenta",
                              )}
                            >
                              <Heart className={cx("h-4 w-4", isLiked && "fill-brand-magenta")} />
                              <span>{currentLikes}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => showToast("Comments section preview: 8 fans replied")}
                              className="cursor-pointer inline-flex items-center gap-1.5 hover:text-brand-purple transition-colors"
                            >
                              <MessageSquare className="h-4 w-4" /> 8 comments
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(window.location.href);
                                showToast("Post link copied to clipboard ↗");
                              }}
                              className="cursor-pointer inline-flex items-center gap-1.5 hover:text-brand-purple transition-colors"
                            >
                              <Share2 className="h-4 w-4" /> Share
                            </button>

                            <div className="ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-orange">
                              <Sparkles className="h-3 w-3" /> +15 EasePoints
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: EASEXCHANGE */}
          {tab === "exchange" && (
            <div className="space-y-4">
              <SecureExchange key={user?.id ?? "public"} />
            </div>
          )}

          {/* TAB 3: EASEPIX SEAT VIEWS & 360° */}
          {tab === "views" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-2xl border border-brand-purple/20 bg-brand-lilac/70 p-4 text-sm font-medium text-brand-deep shadow-sm">
                <Rotate3d className="h-5 w-5 shrink-0 text-brand-purple" />
                <span>
                  Explore 360° venue views and real, community-uploaded photos on{" "}
                  <span className="font-feature italic font-black text-brand-purple">EasePix</span>{" "}
                  so you know exactly what you’re paying for before you buy.
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {posts
                  .filter((p) => p.photo)
                  .concat(posts.filter((p) => p.photo))
                  .slice(0, 6)
                  .map((p, i) => (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm transition hover:shadow-md"
                    >
                      <img
                        src={p.photo}
                        alt="Seat view"
                        className="h-52 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-brand-deep/85 via-brand-deep/20 to-transparent p-4">
                        <div className="text-white">
                          <div className="font-brand text-sm font-bold">
                            Section {p.section ?? "C"}
                          </div>
                          <div className="text-xs text-white/80">{eventName(p.eventId)}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPreview360Photo({
                            url: p.photo!,
                            title: eventName(p.eventId),
                            section: p.section,
                          })
                        }
                        className="cursor-pointer absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-deep/85 px-3 py-1 text-xs font-bold text-white backdrop-blur shadow-sm hover:bg-brand-purple transition"
                      >
                        <Rotate3d className="h-3.5 w-3.5 text-brand-orange" /> 360° View
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 4: EASEXPLORE ACCESSIBILITY GUIDES */}
          {tab === "access" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-2xl border border-brand-purple/20 bg-brand-lilac/70 p-4 text-sm font-medium text-brand-deep shadow-sm">
                <Accessibility className="h-5 w-5 shrink-0 text-brand-purple" />
                <span>
                  Explore venue accessibility, step-free navigation, and personalized companion
                  assistance with{" "}
                  <span className="font-feature italic font-black text-brand-purple">
                    EaseXplore
                  </span>
                  .
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Accessibility,
                    h: "Companion assistance",
                    p: "Request a trained companion to help you navigate the venue, from entrance to seat and back.",
                    action: "Request companion",
                    to: "/assistance",
                  },
                  {
                    icon: Volume2,
                    h: "In-built audio tour & voice guidance",
                    p: "Turn-by-turn voice guidance around the venue plus an audio description of the event and facilities.",
                    action: "Try audio demo",
                    onClick: toggleEaseVoice,
                  },
                  {
                    icon: ShieldCheck,
                    h: "Accessible community",
                    p: "Connect with others before booking to ask about ramps, lifts, sensory rooms, and quiet spaces.",
                    action: "Join discussion",
                    onClick: () => setTab("feed"),
                  },
                  {
                    icon: Camera,
                    h: "Verified access photos",
                    p: "Community-shared photos of step-free routes, accessible seating, and companion facilities.",
                    action: "Browse photos",
                    onClick: () => setTab("views"),
                  },
                ].map((f) => (
                  <Card
                    key={f.h}
                    className="flex flex-col justify-between rounded-3xl border border-brand-line bg-white p-6 shadow-sm"
                  >
                    <div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-lilac text-brand-purple">
                        <f.icon className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 font-brand text-base font-bold text-brand-deep">{f.h}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted">{f.p}</p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-brand-line/60">
                      {f.to ? (
                        <Link
                          to={f.to}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-purple hover:underline"
                        >
                          {f.action} ↗
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={f.onClick}
                          className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold text-brand-purple hover:underline"
                        >
                          {f.action} ↗
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT RAIL: EVENTS ON RADAR, COMMUNITY GROUPS, REMINDERS (Only visible on EaseConnect feed) */}
        {tab === "feed" && (
          <aside className="space-y-5">
            {/* Events on your radar */}
            <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
              <div className="flex items-center justify-between pb-3">
                <h3 className="font-brand text-sm font-bold text-brand-deep">Events on your radar</h3>
                <Link
                  to="/events"
                  className="text-xs font-extrabold text-brand-purple hover:underline"
                >
                  See all ↗
                </Link>
              </div>

              <div className="space-y-3">
                {events.slice(0, 3).map((ev) => (
                  <Link
                    key={ev.id}
                    to={`/events/${ev.id}`}
                    className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-brand-lilac/30"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-deep shadow-sm">
                      <img
                        src={ev.image}
                        alt={ev.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block text-xs font-bold text-brand-deep truncate group-hover:text-brand-purple">
                        {ev.title}
                      </b>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted truncate">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {new Date(ev.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="text-[11px] font-black text-brand-orange">
                        From ${ev.priceFrom ?? 45}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Your kind of crowd / Fan meetups */}
            <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
              <div className="flex items-center justify-between pb-2">
                <h3 className="font-brand text-sm font-bold text-brand-deep">Your kind of crowd</h3>
                <button
                  type="button"
                  onClick={() => showToast("Discovering new fan meetups…")}
                  className="cursor-pointer text-xs font-extrabold text-brand-purple hover:underline"
                >
                  Discover
                </button>
              </div>

              <div className="my-2 flex items-center">
                <div className="flex -space-x-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-purple to-brand-magenta text-[10px] font-bold text-white">
                    A
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-orange to-brand-amber text-[10px] font-bold text-white">
                    M
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-deep to-brand-purple text-[10px] font-bold text-white">
                    K
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-magenta to-brand-orange text-[10px] font-bold text-white">
                    R
                  </div>
                </div>
                <span className="ml-3 text-xs font-bold text-muted">+128 fans</span>
              </div>

              <div className="mt-3.5 rounded-2xl bg-gradient-to-br from-brand-lilac/70 via-brand-warm to-brand-lilac/40 p-4 border border-brand-purple/15">
                <small className="text-[10px] font-black uppercase tracking-wider text-brand-purple">
                  ✦ COMMUNITY PICK
                </small>
                <h4 className="mt-1 font-brand text-sm font-bold text-brand-deep">
                  Going solo? Go together.
                </h4>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Find fans attending the same event and make a plan before showtime.
                </p>
                <button
                  type="button"
                  onClick={() => showToast("Fan meetups feature activated for your area!")}
                  className="cursor-pointer mt-3 w-full rounded-xl bg-brand-purple py-2 text-center text-xs font-bold text-white shadow-md shadow-brand-purple/20 transition hover:bg-brand-deep"
                >
                  Find your people ↗
                </button>
              </div>
            </section>

            {/* Quick reminder card */}
            <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
              <h3 className="font-brand text-xs font-bold uppercase tracking-wider text-muted">
                Quick reminder
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Keep exchanges on-platform, check venue accessibility before travelling, and share only
                what you’re comfortable sharing.
              </p>
            </section>
          </aside>
        )}
      </div>

      {/* 4. FLOATING EASEVOICE WIDGET */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-brand-purple/20 bg-white/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-lilac text-brand-purple">
          {activeVoicePlaying ? (
            <VolumeX className="h-4 w-4 animate-pulse text-brand-magenta" />
          ) : (
            <Volume2 className="h-4 w-4 text-brand-purple" />
          )}
        </div>
        <div className="hidden sm:block">
          <b className="block text-xs font-extrabold text-brand-deep leading-tight">
            <span className="font-feature italic font-black">EaseVoice</span>
          </b>
          <small className="block text-[10px] text-muted">Listen to the feed</small>
        </div>
        <button
          type="button"
          onClick={toggleEaseVoice}
          className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-orange to-brand-amber px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-brand-orange/20 transition hover:scale-105 active:scale-95"
        >
          {activeVoicePlaying ? "Ⅱ Pause" : "▷ Play"}
        </button>
      </div>

      {/* 5. 360° PHOTO PREVIEW MODAL */}
      {preview360Photo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/20 bg-brand-deep shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <Rotate3d className="h-5 w-5 text-brand-orange" />
                <span className="font-brand text-sm font-bold">
                  {preview360Photo.title} · Section {preview360Photo.section ?? "C"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreview360Photo(null)}
                className="cursor-pointer rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative h-96 w-full bg-black">
              <img
                src={preview360Photo.url}
                alt="360 view"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="rounded-full bg-brand-deep/80 px-4 py-2 text-xs font-bold text-white backdrop-blur-md shadow-lg flex items-center gap-2">
                  <Rotate3d className="h-4 w-4 text-brand-orange animate-spin" /> Interactive 360° Simulation Active
                </div>
              </div>
            </div>
            <div className="p-4 text-center text-xs text-white/80">
              Drag or rotate to inspect field-of-view, railings, and seat elevation before booking.
            </div>
          </div>
        </div>
      )}

      {/* 6. TOAST NOTIFICATION */}
      <div
        className={cx(
          "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-brand-deep px-5 py-3 text-xs font-bold text-white shadow-2xl transition-all duration-300 pointer-events-none flex items-center gap-2",
          toastMessage ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
      >
        <Sparkles className="h-4 w-4 text-brand-orange" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}
