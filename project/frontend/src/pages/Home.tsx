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

      <section className="mx-auto max-w-7xl px-5 py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-brand-purple/15 bg-gradient-to-br from-white via-brand-warm to-brand-lilac/30 p-8 shadow-sm sm:p-12 md:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-purple/10 blur-3xl"
          />
          <div className="relative max-w-3xl">
            <Eyebrow>Discover Singapore</Eyebrow>
            <h2 className="mt-4 font-brand text-4xl font-bold tracking-tight text-brand-deep sm:text-5xl">
              Discover Singapore’s best live events & experiences
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Explore the full lineup of concerts, theatre, sports, and cultural performances across Singapore.
              Filter seamlessly by active ticket availability, price, and category, preview real seat views,
              and secure verified tickets with zero hidden fees.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                className="bg-brand-purple text-white shadow-none hover:bg-brand-deep"
                onClick={() => navigate("/events")}
              >
                Go to Discover <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="flex flex-wrap gap-2">
                {categoryList.map((cat) => (
                  <Link
                    key={cat}
                    to={`/events?cat=${cat}`}
                    className="rounded-full border border-brand-deep/15 bg-white/80 px-4 py-2 text-sm font-medium text-brand-deep transition hover:border-brand-purple hover:bg-brand-lilac hover:text-brand-purple"
                  >
                    {cat}
                  </Link>
                ))}
              </div>
            </div>
          </div>
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
              <article className="rounded-3xl border border-brand-purple/15 bg-white shadow-sm overflow-hidden flex flex-col transition hover:shadow-md">
                <div className="p-6 pb-0 sm:p-7 sm:pb-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-purple">
                    01 · Connect
                  </div>
                  <h4 className="font-brand text-2xl font-bold tracking-tight text-brand-deep mt-2 leading-snug">
                    Find your people.<br />Share the excitement.
                  </h4>
                </div>

                <div
                  className="mx-4 my-4 h-40 sm:h-44 rounded-2xl relative overflow-hidden flex items-center justify-center p-4 bg-brand-lilac/50 border border-brand-purple/15"
                  aria-label="Illustrative community preview"
                >
                  <div className="w-[94%] rounded-xl bg-white p-3.5 shadow-sm border border-brand-purple/10 -rotate-2 transform">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-muted">
                      Fan Discussion · Example
                    </div>
                    <p className="mt-1 text-xs font-medium text-brand-deep leading-relaxed">
                      Anyone heading to the show?<br />Let’s share tips before the doors open.
                    </p>
                    <div className="mt-2 text-[10px] flex items-center gap-3 font-semibold text-brand-purple">
                      <span>♡ Like</span>
                      <span>↳ Join the conversation</span>
                    </div>
                  </div>
                  <span className="absolute right-3 bottom-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-brand-purple border border-brand-purple/15 shadow-sm">
                    ⇄ Fairer ticket exchanges
                  </span>
                </div>

                <div className="p-6 pt-2 sm:p-7 sm:pt-2 flex flex-col flex-1">
                  <p className="text-xs font-bold text-brand-purple mb-1.5">
                    <span className="font-feature italic font-black">EaseComms</span> · Your community hub
                  </p>
                  <p className="text-xs text-muted leading-relaxed mb-4 min-h-[38px]">
                    One home for fan conversations, shared experiences, and eligible ticket exchanges.
                  </p>
                  <div className="space-y-3 mb-6">
                    <div>
                      <div className="font-feature italic font-black text-xs text-brand-deep">EaseConnect</div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">
                        Ask questions, share tips, and join event-linked fan discussions.
                      </p>
                    </div>
                    <div>
                      <div className="font-feature italic font-black text-xs text-brand-deep">EaseXchange</div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">
                        Verified swaps and resale with price caps and barcode reissuance.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/community"
                    className="mt-auto pt-4 border-t border-brand-purple/10 flex items-center justify-between text-xs font-bold text-brand-deep group hover:text-brand-purple transition-colors"
                  >
                    <span>Explore the community</span>
                    <ArrowUpRight className="h-4 w-4 text-brand-purple group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </Link>
                </div>
              </article>

              {/* Card 2: 02 · Explore */}
              <article className="rounded-3xl border border-brand-purple/15 bg-white shadow-sm overflow-hidden flex flex-col transition hover:shadow-md">
                <div className="p-6 pb-0 sm:p-7 sm:pb-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-purple">
                    02 · Explore
                  </div>
                  <h4 className="font-brand text-2xl font-bold tracking-tight text-brand-deep mt-2 leading-snug">
                    See your view.<br />Love your seat.
                  </h4>
                </div>

                <div
                  className="mx-4 my-4 h-40 sm:h-44 rounded-2xl relative overflow-hidden flex items-center justify-center p-4 bg-gradient-to-b from-[#f8f0ea] via-[#ebd6c1] to-[#c6aaa0] border border-brand-orange/20"
                  aria-label="Illustration, not a real venue photo"
                >
                  <span className="absolute top-4 rounded bg-brand-deep px-5 py-1 text-[9px] font-bold tracking-[0.2em] text-white shadow-sm">
                    STAGE
                  </span>
                  <div className="absolute bottom-9 h-4 w-4 rounded-full bg-brand-orange border-2 border-white shadow-md ring-4 ring-brand-orange/30 animate-pulse" />
                  <span className="absolute right-3 bottom-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-brand-purple border border-brand-purple/15 shadow-sm">
                    Illustrative 360° venue preview
                  </span>
                </div>

                <div className="p-6 pt-2 sm:p-7 sm:pt-2 flex flex-col flex-1">
                  <p className="text-xs font-bold text-brand-purple mb-1.5">
                    Inside <span className="font-feature italic font-black">EaseComms</span> · Venue perspectives
                  </p>
                  <p className="text-xs text-muted leading-relaxed mb-4 min-h-[38px]">
                    Get a clearer picture of your venue before choosing where to sit.
                  </p>
                  <div className="space-y-3 mb-6">
                    <div>
                      <div className="font-feature italic font-black text-xs text-brand-deep">EasePix</div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">
                        Real seat photos, sightline ratings, accessibility notes, and contributor rewards.
                      </p>
                    </div>
                    <div>
                      <div className="font-feature italic font-black text-xs text-brand-deep">EaseXplore</div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">
                        Interactive 360° views to explore venue sections before booking.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/community?tab=views"
                    className="mt-auto pt-4 border-t border-brand-purple/10 flex items-center justify-between text-xs font-bold text-brand-deep group hover:text-brand-purple transition-colors"
                  >
                    <span>Explore seat views</span>
                    <ArrowUpRight className="h-4 w-4 text-brand-purple group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </Link>
                </div>
              </article>

              {/* Card 3: 03 · Experience */}
              <article className="rounded-3xl border border-brand-purple/15 bg-white shadow-sm overflow-hidden flex flex-col transition hover:shadow-md md:col-span-2 lg:col-span-1">
                <div className="p-6 pb-0 sm:p-7 sm:pb-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-purple">
                    03 · Experience
                  </div>
                  <h4 className="font-brand text-2xl font-bold tracking-tight text-brand-deep mt-2 leading-snug">
                    Less uncertainty.<br />More enjoyment.
                  </h4>
                </div>

                <div
                  className="mx-4 my-4 h-40 sm:h-44 rounded-2xl relative overflow-hidden flex items-center justify-center p-4 bg-[#fbede4] border border-brand-orange/20"
                  aria-label="Illustrative accessibility preview"
                >
                  <div className="w-[94%] rounded-xl bg-white p-3.5 shadow-sm border border-brand-orange/15 rotate-1 transform">
                    <div className="text-xs font-bold text-brand-deep">Your journey, made easier</div>
                    <div className="my-2.5 flex items-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-orange shrink-0" />
                      <span className="flex-1 border-t-2 border-dashed border-brand-orange/40" />
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-purple shrink-0" />
                      <span className="flex-1 border-t-2 border-dashed border-brand-purple/40" />
                      <span className="h-2.5 w-2.5 rounded-full bg-live shrink-0" />
                    </div>
                    <div className="flex justify-between text-[8px] font-semibold text-muted">
                      <span>Accessible entrance</span>
                      <span>Your seat</span>
                    </div>
                  </div>
                  <span className="absolute right-3 bottom-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-brand-purple border border-brand-purple/15 shadow-sm">
                    ▶ EaseVoice · 1×
                  </span>
                </div>

                <div className="p-6 pt-2 sm:p-7 sm:pt-2 flex flex-col flex-1">
                  <p className="text-xs font-bold text-brand-purple mb-1.5">
                    Accessibility · Support at every step
                  </p>
                  <p className="text-xs text-muted leading-relaxed mb-4 min-h-[38px]">
                    Plan an accessible journey and experience event information your way.
                  </p>
                  <div className="space-y-3 mb-6">
                    <div>
                      <div className="font-feature italic font-black text-xs text-brand-deep">EaseGuide</div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">
                        Request assistance, follow accessible routes, and track assigned support staff.
                      </p>
                    </div>
                    <div>
                      <div className="font-feature italic font-black text-xs text-brand-deep">EaseVoice</div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">
                        Listen to event and booking details with adjustable narration controls.
                      </p>
                    </div>
                  </div>
                  <Link
                    to={user?.role === "customer" ? "/assistance" : "/events"}
                    className="mt-auto pt-4 border-t border-brand-purple/10 flex items-center justify-between text-xs font-bold text-brand-deep group hover:text-brand-purple transition-colors"
                  >
                    <span>Explore event-day support</span>
                    <ArrowUpRight className="h-4 w-4 text-brand-purple group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </Link>
                </div>
              </article>
            </div>

            <aside className="mt-8 rounded-2xl border border-brand-purple/15 bg-brand-lilac/40 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span className="text-xs sm:text-sm text-muted leading-relaxed">
                Bringing an event to life? Discover <span className="font-feature italic font-black text-brand-deep">EaseAnalytics</span> for your organizer team.
              </span>
              <button
                type="button"
                onClick={() => setAudienceTab("organizers")}
                className="text-xs sm:text-sm font-bold text-brand-purple hover:text-brand-deep transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                View organizer tools ↗
              </button>
            </aside>
          </div>
        )}

        {/* Tab 2: For Organizers */}
        {audienceTab === "organizers" && (
          <div id="organizers" role="tabpanel" aria-labelledby="organizer-tab" className="mt-12 ee-rise">
            <div className="relative overflow-hidden rounded-3xl bg-brand-deep text-white p-6 sm:p-10 lg:p-12 shadow-2xl border border-white/10">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-purple/20 blur-3xl"
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
            <p className="mt-3 text-center text-xs text-muted">
              One core product. Sales intelligence, operational visibility, and reporting—all within <span className="font-feature italic font-black text-brand-deep">EaseAnalytics</span>.
            </p>
            <aside className="mt-4 rounded-2xl border border-brand-purple/15 bg-brand-lilac/40 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span className="text-xs sm:text-sm text-muted leading-relaxed">
                Looking for community, seat views, or accessibility support?
              </span>
              <button
                type="button"
                onClick={() => setAudienceTab("customers")}
                className="text-xs sm:text-sm font-bold text-brand-purple hover:text-brand-deep transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                View customer features ↗
              </button>
            </aside>
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
