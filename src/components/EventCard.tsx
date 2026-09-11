import { Link } from "react-router";
import { Calendar, MapPin } from "lucide-react";
import type { EventItem } from "../lib/data";
import { currency, fmtDate } from "../lib/store";
import { Badge } from "./ui";

export function EventCard({ ev }: { ev: EventItem }) {
  const from = Math.min(...ev.tiers.map((t) => t.price));
  const sold = ev.tiers.reduce((a, t) => a + t.sold, 0);
  const total = ev.tiers.reduce((a, t) => a + t.total, 0);
  const pct = Math.round((sold / total) * 100);
  const nearly = pct >= 85;
  return (
    <Link
      to={`/events/${ev.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-paper transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(11,11,15,0.4)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={ev.image}
          alt={ev.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <Badge tone="neutral" className="bg-white/90 backdrop-blur">
            {ev.category}
          </Badge>
          {ev.earlyBird ? (
            <Badge tone="accent" className="bg-accent text-white">
              Early bird −{ev.earlyBird}%
            </Badge>
          ) : nearly ? (
            <Badge tone="warn" className="bg-warn text-white">
              {100 - pct}% left
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-semibold leading-snug tracking-tight">{ev.title}</h3>
        <div className="mt-3 space-y-1.5 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> {fmtDate(ev.date)}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" /> {ev.venue}, {ev.city}
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
          <div>
            <div className="text-xs text-muted">From</div>
            <div className="font-display text-lg font-semibold">{currency(from)}</div>
          </div>
          <span className="text-sm font-medium text-accent group-hover:underline">
            View seats →
          </span>
        </div>
      </div>
    </Link>
  );
}
