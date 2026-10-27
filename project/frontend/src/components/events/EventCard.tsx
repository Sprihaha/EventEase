import { useLocation, useNavigate } from "react-router";
import { Calendar, MapPin } from "lucide-react";
import type { EventItem } from "../../lib/data";
import { currency, fmtDate, useStore } from "../../lib/store";
import { Badge, cx } from "../ui";

export function EventCard({
  ev,
  presentation = "default",
}: {
  ev: EventItem;
  presentation?: "default" | "home";
}) {
  const { user } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const from = ev.priceFrom ?? (ev.tiers.length ? Math.min(...ev.tiers.map((t) => t.price)) : 0);
  const sold = ev.tiers.reduce((a, t) => a + t.sold, 0);
  const total = ev.tiers.reduce((a, t) => a + t.total, 0);
  const pct = total ? Math.round((sold / total) * 100) : 0;
  const nearly = pct >= 85;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() =>
        navigate(user ? `/events/${ev.id}` : "/login", {
          state: { returnTo: `/events/${ev.id}`, from: location.pathname },
        })
      }
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(user ? `/events/${ev.id}` : "/login", {
            state: { returnTo: `/events/${ev.id}`, from: location.pathname },
          });
        }
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-brand-purple/15 bg-white shadow-[0_10px_35px_-20px_rgba(50,19,79,0.12)] transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-purple/35 hover:shadow-[0_20px_45px_-15px_rgba(50,19,79,0.18)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30"
    >
      <div className="relative aspect-[16/11] overflow-hidden">
        <img
          src={ev.image}
          alt={ev.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3.5">
          <Badge
            tone="neutral"
            className="border-0 bg-white/95 text-brand-deep font-bold shadow-sm backdrop-blur"
          >
            {ev.category}
          </Badge>
          {ev.earlyBird ? (
            <Badge
              tone="accent"
              className="border-0 bg-brand-orange text-white font-bold shadow-sm"
            >
              Early bird −{ev.earlyBird}%
            </Badge>
          ) : nearly ? (
            <Badge tone="warn" className="border-0 bg-warn text-white font-bold shadow-sm">
              {100 - pct}% left
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-brand text-xl font-bold leading-snug tracking-tight text-brand-deep transition-colors group-hover:text-brand-purple">
          {ev.title}
        </h3>
        <div className="mt-3 space-y-1.5 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-purple" /> {fmtDate(ev.date)}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand-orange" /> {ev.venue}, {ev.city}
          </div>
        </div>
        <div className="mt-5 flex items-end justify-between border-t border-brand-purple/10 pt-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">From</div>
            <div className="font-brand text-xl font-bold text-brand-deep">
              {ev.priceFrom === undefined && !ev.tiers.length ? "Price TBA" : currency(from)}
            </div>
          </div>
          <span className="flex items-center gap-1 font-brand text-sm font-bold text-brand-orange transition-transform group-hover:translate-x-1">
            View seats →
          </span>
        </div>
      </div>
    </article>
  );
}

export default EventCard;
