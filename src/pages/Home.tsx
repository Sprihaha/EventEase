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
  const { events } = useStore();
  const navigate = useNavigate();
  const featured = events.filter((e) => e.featured && e.status === "published");
  const published = events.filter((e) => e.status === "published");

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div className="ee-rise">
            <Badge tone="accent">
              <Sparkles className="h-3 w-3" /> Next-generation ticketing
            </Badge>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[0.98] tracking-tight md:text-7xl">
              Every seat,<br />
              <span className="italic text-accent">no surprises.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted">
              Discover concerts, theatre, sports and cultural events. Pick your exact seat, see it
              before you sit, and buy with tickets you can actually trust.
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

      {/* Promises */}
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

      {/* Featured events */}
      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow>On sale now</Eyebrow>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight">Featured events</h2>
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

      {/* Community band */}
      <section className="mx-auto max-w-7xl px-5">
        <div className="grid items-center gap-10 overflow-hidden rounded-[2.5rem] bg-ink p-10 text-white md:grid-cols-2 md:p-16">
          <div>
            <Badge tone="accent" className="bg-accent text-white">
              <Users className="h-3 w-3" /> EaseComms
            </Badge>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-tight md:text-5xl">
              A shared space for every event
            </h2>
            <p className="mt-4 max-w-md text-white/70">
              Meet fellow fans before the show, coordinate seats, upload real photos of the view,
              and exchange tickets securely — all in one place, before and after you buy.
            </p>
            <Button className="mt-7" variant="primary" onClick={() => navigate("/community")}>
              Enter the community
            </Button>
          </div>
          <div className="grid gap-3">
            {[
              "“Section C has the best sightlines — went last tour.”",
              "“Anyone want to swap my VIP A2 for two standards?”",
              "“Wheelchair access via the east lobby — staff were great.”",
            ].map((q, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white/5 p-4 text-sm text-white/80 backdrop-blur"
                style={{ marginLeft: i * 24 }}
              >
                {q}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Organizer CTA */}
      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="flex flex-col items-center gap-6 rounded-[2.5rem] border border-line bg-mist/40 p-12 text-center">
          <Eyebrow>For organizers</Eyebrow>
          <h2 className="max-w-2xl font-display text-4xl font-semibold tracking-tight">
            Sell out your next event with tools that respect your fans
          </h2>
          <p className="max-w-xl text-muted">
            Create events in minutes, set VIP, standard and concession pricing, run early-bird
            promotions, and track sales in real time with built-in analytics.
          </p>
          <Button size="lg" onClick={() => navigate("/login")}>
            Start selling
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8">
        <p className="text-center text-sm text-muted">
          {published.length} events live · Trusted ticketing for Ticketmaster
        </p>
      </section>
    </div>
  );
}
