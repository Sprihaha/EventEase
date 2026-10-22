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
import { Badge, Button, Eyebrow, Input } from "../components/ui";

const promises = [
  { icon: ShieldCheck, h: "No hidden fees", p: "The price you see is the price you pay. Every fee itemised at checkout." },
  { icon: Repeat, h: "Secure exchange", p: "Swap or resell tickets one-to-one with verified buyers — no shady resellers." },
  { icon: Eye, h: "See before you sit", p: "360° venue views and real seat photos from the community before you buy." },
  { icon: Accessibility, h: "Built for everyone", p: "Companion assistance, audio guidance, and inclusive design as standard." },
];

export default function Home() {
  const { publicEvents: events, eventsSource, user } = useStore();
  const navigate = useNavigate();
  const featured = events.filter((event) => event.featured && event.status === "published");
  const published = events.filter((event) => event.status === "published");

  return (
    <div className="bg-brand-warm text-brand-text">
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
                navigate("/events");
              }}
              className="home-search-shadow mt-8 flex max-w-xl items-center gap-2 rounded-2xl bg-white p-2"
            >
              <Search className="ml-3 h-5 w-5 shrink-0 text-brand-purple" />
              <Input
                aria-label="Search artists, teams, and shows"
                placeholder="Search artists, teams, shows…"
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
            <div className="absolute -right-1 -top-4 z-10 rounded-full border border-white/15 bg-brand-deep/85 px-4 py-2.5 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span
                  className={`h-2 w-2 rounded-full ${
                    eventsSource === "backend"
                      ? "bg-live"
                      : "bg-brand-orange"
                  }`}
                />
                {eventsSource === "loading"
                  ? "Finding upcoming events…"
                  : eventsSource === "backend"
                    ? "Live via EventEase API"
                    : eventsSource === "error"
                      ? "Event service unavailable"
                      : "No events available"}
              </div>
            </div>
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2 sm:gap-6">
              {featured.slice(0, 2).map((event, index) => (
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

      <section className="mx-auto max-w-7xl px-5 py-20 sm:py-24">
        <div className="flex items-end justify-between gap-6">
          <div>
            <Eyebrow>What’s on</Eyebrow>
            <h2 className="mt-3 font-brand text-4xl font-bold tracking-tight text-brand-deep sm:text-5xl">
              Upcoming events
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
              Concerts, music, performing arts, dance, and more—sorted for what’s next.
            </p>
          </div>
          <Link
            to="/events"
            className="hidden items-center gap-2 rounded-full border border-brand-purple/20 bg-white px-5 py-2.5 text-sm font-semibold text-brand-purple transition hover:border-brand-purple hover:bg-brand-lilac focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20 sm:flex"
          >
            Browse all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((event) => (
            <EventCard key={event.id} ev={event} presentation="home" />
          ))}
        </div>
      </section>

      <section className="overflow-hidden bg-brand-deep text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 md:grid-cols-[0.9fr_1.1fr] md:py-24">
          <div>
            <Badge tone="accent" className="bg-brand-orange text-white">
              <Users className="h-3 w-3" /> EaseComms
            </Badge>
            <h2 className="mt-6 max-w-xl font-brand text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              EaseComms, a community for event discussion and sharing
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-white/65">
              Meet fellow fans, share real venue views with EasePix, earn points for useful photos,
              and exchange eligible tickets securely through EaseXchange.
            </p>
            <Button
              className="mt-8 bg-brand-purple text-white shadow-none hover:bg-brand-orange"
              onClick={() => navigate("/community")}
            >
              Enter the community
            </Button>
          </div>

          <div className="relative grid gap-4 sm:grid-cols-2">
            <div
              aria-hidden
              className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-magenta/20 blur-3xl"
            />
            <div className="relative border-l-2 border-brand-orange bg-white/5 p-7">
              <Camera className="h-7 w-7 text-brand-orange" />
              <div className="mt-10 font-brand text-2xl font-bold">EasePix</div>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                Upload relevant venue-seat photos and earn community points.
              </p>
            </div>
            <div className="relative border-l-2 border-brand-magenta bg-white/10 p-7 sm:translate-y-8">
              <Repeat className="h-7 w-7 text-brand-magenta" />
              <div className="mt-10 font-brand text-2xl font-bold">EaseXchange</div>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                Exchange eligible tickets with verified users under fair criteria.
              </p>
            </div>
            <div className="relative border-t border-white/10 px-2 pt-5 text-sm text-white/65 sm:col-span-2 sm:mt-8">
              <MessageCircle className="mr-2 inline h-4 w-4 text-brand-orange" />
              “Section C has the best sightlines—I’ve added a photo from row D.”
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 md:grid-cols-[0.8fr_1.2fr] md:py-24">
          <div className="md:sticky md:top-28 md:h-max">
            <Badge tone="accent" className="bg-brand-lilac text-brand-deep">
              <Route className="h-3 w-3" /> EaseGuide
            </Badge>
            <h2 className="mt-6 font-brand text-4xl font-bold tracking-tight text-brand-deep md:text-5xl">
              EaseGuide, make your journey seamless
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-muted">
              From planning your route to finding the right entrance and seat, get helpful guidance
              at every step of your event day.
            </p>
            <Button
              className="mt-8 bg-brand-purple text-white shadow-none hover:bg-brand-deep"
              onClick={() => navigate("/events")}
            >
              Plan an event day <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="divide-y divide-brand-deep/10 border-y border-brand-deep/10">
            {[
              { icon: Map, number: "01", title: "Plan", copy: "Venue details and accessible routes before you leave." },
              { icon: BellRing, number: "02", title: "Arrive", copy: "Timely reminders for doors, transport, and entry." },
              { icon: CircleCheck, number: "03", title: "Enjoy", copy: "Seat guidance and community tips when you need them." },
            ].map((step) => (
              <div key={step.number} className="grid grid-cols-[auto_1fr_auto] items-center gap-5 py-7 sm:gap-8 sm:py-9">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange">
                  <step.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-brand text-xl font-bold text-brand-deep">{step.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{step.copy}</p>
                </div>
                <span className="font-brand text-sm font-bold text-brand-purple">{step.number}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-warm px-5 py-8">
        <p className="text-center text-sm text-muted">
          {published.length} events available · Transparent, verified ticketing by EventEase
        </p>
      </section>
    </div>
  );
}
