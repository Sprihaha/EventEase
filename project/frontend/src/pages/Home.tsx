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
  CircleDollarSign,
  Ticket,
  FileSpreadsheet,
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
              <h3 className="font-brand text-2xl sm:text-3xl font-bold text-brand-deep tracking-tight">
                Your event, from every angle.
              </h3>
              <p className="mt-1 text-sm text-muted">
                Connect before the show. Choose with confidence. Feel supported on the day.
              </p>
            </div>

            {/* Two Groups Side by Side: EaseComms Suite (Left 4 Boxes) & Accessibility Features (Right 2 Boxes) */}
            <div className="grid gap-6 lg:gap-8 lg:grid-cols-3 items-stretch">
              {/* Group 1: EaseComms Suite (Left 2 Columns) */}
              <div className="lg:col-span-2 flex flex-col rounded-3xl border-2 border-brand-purple/20 bg-gradient-to-br from-[#f4ebff] via-[#fbf7fe] to-[#fff3e8] p-5 sm:p-7 shadow-sm">
                <div className="flex items-center justify-between pb-3.5 mb-6 border-b border-brand-purple/15">
                  <div className="flex items-center gap-2.5">
                    <span className="font-feature italic font-black text-2xl tracking-tight text-brand-orange leading-none">
                      EaseComms
                    </span>
                    <span className="text-xs font-semibold text-brand-deep/70 hidden sm:inline">
                      · Fan Community &amp; Event Hub
                    </span>
                  </div>
                  <Link
                    to="/community"
                    onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-orange hover:text-brand-purple transition-colors bg-white/80 px-3 py-1 rounded-full border border-brand-orange/25 shadow-2xs hover:bg-white"
                  >
                    <span>Open full hub</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className={cx("grid gap-6", user?.role === "admin" ? "max-w-xl mx-auto" : "sm:grid-cols-2")}>
                  {[
                    {
                      name: "EaseConnect",
                      tag: "01 · Social",
                      hook: "Event-linked conversations",
                      chip: "Chat",
                      icon: MessageCircle,
                      gradient: "bg-gradient-to-br from-[#3b126d] via-[#752648] to-[#c74500]",
                      title: "Connect with fellow eventgoers",
                      description: "Ask questions, share venue tips, and join event-linked discussions before the show starts.",
                      pills: ["Fan discussions", "Venue tips"],
                      link: "/community?tab=feed#main-tabs-nav",
                    },
                    {
                      name: "EasePix",
                      tag: "02 · Seat Views",
                      hook: "Real seat perspectives",
                      chip: "Views",
                      icon: Camera,
                      gradient: "bg-gradient-to-br from-[#3d1078] via-[#8a2b28] to-[#d44800]",
                      title: "See your view before you buy",
                      description: "Real seat photos, sightline ratings, accessibility notes, and contributor reward points.",
                      pills: ["Real sightlines", "Photo rewards"],
                      link: "/community?tab=views#main-tabs-nav",
                    },
                    {
                      name: "EaseXplore",
                      tag: "03 · 360° Tours",
                      hook: "Virtual venue tours",
                      chip: "360°",
                      icon: Rotate3d,
                      gradient: "bg-gradient-to-br from-[#46127a] via-[#842735] to-[#d95200]",
                      title: "Explore sections in immersive 360°",
                      description: "Interactive 360° virtual tours to explore venue sections, sightlines, and elevation before booking.",
                      pills: ["Virtual tours", "Seat elevation"],
                      link: "/community?tab=views#main-tabs-nav",
                    },
                    {
                      name: "EaseXchange",
                      tag: "04 · Ticket Swap",
                      hook: "Pre-QR verified exchange",
                      chip: "Swap",
                      icon: Repeat,
                      gradient: "bg-gradient-to-br from-[#4a0e82] via-[#7c2e3a] to-[#c43c00]",
                      title: "Pre-QR ticket exchange & verified swaps",
                      description: "Safely swap eligible seats with verified fans at original face value before ticket sales close—official QR codes are issued only once after sales end.",
                      pills: ["Pre-QR swaps", "Face value only"],
                      link: "/community?tab=exchange#main-tabs-nav",
                    },
                  ]
                    .filter((feat) => {
                      if (user?.role === "admin") {
                        return feat.name !== "EasePix" && feat.name !== "EaseXplore" && feat.name !== "EaseXchange";
                      }
                      return true;
                    })
                    .map((feat) => (
                    <Link
                      key={feat.name}
                      to={feat.link}
                      onClick={() => {
                        if (!feat.link.includes("#")) {
                          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                        }
                      }}
                      className="group flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple rounded-2xl"
                    >
                      <div
                        className={cx(
                          "relative overflow-hidden rounded-2xl border border-white/20 p-5 sm:p-6 shadow-md transition-all duration-300",
                          "group-hover:shadow-2xl group-hover:scale-[1.02] group-hover:border-brand-orange/40",
                          "flex flex-col justify-between min-h-[320px] sm:min-h-[340px] text-white",
                          "before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_65%)] before:pointer-events-none",
                          feat.gradient
                        )}
                      >
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-brand-orange/35 blur-2xl"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -left-8 -bottom-8 h-36 w-36 rounded-full bg-brand-purple/45 blur-2xl"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-4 -bottom-4 h-36 w-36 rounded-full border border-white/10"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-10 -bottom-10 h-48 w-48 rounded-full border border-dashed border-white/10"
                        />

                        {/* TOP: Floating Composition */}
                        <div className="relative z-10 w-full mb-2">
                          {feat.name === "EaseConnect" && (
                            <div className="relative w-full h-40 sm:h-44 flex flex-col justify-center px-1">
                              {/* Fan question post */}
                              <div className="relative z-10 w-[88%] rounded-2xl rounded-bl-xs bg-white p-2.5 shadow-xl -rotate-1 border border-white/60 text-brand-deep mb-2">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-purple text-[7px] font-bold text-white">
                                      M
                                    </span>
                                    <span className="text-[9px] font-bold text-brand-deep">Marcus L.</span>
                                    <span className="text-[7px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                      Verified Attendee
                                    </span>
                                  </div>
                                  <span className="text-[7px] font-extrabold text-brand-purple bg-brand-lilac/70 px-1.5 py-0.2 rounded-full border border-brand-purple/20">
                                    Question
                                  </span>
                                </div>
                                <p className="text-[9px] text-brand-deep/90 font-medium leading-tight">
                                  "Can latecomers enter after the acoustic set starts?"
                                </p>
                              </div>

                              {/* Official Admin answer */}
                              <div className="relative z-10 w-[88%] ml-auto rounded-2xl rounded-br-xs bg-brand-deep text-white p-2.5 shadow-2xl rotate-1 border border-white/20">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-orange text-[7px] font-bold text-white">
                                      ★
                                    </span>
                                    <span className="text-[9px] font-bold text-white">EventEase Admin</span>
                                    <span className="rounded bg-brand-purple text-white px-1 py-0.2 text-[7px] font-extrabold tracking-wider">
                                      Official Answer
                                    </span>
                                  </div>
                                  <span className="text-[7px] text-white/60">Just now</span>
                                </div>
                                <p className="text-[9px] text-white/95 font-medium leading-tight">
                                  "Yes! Ushers seat attendees between pieces so you won't miss the show. 🎶"
                                </p>
                              </div>

                              <div className="absolute -top-1 -right-1 z-20 rounded-full bg-brand-orange px-2.5 py-0.5 text-[8px] font-extrabold text-white shadow-xl flex items-center gap-1 rotate-2 border border-white/30">
                                <Sparkles className="h-2.5 w-2.5" />
                                <span>Earn EasePoints</span>
                              </div>
                            </div>
                          )}

                          {feat.name === "EasePix" && (
                            <div className="relative w-full h-40 sm:h-44 flex items-center justify-center">
                              <div className="relative z-10 w-[88%] rounded-xl bg-white p-2.5 shadow-2xl -rotate-1 border border-white/60 text-brand-deep">
                                <div className="flex items-center justify-between pb-1 border-b border-brand-purple/10">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-brand-deep">Singapore Indoor Stadium</span>
                                    <span className="text-[7px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                      Verified
                                    </span>
                                  </div>
                                  <span className="text-[8px] font-bold text-brand-orange">Sec 102 · Row G</span>
                                </div>
                                <div className="relative mt-1.5 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-[#120524] via-[#240b3b] to-[#40121d] p-2 flex flex-col justify-between border border-brand-purple/20">
                                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(255,101,0,0.5),transparent_70%)]" />
                                  <div className="flex items-center justify-between z-10">
                                    <span className="rounded bg-brand-orange px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-white">
                                      SEAT VIEW
                                    </span>
                                    <span className="rounded bg-black/50 px-1.5 py-0.2 text-[7px] font-bold text-white backdrop-blur-xs">
                                      ★ 5.0 Sightline
                                    </span>
                                  </div>
                                  <div className="relative z-10 flex items-center justify-center py-0.5">
                                    <div className="h-3.5 px-3 rounded-full bg-brand-purple/90 text-[7px] font-black tracking-widest text-white shadow-sm flex items-center justify-center border border-white/20">
                                      MAIN STAGE SIGHTLINE
                                    </div>
                                  </div>
                                  <div className="relative z-10 flex items-center justify-between text-[7px] text-white/90 font-medium">
                                    <span>Unobstructed View</span>
                                    <span>Seat 14</span>
                                  </div>
                                </div>
                              </div>

                              <div className="absolute -top-1 -right-2 z-20 rounded-full bg-brand-orange px-2.5 py-1 shadow-xl border border-white/30 flex items-center gap-1 text-[8px] font-extrabold text-white rotate-3">
                                <Sparkles className="h-2.5 w-2.5" />
                                <span>Earn EasePoints ✓</span>
                              </div>

                              <div className="absolute -bottom-1 -left-1 z-20 rounded-full bg-brand-deep px-2.5 py-0.5 text-[8px] font-bold text-white shadow-xl -rotate-2 border border-white/20">
                                Approved Patron Photo ✓
                              </div>
                            </div>
                          )}

                          {feat.name === "EaseXplore" && (
                            <div className="relative w-full h-40 sm:h-44 flex items-center justify-center">
                              <div className="relative z-10 w-[88%] rounded-xl bg-white p-2.5 shadow-2xl -rotate-1 border border-white/60 text-brand-deep">
                                <div className="flex items-center justify-between pb-1 border-b border-brand-purple/10">
                                  <div className="flex items-center gap-1.5">
                                    <Rotate3d className="h-3 w-3 text-brand-orange animate-spin" />
                                    <span className="text-[9px] font-bold text-brand-deep">EaseXplore · Official Venue View</span>
                                  </div>
                                  <span className="text-[8px] font-bold text-brand-purple">CHIJMES Hall</span>
                                </div>
                                <div className="relative mt-1.5 h-16 rounded-lg bg-gradient-to-t from-slate-950 via-indigo-950 to-purple-950 border border-brand-purple/20 flex flex-col justify-between p-2 overflow-hidden">
                                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,101,0,0.3),transparent_75%)]" />
                                  <div className="flex items-center justify-between z-10">
                                    <span className="rounded bg-brand-purple/80 px-1.5 py-0.2 text-[7px] font-bold text-white backdrop-blur-xs">
                                      Section A (Floor)
                                    </span>
                                    <span className="rounded bg-emerald-500/80 px-1.5 py-0.2 text-[7px] font-bold text-white backdrop-blur-xs">
                                      Venue Tour Active
                                    </span>
                                  </div>
                                  <div className="relative z-10 flex items-center justify-center">
                                    <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 backdrop-blur-md border border-white/30 text-[7.5px] font-bold text-white shadow-xs">
                                      <Rotate3d className="h-2.5 w-2.5 text-brand-orange" />
                                      <span>360° Drag &amp; Walkthrough</span>
                                    </div>
                                  </div>
                                  <div className="relative z-10 flex items-center justify-between text-[7px] text-white/80">
                                    <span>Elevation: Floor Level</span>
                                    <span>Full Stage Panorama</span>
                                  </div>
                                </div>
                              </div>

                              <div className="absolute -top-1 -right-2 z-20 rounded-full bg-brand-orange px-2.5 py-1 text-[8px] font-bold text-white shadow-xl rotate-3 flex items-center gap-1 border border-white/40">
                                <span>Official 360° View ✓</span>
                              </div>

                              <div className="absolute -bottom-1 -left-1 z-20 rounded-lg bg-brand-deep text-white px-2 py-0.5 text-[8px] font-bold shadow-xl border border-white/20 -rotate-2">
                                Interactive Venue Elevation
                              </div>
                            </div>
                          )}

                          {feat.name === "EaseXchange" && (
                            <div className="relative w-full h-40 sm:h-44 flex items-center justify-center">
                              <div className="relative z-10 w-[88%] rounded-xl bg-white p-3 shadow-2xl rotate-1 border border-white/60 text-brand-deep">
                                <div className="flex items-center justify-between pb-1.5 border-b border-brand-purple/10">
                                  <div className="flex items-center gap-1.5">
                                    <Repeat className="h-3.5 w-3.5 text-brand-orange" />
                                    <span className="text-[10px] font-bold text-brand-deep">Verified Ticket Swap</span>
                                  </div>
                                  <span className="text-[7.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                                    Face Value Cap ✓
                                  </span>
                                </div>

                                <div className="my-1.5 rounded-lg bg-brand-warm/60 p-2 border border-brand-purple/10 flex items-center justify-between gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[7px] font-bold text-muted uppercase block">Your Ticket</span>
                                    <span className="text-[9px] font-bold text-brand-deep block truncate">Cat 1 · Sec 104 · Row C</span>
                                  </div>
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-orange text-white shadow-xs">
                                    <Repeat className="h-2.5 w-2.5" />
                                  </div>
                                  <div className="min-w-0 flex-1 text-right">
                                    <span className="text-[7px] font-bold text-brand-orange uppercase block">Requested</span>
                                    <span className="text-[9px] font-bold text-brand-deep block truncate">Cat 1 · Sec 102 · Row A</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[7.5px] pt-1 border-t border-brand-purple/10 text-muted">
                                  <span>QR released on release date</span>
                                  <span className="font-bold text-brand-orange">100% Scam-Proof ✓</span>
                                </div>
                              </div>

                              <div className="absolute -top-1.5 -right-2 z-20 rounded-full bg-brand-orange px-2.5 py-1 text-[8px] font-extrabold text-white shadow-xl rotate-3 border border-white/40 flex items-center gap-1">
                                <Sparkles className="h-2.5 w-2.5" />
                                <span>Earn EasePoints ✓</span>
                              </div>

                              <div className="absolute -bottom-1 -left-1 z-20 rounded-full bg-brand-deep text-white px-2 py-0.5 text-[8px] font-bold shadow-lg -rotate-2 border border-white/20 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>Pre-QR Swap · Verified Fans</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* BOTTOM: Feature Identity */}
                        <div className="relative z-10 w-full pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/10 text-brand-lilac border border-white/15 backdrop-blur-md">
                              <span className="h-1 w-1 rounded-full bg-brand-orange" />
                              {feat.tag}
                            </span>
                            <span className="text-[11px] font-semibold text-brand-orange drop-shadow-sm">
                              {feat.hook}
                            </span>
                          </div>
                          <h4 className="font-feature italic font-black text-2xl sm:text-3xl text-white tracking-tight leading-none drop-shadow-sm mt-2">
                            {feat.name}
                          </h4>
                        </div>
                      </div>

                      {/* Caption Below Gradient Box */}
                      <div className="mt-3 px-1">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="font-brand font-bold text-sm sm:text-base text-brand-deep group-hover:text-brand-purple transition-colors">
                            {feat.title}
                          </h5>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-brand-deep/15 bg-white/80 text-brand-orange group-hover:border-brand-purple/40 group-hover:bg-brand-purple/10 transition-all shrink-0 shadow-2xs">
                            <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                          {feat.description}
                        </p>

                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {feat.pills.map((pill) => (
                            <span
                              key={pill}
                              className="inline-flex items-center rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-brand-deep border border-brand-purple/15 shadow-2xs"
                            >
                              {pill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Group 2: Accessibility Features (Right 1 Column) */}
              <div className="lg:col-span-1 flex flex-col rounded-3xl border-2 border-brand-orange/20 bg-gradient-to-br from-[#fff1e5] via-[#fff8f0] to-[#f6edff] p-5 sm:p-7 shadow-sm">
                <div className="flex items-center justify-between pb-3.5 mb-6 border-b border-brand-orange/15">
                  <div className="flex items-center gap-2">
                    <Accessibility className="h-4.5 w-4.5 text-brand-orange" />
                    <span className="font-brand font-bold text-base text-brand-deep leading-none">
                      Accessibility Features
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-brand-deep/70 bg-white/80 px-2.5 py-0.5 rounded-full border border-brand-orange/20 shadow-2xs">
                    Inclusive support
                  </span>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    {
                      name: "EaseGuide",
                      tag: "01 · Assistance",
                      hook: "Companion support & booking assistance",
                      chip: "Assistance",
                      icon: Accessibility,
                      gradient: "bg-gradient-to-br from-[#50107a] via-[#7a2840] to-[#b83c00]",
                      title: "Companion support & venue assistance",
                      description: "Request companion assistance for your booking, choose support levels, and get paired with on-site venue staff.",
                      pills: ["Companion staff", "Support levels"],
                      link: user ? "/assistance" : "/login?portal=CUSTOMER",
                    },
                    {
                      name: "EaseVoice",
                      tag: "02 · Audio",
                      hook: "Text-to-speech screen reader",
                      chip: "Voice",
                      icon: Volume2,
                      gradient: "bg-gradient-to-br from-[#581382] via-[#7e2945] to-[#c43c00]",
                      title: "Highlight-to-speech audio reader",
                      description: "Switch EaseVoice on and highlight any words across the platform to have them read aloud at your preferred speed.",
                      pills: ["Highlight to speech", "Voice speed"],
                      link: "/settings/accessibility",
                    },
                  ].map((feat) => (
                    <Link
                      key={feat.name}
                      to={feat.link}
                      onClick={() => {
                        if (!feat.link.includes("#")) {
                          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                        }
                      }}
                      className="group flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple rounded-2xl"
                    >
                      <div
                        className={cx(
                          "relative overflow-hidden rounded-2xl border border-white/20 p-5 sm:p-6 shadow-md transition-all duration-300",
                          "group-hover:shadow-2xl group-hover:scale-[1.02] group-hover:border-brand-orange/40",
                          "flex flex-col justify-between min-h-[320px] sm:min-h-[340px] text-white",
                          "before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_65%)] before:pointer-events-none",
                          feat.gradient
                        )}
                      >
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-brand-orange/35 blur-2xl"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -left-8 -bottom-8 h-36 w-36 rounded-full bg-brand-purple/45 blur-2xl"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-4 -bottom-4 h-36 w-36 rounded-full border border-white/10"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-10 -bottom-10 h-48 w-48 rounded-full border border-dashed border-white/10"
                        />

                        {/* TOP: Floating Composition */}
                        <div className="relative z-10 w-full mb-2">
                          {feat.name === "EaseGuide" && (
                            <div className="relative w-full h-40 sm:h-44 flex items-center justify-center">
                              <div className="relative z-10 w-[88%] rounded-xl bg-white p-3 shadow-2xl rotate-1 border border-white/60 text-brand-deep">
                                <div className="flex items-center justify-between pb-1.5 border-b border-brand-purple/10">
                                  <div className="flex items-center gap-1.5">
                                    <Accessibility className="h-3.5 w-3.5 text-brand-orange" />
                                    <span className="text-[10px] font-bold text-brand-deep">EaseGuide · Assistance</span>
                                  </div>
                                  <span className="text-[7.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                                    Assigned ✓
                                  </span>
                                </div>

                                <div className="my-1.5 rounded-lg bg-brand-warm/60 p-2 border border-brand-purple/10 space-y-1">
                                  <div className="flex items-center justify-between text-[8px]">
                                    <span className="font-bold text-brand-deep">Harry Potter: Visions of Magic</span>
                                    <span className="rounded bg-brand-lilac px-1.5 py-0.2 text-[7px] font-bold text-brand-purple">
                                      Moderate Support
                                    </span>
                                  </div>
                                  <p className="text-[8px] text-muted leading-tight">
                                    Wheelchair arrival support &amp; companion escort to seat
                                  </p>
                                </div>

                                <div className="flex items-center justify-between text-[7.5px] pt-1 border-t border-brand-purple/10 text-muted">
                                  <div className="flex items-center gap-1.5">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-purple text-[7px] font-bold text-white">
                                      SK
                                    </span>
                                    <span className="font-bold text-brand-deep">Sarah K. (Venue Staff)</span>
                                  </div>
                                  <span className="font-bold text-brand-orange">On-site standby ●</span>
                                </div>
                              </div>

                              <div className="absolute -top-1.5 -right-2 z-20 rounded-full bg-brand-orange px-2.5 py-0.5 text-[8px] font-bold text-white shadow-xl rotate-2 border border-white/30">
                                Booking Linked ✓
                              </div>

                              <div className="absolute -bottom-1 -left-1 z-20 rounded-full bg-brand-deep text-white px-2 py-0.5 text-[8px] font-bold shadow-lg -rotate-2 border border-white/20 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                <span>Companion Support</span>
                              </div>
                            </div>
                          )}

                          {feat.name === "EaseVoice" && (
                            <div className="relative w-full h-40 sm:h-44 flex items-center justify-center">
                              <div className="relative z-10 w-[88%] rounded-xl bg-white p-3 shadow-2xl rotate-1 border border-white/60 text-brand-deep">
                                <div className="flex items-center justify-between pb-1.5 border-b border-brand-purple/10">
                                  <div className="flex items-center gap-1.5">
                                    <Volume2 className="h-3.5 w-3.5 text-brand-orange" />
                                    <span className="text-[10px] font-bold text-brand-deep">EaseVoice · Screen Reader</span>
                                  </div>
                                  <span className="text-[7.5px] font-bold text-white bg-brand-purple px-1.5 py-0.5 rounded-full">
                                    Voice ON
                                  </span>
                                </div>

                                {/* Text selection highlight simulation */}
                                <div className="my-1.5 rounded-lg bg-brand-warm/60 p-2 border border-brand-purple/10">
                                  <div className="text-[8px] leading-relaxed text-brand-deep/80">
                                    <span>Accessible entrance via </span>
                                    <span className="bg-brand-orange/20 text-brand-deep font-bold px-1 py-0.5 rounded border border-brand-orange/40">
                                      Gate 2 Lift concourse
                                    </span>
                                    <span>. Wheelchair bays reserved.</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[7.5px] pt-1 border-t border-brand-purple/10">
                                  <span className="text-brand-orange font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-brand-orange animate-ping" />
                                    Reading highlighted text aloud…
                                  </span>
                                  <span className="font-bold text-muted">1.0× Speed</span>
                                </div>
                              </div>

                              <div className="absolute -top-1 -right-2 z-20 rounded-full bg-brand-deep text-white px-2.5 py-1 text-[8px] font-bold shadow-xl -rotate-2 border border-white/20">
                                Highlight Any Text
                              </div>

                              <div className="absolute -bottom-1 -left-1 z-20 rounded-full bg-brand-orange text-white px-2.5 py-0.5 text-[8px] font-bold shadow-xl rotate-2 flex items-center gap-1 border border-white/30">
                                <span>Text-to-Speech Active</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* BOTTOM: Feature Identity */}
                        <div className="relative z-10 w-full pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/10 text-brand-lilac border border-white/15 backdrop-blur-md">
                              <span className="h-1 w-1 rounded-full bg-brand-orange" />
                              {feat.tag}
                            </span>
                            <span className="text-[11px] font-semibold text-brand-orange drop-shadow-sm">
                              {feat.hook}
                            </span>
                          </div>
                          <h4 className="font-feature italic font-black text-2xl sm:text-3xl text-white tracking-tight leading-none drop-shadow-sm mt-2">
                            {feat.name}
                          </h4>
                        </div>
                      </div>

                      {/* Caption Below Gradient Box */}
                      <div className="mt-3 px-1">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="font-brand font-bold text-sm sm:text-base text-brand-deep group-hover:text-brand-purple transition-colors">
                            {feat.title}
                          </h5>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-brand-deep/15 bg-white/80 text-brand-orange group-hover:border-brand-purple/40 group-hover:bg-brand-purple/10 transition-all shrink-0 shadow-2xs">
                            <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                          {feat.description}
                        </p>

                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {feat.pills.map((pill) => (
                            <span
                              key={pill}
                              className="inline-flex items-center rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-brand-deep border border-brand-orange/20 shadow-2xs"
                            >
                              {pill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
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
                  <div className="inline-flex items-center gap-3 rounded-full border border-white/30 bg-brand-deep/60 px-4 py-2 backdrop-blur-md">
                    <span className="font-feature italic font-black text-2xl tracking-tight text-brand-orange leading-none">
                      EaseAnalytics
                    </span>
                  </div>
                  <h3 className="mt-4 font-brand text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-white">
                    Your event.<br />
                    <span className="text-brand-lilac">The full sales picture.</span>
                  </h3>
                  <p className="mt-4 text-xs sm:text-sm text-white/75 leading-relaxed max-w-lg">
                    Sales performance and revenue velocity across your EventEase events—read-only, verified, and audit-ready.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-brand-lilac text-xs">
                        <TrendingUp className="h-3.5 w-3.5 text-brand-orange" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Confirmed sales &amp; daily revenue</h4>
                        <p className="text-xs text-white/60 leading-relaxed mt-0.5">
                          Track total tickets sold, confirmed bookings, and average daily revenue velocity over 7, 30, and 90-day windows.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-brand-lilac text-xs">
                        <Ticket className="h-3.5 w-3.5 text-brand-orange" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Seating tier demand breakdown</h4>
                        <p className="text-xs text-white/60 leading-relaxed mt-0.5">
                          Monitor demand distribution, ticket counts, and revenue shares across every tier—from VIP to special assistance.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-brand-lilac text-xs">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-brand-orange" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Audit-ready exports (PDF &amp; Excel)</h4>
                        <p className="text-xs text-white/60 leading-relaxed mt-0.5">
                          Download presentable executive PDF summaries and full Excel workbooks with native charts in one click.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8">
                    <Link
                      to="/login?portal=ORGANISER"
                      onClick={() => {
                        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-6 py-3 text-xs sm:text-sm font-bold text-brand-deep hover:bg-brand-amber transition shadow-lg"
                    >
                      Explore EaseAnalytics <span>↗</span>
                    </Link>
                  </div>
                </div>

                <div className="w-full">
                  <div className="rounded-2xl border border-white/20 bg-white p-5 sm:p-6 text-brand-deep shadow-2xl sm:rotate-1 transform transition-transform hover:rotate-0">
                    <div className="flex items-center justify-between pb-3.5 border-b border-brand-purple/10">
                      <span className="text-xs font-bold text-brand-deep">Sales performance</span>
                      <span className="text-[10px] rounded-full border border-brand-purple/20 bg-brand-warm px-2 py-0.5 text-muted">
                        Sample data · 30 days
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl border border-brand-purple/10 bg-brand-lilac/30 p-2.5 sm:p-3">
                        <span className="text-[9px] text-muted block mb-1">Confirmed bookings</span>
                        <strong className="text-base sm:text-lg font-bold text-brand-deep block leading-none">842</strong>
                        <small className="text-[8px] text-muted block mt-1">Illustrative total</small>
                      </div>
                      <div className="rounded-xl border border-brand-purple/10 bg-brand-lilac/30 p-2.5 sm:p-3">
                        <span className="text-[9px] text-muted block mb-1">Tickets sold</span>
                        <strong className="text-base sm:text-lg font-bold text-brand-deep block leading-none">1,248</strong>
                        <small className="text-[8px] text-muted block mt-1">Across all tiers</small>
                      </div>
                      <div className="rounded-xl border border-brand-purple/10 bg-brand-lilac/30 p-2.5 sm:p-3">
                        <span className="text-[9px] text-muted block mb-1">Total revenue</span>
                        <strong className="text-base sm:text-lg font-bold text-brand-deep block leading-none">S$87.4k</strong>
                        <small className="text-[8px] text-muted block mt-1">Singapore dollars</small>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[10px] mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-brand-deep">Revenue velocity</span>
                          <div className="flex items-center gap-2.5 text-[8.5px] text-muted">
                            <span className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-brand-purple" />
                              <span>Running total</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-brand-orange" />
                              <span>Daily revenue</span>
                            </span>
                          </div>
                        </div>
                        <span className="text-muted text-[9px]">Last 30 days trend</span>
                      </div>

                      {/* SVG Line Graph (matching EaseAnalytics) */}
                      <div className="rounded-xl border border-brand-purple/10 bg-brand-warm/40 p-2.5">
                        <svg
                          viewBox="0 0 380 95"
                          className="w-full h-24 overflow-visible"
                          role="img"
                          aria-label="Revenue velocity line graph showing daily revenue and running total over 30 days"
                        >
                          <defs>
                            <linearGradient id="runningGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6b21a8" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#6b21a8" stopOpacity="0.0" />
                            </linearGradient>
                            <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ea580c" stopOpacity="0.15" />
                              <stop offset="100%" stopColor="#ea580c" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          {/* Horizontal guide lines */}
                          <line x1="0" y1="18" x2="380" y2="18" stroke="#e2d9f3" strokeDasharray="3 5" strokeWidth="1" />
                          <line x1="0" y1="46" x2="380" y2="46" stroke="#e2d9f3" strokeDasharray="3 5" strokeWidth="1" />
                          <line x1="0" y1="74" x2="380" y2="74" stroke="#e2d9f3" strokeDasharray="3 5" strokeWidth="1" />

                          {/* Running total gradient area & curve */}
                          <path
                            d="M 10,78 Q 65,74 120,64 T 230,42 T 320,24 T 370,12 L 370,88 L 10,88 Z"
                            fill="url(#runningGrad)"
                          />
                          <path
                            d="M 10,78 Q 65,74 120,64 T 230,42 T 320,24 T 370,12"
                            fill="none"
                            stroke="#6b21a8"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />

                          {/* Daily revenue line with fluctuations */}
                          <path
                            d="M 10,80 L 35,76 L 65,68 L 95,74 L 125,62 L 155,67 L 185,55 L 215,58 L 245,46 L 275,52 L 305,38 L 335,32 L 370,22"
                            fill="none"
                            stroke="#ea580c"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Peak / current day highlight nodes */}
                          <g>
                            <circle cx="370" cy="12" r="4.5" fill="#ffffff" stroke="#6b21a8" strokeWidth="2.5" />
                            <circle cx="370" cy="22" r="3.5" fill="#ffffff" stroke="#ea580c" strokeWidth="2" />
                          </g>

                          {/* Mid point highlight dot */}
                          <circle cx="245" cy="46" r="3" fill="#ffffff" stroke="#ea580c" strokeWidth="1.5" />
                        </svg>

                        <div className="flex justify-between text-[8px] text-muted mt-1 px-1 border-t border-brand-purple/10 pt-1">
                          <span>Day 1</span>
                          <span>Day 15</span>
                          <span>Day 30</span>
                        </div>
                      </div>
                    </div>

                    {/* Ticket tier demand breakdown (matching actual EaseAnalytics) */}
                    <div className="mt-3.5 space-y-2 text-[10px]">
                      <div className="flex items-center justify-between font-bold text-brand-deep text-[11px] mb-1">
                        <span>Ticket tier demand</span>
                        <span className="text-[9px] font-normal text-muted">Share of tickets</span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[9px] text-muted mb-0.5">
                          <span className="font-medium text-brand-deep">Cat 1</span>
                          <span>540 sold · 43.3%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-mist overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-orange" style={{ width: "43.3%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[9px] text-muted mb-0.5">
                          <span className="font-medium text-brand-deep">VIP</span>
                          <span>380 sold · 30.4%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-mist overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-orange" style={{ width: "30.4%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[9px] text-muted mb-0.5">
                          <span className="font-medium text-brand-deep">Special assistance</span>
                          <span>128 sold · 10.3%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-mist overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-orange" style={{ width: "10.3%" }} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3.5 pt-3 border-t border-brand-purple/10 flex items-center justify-between text-[9px] text-muted">
                      <span>Export audit reports</span>
                      <div className="flex gap-1.5">
                        <span className="rounded bg-brand-lilac px-2 py-0.5 font-bold text-brand-purple">PDF ↓</span>
                        <span className="rounded bg-brand-lilac px-2 py-0.5 font-bold text-brand-purple">Excel (.xlsx) ↓</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] text-white/50 text-right">
                    Dashboard illustration only. Reflects actual EaseAnalytics reporting capabilities.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-muted">
              One core reporting suite. Sales velocity, seating tier demand, and exportable audit reports—all within <span className="font-feature italic font-black text-brand-deep">EaseAnalytics</span>.
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
