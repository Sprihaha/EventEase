import { Link, useNavigate } from "react-router";
import {
  Search,
  ShieldCheck,
  Repeat,
  Eye,
  Users,
  Accessibility,
  Sparkles,
  ArrowRight,
  Camera,
  MessageCircle,
  Route,
  BellRing,
  Map,
  CircleCheck,
} from "lucide-react";
import { useStore } from "../lib/store";
import { categoryList } from "../lib/data";
import { EventCard } from "../components/EventCard";
import { Button, Eyebrow, Badge } from "../components/ui";

const promises = [
  { icon: ShieldCheck, h: "No hidden fees", p: "The price you see is the price you pay. Every fee itemised at checkout." },
  { icon: Repeat, h: "Secure exchange", p: "Swap or resell tickets one-to-one with verified buyers — no shady resellers." },
  { icon: Eye, h: "See before you sit", p: "360° venue views and real seat photos from the community before you buy." },
  { icon: Accessibility, h: "Built for everyone", p: "Companion assistance, audio guidance, and inclusive design as standard." },
];

export default function Home() {
  const { events, eventsSource, user } = useStore();
  const navigate = useNavigate();
  const featured = events.filter((e) => e.featured && e.status === "published");
  const published = events.filter((e) => e.status === "published");

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_80%_20%,var(--color-accent-soft),transparent_36%)]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
          <div className="ee-rise">
            <Badge tone="accent">
              <Sparkles className="h-3 w-3" /> Your next experience starts here
            </Badge>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[0.98] tracking-tight md:text-7xl">
              Find your<br />
              <span className="italic text-accent">unforgettable.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted">
              Real concerts, music shows, theatre, dance, and cultural performances—discovered,
              discussed, and booked with confidence.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigate("/events");
              }}
              className="mt-8 flex items-center gap-2 rounded-full border border-line bg-paper p-1.5 shadow-sm"
            >
              <Search className="ml-3 h-5 w-5 text-muted" />
              <input
                placeholder="Search artists, teams, shows…"
                className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
              <Button type="submit">Explore</Button>
            </form>
            {!user && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-live" />
                Sign in is required when you select an event.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {categoryList.map((c) => (
                <Link
                  key={c}
                  to={`/events?cat=${c}`}
                  className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted transition hover:border-ink hover:text-ink"
                >
                  {c}
                </Link>
              ))}
            </div>
          </div>

          <div className="relative ee-rise" style={{ animationDelay: "0.1s" }}>
            <div className="absolute -right-4 -top-5 z-10 rounded-2xl border border-white/50 bg-paper/90 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className={`h-2 w-2 rounded-full ${eventsSource === "ticketmaster" || eventsSource === "backend" ? "bg-live" : "bg-accent"}`} />
                {eventsSource === "loading"
                  ? "Finding upcoming events…"
                  : eventsSource === "backend"
                    ? "Live via EventEase API"
                  : eventsSource === "ticketmaster"
                    ? "Live via Ticketmaster"
                    : "Curated event preview"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {featured.slice(0, 2).map((ev, i) => (
                <div key={ev.id} className={i === 0 ? "translate-y-6" : ""}>
                  <EventCard ev={ev} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-line bg-mist/40">
        <div className="mx-auto grid max-w-7xl gap-px overflow-hidden md:grid-cols-4">
          {promises.map((p) => (
            <div key={p.h} className="bg-paper p-6">
              <p.icon className="h-6 w-6 text-accent" />
              <div className="mt-4 font-display text-lg font-semibold">{p.h}</div>
              <p className="mt-1.5 text-sm text-muted">{p.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming events */}
      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow>What’s on</Eyebrow>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight">Upcoming events</h2>
            <p className="mt-2 max-w-lg text-sm text-muted">
              Concerts, music, performing arts, dance, and more—sorted for what’s next.
            </p>
          </div>
          <Link to="/events" className="hidden items-center gap-1 text-sm font-medium text-accent hover:underline sm:flex">
            Browse all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((ev) => (
            <EventCard key={ev.id} ev={ev} />
          ))}
        </div>
      </section>

      {/* EaseComms */}
      <section className="mx-auto max-w-7xl px-5">
        <div className="grid items-center gap-10 overflow-hidden rounded-[2.5rem] bg-ink p-10 text-white md:grid-cols-2 md:p-16">
          <div>
            <Badge tone="accent" className="bg-accent text-white">
              <Users className="h-3 w-3" /> EaseComms
            </Badge>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-tight md:text-5xl">
              EaseComms, a community for event discussion and sharing
            </h2>
            <p className="mt-4 max-w-md text-white/70">
              Meet fellow fans, share real venue views with EasePix, earn points for useful photos,
              and exchange eligible tickets securely through EaseXchange.
            </p>
            <Button className="mt-7" variant="primary" onClick={() => navigate("/community")}>
              Enter the community
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/10 p-6 backdrop-blur">
              <Camera className="h-6 w-6 text-white" />
              <div className="mt-8 font-display text-2xl font-semibold">EasePix</div>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Upload relevant venue-seat photos and earn community points.
              </p>
            </div>
            <div className="rounded-3xl bg-accent p-6 sm:translate-y-6">
              <Repeat className="h-6 w-6 text-white" />
              <div className="mt-8 font-display text-2xl font-semibold">EaseXchange</div>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Exchange eligible tickets with verified users under fair criteria.
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/70 sm:col-span-2">
              <MessageCircle className="mr-2 inline h-4 w-4" />
              “Section C has the best sightlines—I’ve added a photo from row D.”
            </div>
          </div>
        </div>
      </section>

      {/* EaseGuide */}
      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="grid gap-12 rounded-[2.5rem] border border-line bg-mist/40 p-8 md:grid-cols-[0.8fr_1.2fr] md:p-14">
          <div>
            <Badge tone="accent"><Route className="h-3 w-3" /> EaseGuide</Badge>
            <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight md:text-5xl">
              EaseGuide, make your journey seamless
            </h2>
            <p className="mt-4 max-w-md text-muted">
              From planning your route to finding the right entrance and seat, get helpful guidance
              at every step of your event day.
            </p>
            <Button className="mt-7" variant="dark" onClick={() => navigate("/events")}>
              Plan an event day <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Map, number: "01", title: "Plan", copy: "Venue details and accessible routes before you leave." },
              { icon: BellRing, number: "02", title: "Arrive", copy: "Timely reminders for doors, transport, and entry." },
              { icon: CircleCheck, number: "03", title: "Enjoy", copy: "Seat guidance and community tips when you need them." },
            ].map((step) => (
              <div key={step.number} className="flex flex-col rounded-3xl border border-line bg-paper p-5">
                <div className="flex items-center justify-between">
                  <step.icon className="h-5 w-5 text-accent" />
                  <span className="font-display text-sm text-muted">{step.number}</span>
                </div>
                <div className="mt-12 font-display text-xl font-semibold">{step.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8">
        <p className="text-center text-sm text-muted">
          {published.length} events available · Transparent, verified ticketing by EventEase
        </p>
      </section>
    </div>
  );
}
