import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import {
  Search,
  ShieldCheck,
  Repeat,
  Eye,
  Users,
  Accessibility,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  Camera,
  MessageCircle,
  Route,
  BellRing,
  Map,
  CircleCheck,
  Rotate3d,
  Volume2,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { useStore } from "../lib/store";
import { categoryList } from "../lib/data";
import { EventCard } from "../components/EventCard";
import { Badge, Button, Eyebrow, Input, cx } from "../components/ui";
import { SEO } from "../components/common";

const homeStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://eventease-frontend.onrender.com/#website",
      "url": "https://eventease-frontend.onrender.com",
      "name": "EventEase",
      "description": "Accessible events, discovery and community ticketing platform.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://eventease-frontend.onrender.com/events?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "Organization",
      "@id": "https://eventease-frontend.onrender.com/#organization",
      "name": "EventEase",
      "url": "https://eventease-frontend.onrender.com",
      "logo": "https://eventease-frontend.onrender.com/EventEase_logo.png",
      "description": "Accessible ticketing platform designed for inclusive event experiences."
    }
  ]
};

const promises = [
  { icon: ShieldCheck, h: "No hidden fees", p: "The price you see is the price you pay. Every fee itemised at checkout." },
  { icon: Repeat, h: "Secure exchange", p: "Swap or resell tickets one-to-one with verified buyers — no shady resellers." },
  { icon: Eye, h: "See before you sit", p: "360° venue views and real seat photos from the community before you buy." },
  { icon: Accessibility, h: "Built for everyone", p: "Companion assistance, audio guidance, and inclusive design as standard." },
];

export default function Home() {
  const { publicEvents: events, eventsSource, user } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [audienceTab, setAudienceTab] = useState<"customers" | "organizers">("customers");

  // On the first landing page, only display active upcoming events where ticket sales are open
  // (no events that are past or where ticket sales have closed).
  const now = Date.now();
  const isPastEvent = (e: (typeof events)[number]) => {
    if (e.isPast) return true;
    const end = e.endAt ? Date.parse(e.endAt) : Date.parse(e.date);
    return !isNaN(end) && end <= now;
  };

  const isSalesClosedEvent = (e: (typeof events)[number]) => {
    if (e.salesClosed) return true;
    if (e.salesCloseAt) {
      const close = Date.parse(e.salesCloseAt);
      if (!isNaN(close) && close <= now) return true;
    }
    return isPastEvent(e);
  };

  const upcoming = events
    .filter((event) => event.status === "published" && !isPastEvent(event) && !isSalesClosedEvent(event))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const heroPicks = upcoming.slice(0, 2);

  return (
    <div className="bg-brand-warm text-brand-text">
      <SEO
        title="EventEase"
        description="Discover and book accessible concerts, theatre, festivals, and sports events with ease. Companion assistance and verified community ticket exchange."
        canonicalPath="/"
        structuredData={homeStructuredData}
      />
      <section className="home-hero relative overflow-hidden text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border-[3rem] border-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-32 w-64 -translate-x-1/2 rounded-t-full bg-brand-orange/15 blur-2xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 md:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:py-24">
          <div className="ee-rise">
            <Badge tone="accent" className="border border-white/15 bg-white/10 text-white">
              <Sparkles className="h-3 w-3" /> Your next experience starts here
            </Badge>
            <h1 className="mt-6 max-w-2xl font-brand text-5xl font-bold leading-[0.92] tracking-[-0.055em] sm:text-6xl lg:text-8xl">
              Find your<br />
              <span className="text-white md:text-brand-orange">unforgettable.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
              Real concerts, music shows, theatre, dance, and cultural performances—discovered,
              discussed, and booked with confidence.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                const term = query.trim();
                navigate(term ? `/events?q=${encodeURIComponent(term)}` : "/events");
              }}
              className="home-search-shadow mt-8 flex max-w-xl items-center gap-2 rounded-2xl bg-white p-2"
            >
              <Search className="ml-3 h-5 w-5 shrink-0 text-brand-purple" />
              <Input
                aria-label="Search events, venues and areas"
                placeholder="Search events, venues, areas…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 flex-1 border-0 bg-transparent px-1 text-brand-text focus:border-transparent focus:ring-0"
              />
              <Button
                type="submit"
                className="bg-brand-orange text-white shadow-none hover:bg-brand-deep focus-visible:ring-4 focus-visible:ring-brand-orange/30"
              >
                Explore
              </Button>
            </form>

            {!user && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-white/65">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-orange" />
                Sign in is required when you select an event.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {categoryList.map((category) => (
                <Link
                  key={category}
                  to={`/events?cat=${category}`}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-brand-orange hover:bg-brand-orange hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30"
                >
                  {category}
                </Link>
              ))}
            </div>
          </div>

          <div className="relative ee-rise" style={{ animationDelay: "0.1s" }}>
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2 sm:gap-6">
              {heroPicks.map((event, index) => (
                <div
                  key={event.id}
                  className={
                    index === 0
                      ? "sm:translate-y-8 sm:rotate-[-1deg]"
                      : "sm:-translate-y-5 sm:rotate-[1deg]"
                  }
                >
                  <EventCard ev={event} presentation="home" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-brand-deep/10 bg-white">
        <div className="mx-auto grid max-w-7xl md:grid-cols-2 lg:grid-cols-4">
          {promises.map((promise, index) => (
            <div
              key={promise.h}
              className="group border-b border-brand-deep/10 p-6 last:border-b-0 md:border-r md:[&:nth-child(2n)]:border-r-0 lg:border-b-0 lg:[&:nth-child(2n)]:border-r lg:last:border-r-0"
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                  index % 2 ? "bg-brand-orange/10 text-brand-orange" : "bg-brand-lilac text-brand-purple"
                }`}
              >
                <promise.icon className="h-5 w-5" />
              </div>
              <div className="mt-5 font-brand text-lg font-bold text-brand-deep">{promise.h}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{promise.p}</p>
            </div>
          ))}
        </div>
      </section>


      {/* The EventEase Experience Section */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:py-20 border-t border-brand-purple/10">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-orange mb-3">
            The EventEase experience
          </p>
          <h2 className="font-brand text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-brand-deep leading-tight">
            Great events.<br />
            <span className="text-brand-purple">Built around you.</span>
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted max-w-xl mx-auto leading-relaxed">
            In the crowd or behind the scenes, discover your kind of ease.
          </p>
          <div
            className="mt-6 inline-flex rounded-full bg-brand-lilac/70 p-1.5 shadow-inner"
            role="tablist"
            aria-label="Choose your audience"
          >
            <button
              id="customer-tab"
              role="tab"
              aria-selected={audienceTab === "customers"}
              aria-controls="customers"
              tabIndex={audienceTab === "customers" ? 0 : -1}
              onClick={() => setAudienceTab("customers")}
              className={cx(
                "rounded-full px-6 py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
                audienceTab === "customers"
                  ? "bg-brand-deep text-white shadow-md"
                  : "text-brand-deep/70 hover:text-brand-deep hover:bg-white/50"
              )}
            >
              For customers
            </button>
            <button
              id="organizer-tab"
              role="tab"
              aria-selected={audienceTab === "organizers"}
              aria-controls="organizers"
              tabIndex={audienceTab === "organizers" ? 0 : -1}
              onClick={() => setAudienceTab("organizers")}
              className={cx(
                "rounded-full px-6 py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
                audienceTab === "organizers"
                  ? "bg-brand-deep text-white shadow-md"
                  : "text-brand-deep/70 hover:text-brand-deep hover:bg-white/50"
              )}
            >
              For organizers
            </button>
          </div>
        </header>

        {/* Tab 1: For Customers */}
        {audienceTab === "customers" && (
          <div id="customers" role="tabpanel" aria-labelledby="customer-tab" className="mt-12 ee-rise">
            <div className="mb-8">
              <h3 className="font-brand text-2xl font-bold text-brand-deep tracking-tight">
                Your event, from every angle.
              </h3>
              <p className="mt-1 text-sm text-muted">
                Connect before the show. Choose with confidence. Feel supported on the day.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: 01 · Connect */}
              <article className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-[#4a0e82] via-[#7c2e3a] to-[#c43c00] text-white shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex flex-col p-6 pb-5 sm:p-7 sm:pb-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-orange/40 blur-2xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -left-16 -bottom-16 h-52 w-52 rounded-full bg-brand-purple/50 blur-2xl"
                />

                {/* Category Header */}
                <div className="relative flex items-center gap-2.5 mb-4 text-[10px] font-bold tracking-[0.18em] text-[#f3dfea]">
                  <span className="text-[#ffb37a] text-[9px]">01</span>
                  <span className="uppercase font-brand">Connect</span>
                  <span className="flex-1 h-px bg-white/20 ml-1.5" />
                </div>

                {/* Scene 1: Fan Discussion */}
                <div
                  className="relative mb-4 h-44 rounded-2xl overflow-hidden flex items-center justify-center p-4 bg-black/25 border border-white/15 backdrop-blur-md shadow-inner"
                  aria-label="Illustrative fan discussion"
                >
                  {/* Layered back bubble */}
                  <div
                    aria-hidden
                    className="absolute top-4 left-6 right-7 rounded-xl bg-white/75 p-3 shadow-md border border-white/30 text-brand-deep rotate-3 opacity-70 pointer-events-none flex items-center gap-2.5"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-purple text-[9px] font-bold text-white shrink-0">
                      J
                    </span>
                    <div className="flex-1 space-y-1">
                      <div className="h-1.5 w-24 rounded bg-brand-purple/20" />
                      <div className="h-1.5 w-16 rounded bg-brand-purple/15" />
                    </div>
                    <span className="text-brand-purple text-xs">♡</span>
                  </div>

                  {/* Layered front bubble */}
                  <div className="relative w-[92%] rounded-xl bg-white/95 p-3.5 shadow-lg border border-white/40 text-brand-deep -rotate-1 transform transition-transform hover:rotate-0 mt-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-orange text-[10px] font-bold text-white shrink-0 shadow-xs">
                        S
                      </span>
                      <div className="flex-1 min-w-0">
                        <strong className="text-xs font-bold text-brand-deep block leading-tight">
                          Who’s heading to the show?
                        </strong>
                        <span className="text-[10px] font-semibold text-brand-purple flex items-center gap-1 mt-0.5">
                          Join the conversation ↗
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="absolute right-3 bottom-3 rounded-full bg-brand-deep/90 text-white px-2.5 py-1 text-[10px] font-bold border border-brand-orange/40 shadow-lg backdrop-blur flex items-center gap-1.5">
                    <Repeat className="h-3 w-3 text-brand-orange" /> Connect &amp; exchange
                  </span>
                </div>

                {/* Features */}
                <div className="relative flex flex-col flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#e9cadf] mb-2.5">Inside EaseComms</p>
                  <div className="space-y-2.5 mb-5">
                    {/* EaseConnect */}
                    <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/15 hover:border-brand-orange/40 shadow-xs">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-brand-orange shadow-xs">
                        <MessageCircle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-feature italic font-black text-sm text-white leading-tight">EaseConnect</h4>
                        <p className="text-[11px] text-white/75 mt-0.5">Fan discussions</p>
                      </div>
                    </div>

                    {/* EaseXchange */}
                    <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/15 hover:border-brand-orange/40 shadow-xs">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-brand-orange shadow-xs">
                        <Repeat className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-feature italic font-black text-sm text-white leading-tight">EaseXchange</h4>
                        <p className="text-[11px] text-white/75 mt-0.5">Fair ticket exchanges</p>
                      </div>
                    </div>
                  </div>

                  <Link
                    to="/community"
                    className="mt-auto pt-4 border-t border-white/20 flex items-center justify-between text-xs font-bold text-white group hover:text-brand-orange transition-colors"
                  >
                    <span>Explore EaseComms</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-brand-orange group-hover:bg-white/10 transition-colors">
                      <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </span>
                  </Link>
                </div>
              </article>

              {/* Card 2: 02 · Explore */}
              <article className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-[#3d1078] via-[#8a2b28] to-[#d44800] text-white shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex flex-col p-6 pb-5 sm:p-7 sm:pb-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-orange/45 blur-2xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -left-16 -bottom-16 h-52 w-52 rounded-full bg-brand-purple/45 blur-2xl"
                />

                {/* Category Header */}
                <div className="relative flex items-center gap-2.5 mb-4 text-[10px] font-bold tracking-[0.18em] text-[#f3dfea]">
                  <span className="text-[#ffb37a] text-[9px]">02</span>
                  <span className="uppercase font-brand">Explore</span>
                  <span className="flex-1 h-px bg-white/20 ml-1.5" />
                </div>

                {/* Scene 2: Arena 360° */}
                <div
                  className="relative mb-4 h-44 rounded-2xl overflow-hidden flex items-center justify-center p-4 bg-gradient-to-b from-[#19062b] via-[#2c0f44] to-[#381428] border border-brand-orange/30 shadow-inner"
                  aria-label="Illustrative venue seat view"
                >
                  {/* Concentric rings */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-12 h-44 w-72 rounded-t-full border border-white/15 bg-white/5"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-6 h-36 w-56 rounded-t-full border border-dashed border-white/20"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-1 h-28 w-40 rounded-t-full border border-brand-orange/35 bg-brand-orange/10"
                  />

                  {/* Stage */}
                  <span className="absolute top-4 rounded-md bg-white/95 px-5 py-1 text-[9px] font-bold tracking-[0.2em] text-brand-deep shadow-md border border-white/30">
                    STAGE
                  </span>

                  {/* Pulsing seat marker */}
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-brand-orange border-2 border-white shadow-lg ring-4 ring-brand-orange/40 animate-pulse" />
                    <span className="rounded bg-brand-deep/90 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur border border-white/20 shadow-sm">
                      Your view
                    </span>
                  </div>

                  <span className="absolute right-3 bottom-3 rounded-full bg-brand-deep/90 text-white px-2.5 py-1 text-[10px] font-bold border border-brand-orange/40 shadow-lg backdrop-blur flex items-center gap-1.5">
                    <Rotate3d className="h-3 w-3 text-brand-orange" /> 360°
                  </span>
                </div>

                {/* Features */}
                <div className="relative flex flex-col flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#e9cadf] mb-2.5">Inside EaseComms</p>
                  <div className="space-y-2.5 mb-5">
                    {/* EasePix */}
                    <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/15 hover:border-brand-orange/40 shadow-xs">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-brand-orange shadow-xs">
                        <Camera className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-feature italic font-black text-sm text-white leading-tight">EasePix</h4>
                        <p className="text-[11px] text-white/75 mt-0.5">Real seat photos</p>
                      </div>
                    </div>

                    {/* EaseXplore */}
                    <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/15 hover:border-brand-orange/40 shadow-xs">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-brand-orange shadow-xs">
                        <Rotate3d className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-feature italic font-black text-sm text-white leading-tight">EaseXplore</h4>
                        <p className="text-[11px] text-white/75 mt-0.5">360° venue views</p>
                      </div>
                    </div>
                  </div>

                  <Link
                    to="/community?tab=views"
                    className="mt-auto pt-4 border-t border-white/20 flex items-center justify-between text-xs font-bold text-white group hover:text-brand-orange transition-colors"
                  >
                    <span>Explore seat views</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-brand-orange group-hover:bg-white/10 transition-colors">
                      <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </span>
                  </Link>
                </div>
              </article>

              {/* Card 3: 03 · Experience */}
              <article className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-[#50107a] via-[#7a2840] to-[#b83c00] text-white shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex flex-col p-6 pb-5 sm:p-7 sm:pb-5 md:col-span-2 lg:col-span-1">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-orange/40 blur-2xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -left-16 -bottom-16 h-52 w-52 rounded-full bg-brand-purple/50 blur-2xl"
                />

                {/* Category Header */}
                <div className="relative flex items-center gap-2.5 mb-4 text-[10px] font-bold tracking-[0.18em] text-[#f3dfea]">
                  <span className="text-[#ffb37a] text-[9px]">03</span>
                  <span className="uppercase font-brand">Experience</span>
                  <span className="flex-1 h-px bg-white/20 ml-1.5" />
                </div>

                {/* Scene 3: Accessible Route */}
                <div
                  className="relative mb-4 h-44 rounded-2xl overflow-hidden flex items-center justify-center p-4 bg-black/25 border border-white/15 backdrop-blur-md shadow-inner"
                  aria-label="Illustrative accessible route and audio player"
                >
                  <div className="w-[94%] rounded-xl bg-white/95 p-3.5 shadow-lg border border-white/40 text-brand-deep rotate-1 transform transition-transform hover:rotate-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-deep">Your journey, made easier</span>
                      <span className="text-[9px] font-bold text-live bg-live/10 px-2 py-0.5 rounded-full">
                        ✓
                      </span>
                    </div>
                    <div className="my-2.5 flex items-center gap-1">
                      <span className="h-3.5 w-3.5 rounded-full bg-brand-orange flex items-center justify-center text-[7px] font-bold text-white shrink-0">
                        1
                      </span>
                      <span className="flex-1 border-t-2 border-dashed border-brand-orange/40" />
                      <span className="h-3.5 w-3.5 rounded-full bg-brand-purple flex items-center justify-center text-[7px] font-bold text-white shrink-0">
                        2
                      </span>
                      <span className="flex-1 border-t-2 border-dashed border-brand-purple/40" />
                      <span className="h-3.5 w-3.5 rounded-full bg-live flex items-center justify-center text-[7px] font-bold text-white shrink-0">
                        ✓
                      </span>
                    </div>
                    <div className="flex justify-between text-[8px] font-semibold text-muted">
                      <span>Entrance</span>
                      <span>Support</span>
                      <span>Your seat</span>
                    </div>
                  </div>
                  <span className="absolute right-3 bottom-3 rounded-full bg-brand-deep/90 text-white px-2.5 py-1 text-[10px] font-bold border border-brand-purple/40 shadow-lg backdrop-blur flex items-center gap-1.5">
                    <Volume2 className="h-3 w-3 text-brand-orange" /> EaseVoice ▶
                  </span>
                </div>

                {/* Features */}
                <div className="relative flex flex-col flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#e9cadf] mb-2.5">Accessibility</p>
                  <div className="space-y-2.5 mb-5">
                    {/* EaseGuide */}
                    <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/15 hover:border-brand-orange/40 shadow-xs">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-brand-orange shadow-xs">
                        <Route className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-feature italic font-black text-sm text-white leading-tight">EaseGuide</h4>
                        <p className="text-[11px] text-white/75 mt-0.5">Event-day assistance</p>
                      </div>
                    </div>

                    {/* EaseVoice */}
                    <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/15 hover:border-brand-orange/40 shadow-xs">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-brand-orange shadow-xs">
                        <Volume2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-feature italic font-black text-sm text-white leading-tight">EaseVoice</h4>
                        <p className="text-[11px] text-white/75 mt-0.5">Audio narration</p>
                      </div>
                    </div>
                  </div>

                  <Link
                    to={user?.role === "customer" ? "/assistance" : "/events"}
                    className="mt-auto pt-4 border-t border-white/20 flex items-center justify-between text-xs font-bold text-white group hover:text-brand-orange transition-colors"
                  >
                    <span>Explore support</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-brand-orange group-hover:bg-white/10 transition-colors">
                      <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </span>
                  </Link>
                </div>
              </article>
            </div>
          </div>
        )}

        {/* Tab 2: For Organizers */}
        {audienceTab === "organizers" && (
          <div id="organizers" role="tabpanel" aria-labelledby="organizer-tab" className="mt-12 ee-rise">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#270d3b] via-[#3a1554] to-[#361726] text-white p-6 sm:p-10 lg:p-12 shadow-2xl border border-white/15">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-purple/30 blur-3xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-brand-orange/15 blur-3xl"
              />
              <div className="relative grid gap-10 lg:grid-cols-[1fr_1.05fr] items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-brand-lilac uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
                    <span className="font-feature italic font-black">EaseAnalytics</span> · For organizers & admins
                  </span>
                  <h3 className="mt-4 font-brand text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-white">
                    Your event.<br />
                    <span className="text-brand-lilac">The full picture.</span>
                  </h3>
                  <p className="mt-4 text-xs sm:text-sm text-white/75 leading-relaxed max-w-lg">
                    One reporting suite to understand ticket performance, keep sight of event operations, and share the numbers that matter.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-brand-lilac text-xs">
                        ↗
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Live sales & inventory</h4>
                        <p className="text-xs text-white/60 leading-relaxed mt-0.5">
                          Track ticket sales velocity, revenue, and inventory across seating tiers.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-brand-lilac text-xs">
                        ◎
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Attendance & operational insights</h4>
                        <p className="text-xs text-white/60 leading-relaxed mt-0.5">
                          Review attendance metrics, companion assistance requests, and ticket exchange activity.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-brand-lilac text-xs">
                        ↓
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Reports, ready to share</h4>
                        <p className="text-xs text-white/60 leading-relaxed mt-0.5">
                          Export financial and operational audit reports in CSV and PDF formats.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8">
                    <Link
                      to={
                        user?.role === "organiser"
                          ? "/dashboard/organizer?tab=analytics"
                          : user?.role === "admin"
                            ? "/dashboard/admin?tab=sales"
                            : "/login?portal=ORGANISER"
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-6 py-3 text-xs sm:text-sm font-bold text-brand-deep hover:bg-brand-amber transition shadow-lg"
                    >
                      Explore EaseAnalytics <span>↗</span>
                    </Link>
                  </div>
                </div>

                <div className="w-full">
                  <div className="rounded-2xl border border-white/20 bg-white p-5 sm:p-6 text-brand-deep shadow-2xl sm:rotate-1 transform transition-transform hover:rotate-0">
                    <div className="flex items-center justify-between pb-3.5 border-b border-brand-purple/10">
                      <span className="text-xs font-bold text-brand-deep">Event overview</span>
                      <span className="text-[10px] rounded-full border border-brand-purple/20 bg-brand-warm px-2 py-0.5 text-muted">
                        Sample data
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl border border-brand-purple/10 bg-brand-lilac/30 p-2.5 sm:p-3">
                        <span className="text-[9px] text-muted block mb-1">Tickets sold</span>
                        <strong className="text-base sm:text-lg font-bold text-brand-deep block leading-none">1,248</strong>
                        <small className="text-[8px] text-muted block mt-1">Illustrative total</small>
                      </div>
                      <div className="rounded-xl border border-brand-purple/10 bg-brand-lilac/30 p-2.5 sm:p-3">
                        <span className="text-[9px] text-muted block mb-1">Revenue</span>
                        <strong className="text-base sm:text-lg font-bold text-brand-deep block leading-none">S$87.4k</strong>
                        <small className="text-[8px] text-muted block mt-1">Illustrative total</small>
                      </div>
                      <div className="rounded-xl border border-brand-purple/10 bg-brand-lilac/30 p-2.5 sm:p-3">
                        <span className="text-[9px] text-muted block mb-1">Inventory left</span>
                        <strong className="text-base sm:text-lg font-bold text-brand-deep block leading-none">352</strong>
                        <small className="text-[8px] text-muted block mt-1">Illustrative total</small>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[10px] mb-2">
                        <span className="font-bold text-brand-deep">Ticket sales velocity</span>
                        <span className="text-muted text-[9px]">Example trend</span>
                      </div>
                      <div className="h-24 flex items-end gap-2 border-b border-brand-purple/10 pb-1 px-1 bg-[repeating-linear-gradient(to_top,transparent_0_20px,#f5f0fb_20px_21px)]">
                        <div className="flex-1 bg-brand-purple/40 rounded-t" style={{ height: "24%" }} />
                        <div className="flex-1 bg-brand-purple/40 rounded-t" style={{ height: "38%" }} />
                        <div className="flex-1 bg-brand-purple/40 rounded-t" style={{ height: "33%" }} />
                        <div className="flex-1 bg-brand-purple/40 rounded-t" style={{ height: "55%" }} />
                        <div className="flex-1 bg-brand-purple/40 rounded-t" style={{ height: "48%" }} />
                        <div className="flex-1 bg-brand-purple rounded-t" style={{ height: "72%" }} />
                        <div className="flex-1 bg-brand-purple rounded-t" style={{ height: "91%" }} />
                      </div>
                      <div className="flex justify-between text-[8px] text-muted mt-1.5 px-1">
                        <span>Day 1</span>
                        <span>Day 7</span>
                      </div>
                    </div>

                    <div className="mt-3 divide-y divide-brand-purple/10 text-[10px]">
                      <div className="flex items-center justify-between py-1.5 font-medium">
                        <span className="text-brand-deep">Attendance metrics</span>
                        <span className="text-brand-purple font-semibold">Review breakdown →</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 font-medium">
                        <span className="text-brand-deep">Companion assistance requests</span>
                        <span className="text-brand-purple font-semibold">Review breakdown →</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 font-medium">
                        <span className="text-brand-deep">Ticket exchange activity</span>
                        <span className="text-brand-purple font-semibold">Review breakdown →</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-brand-purple/10 flex items-center justify-between text-[9px] text-muted">
                      <span>Financial & operational reports</span>
                      <div className="flex gap-1.5">
                        <span className="rounded bg-brand-lilac px-1.5 py-0.5 font-bold text-brand-purple">CSV ↓</span>
                        <span className="rounded bg-brand-lilac px-1.5 py-0.5 font-bold text-brand-purple">PDF ↓</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] text-white/50 text-right">
                    Dashboard illustration only. Figures do not represent live platform activity.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-muted">
              One core product. Sales intelligence, operational visibility, and reporting—all within <span className="font-feature italic font-black text-brand-deep">EaseAnalytics</span>.
            </p>
          </div>
        )}
      </section>

      <section className="bg-brand-warm px-5 py-8">
        <p className="text-center text-sm text-muted">
          {upcoming.length} upcoming events available · Transparent, verified ticketing by EventEase
        </p>
      </section>
    </div>
  );
}
