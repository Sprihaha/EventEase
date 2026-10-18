import { useLocation, useNavigate } from "react-router";
import { Calendar, MapPin } from "lucide-react";
import type { EventItem } from "../lib/data";
import { currency, fmtDate } from "../lib/store";
import { Badge } from "./ui";
import { useStore } from "../lib/store";
import { cx } from "./ui";

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
  const from = Math.min(...ev.tiers.map((t) => t.price));
  const sold = ev.tiers.reduce((a, t) => a + t.sold, 0);
  const total = ev.tiers.reduce((a, t) => a + t.total, 0);
  const pct = Math.round((sold / total) * 100);
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
      className={cx(
        "group flex cursor-pointer flex-col overflow-hidden rounded-3xl border bg-paper transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30",
        presentation === "home"
          ? "home-event-shadow border-brand-purple/15 hover:-translate-y-1.5 hover:border-brand-purple/35 hover:shadow-xl"
          : "border-line hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(11,11,15,0.4)]",
      )}
    >
      <div className={cx("relative overflow-hidden", presentation === "home" ? "aspect-[16/11]" : "aspect-[4/3]")}>
        <img
          src={ev.image}
          alt={ev.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <Badge
            tone="neutral"
            className={cx(
              "bg-white/90 backdrop-blur",
              presentation === "home" && "text-brand-deep shadow-sm",
            )}
          >
            {ev.category}
          </Badge>
          {ev.earlyBird ? (
            <Badge
              tone="accent"
              className={cx(
                "text-white",
                presentation === "home" ? "bg-brand-orange" : "bg-accent",
              )}
            >
              Early bird −{ev.earlyBird}%
            </Badge>
          ) : nearly ? (
            <Badge tone="warn" className="bg-warn text-white">
              {100 - pct}% left
            </Badge>
          ) : null}
        </div>
      </div>
      <div className={cx("flex flex-1 flex-col", presentation === "home" ? "p-6" : "p-5")}>
        <h3
          className={cx(
            "text-xl font-semibold leading-snug tracking-tight",
            presentation === "home" ? "font-brand text-brand-text" : "font-display",
          )}
        >
          {ev.title}
        </h3>
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
            <div className={cx("text-lg font-semibold", presentation === "home" ? "font-brand text-brand-deep" : "font-display")}>
              {currency(from)}
            </div>
          </div>
          <span className={cx("text-sm font-semibold group-hover:underline", presentation === "home" ? "text-brand-purple" : "text-accent")}>
            View seats →
          </span>
        </div>
      </div>
    </article>
  );
}
