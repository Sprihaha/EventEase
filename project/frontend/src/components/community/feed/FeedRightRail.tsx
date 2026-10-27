import { Link } from "react-router"
import { Calendar } from "lucide-react"
import type { EventItem } from "../types"

interface FeedRightRailProps {
  events: EventItem[]
  onShowToast: (msg: string) => void
}

export function FeedRightRail({ events, onShowToast }: FeedRightRailProps) {
  return (
    <aside className="space-y-5">
      {/* Events on your radar */}
      <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <h3 className="font-brand text-sm font-bold text-brand-deep">
            Events on your radar
          </h3>
          <Link
            to="/events"
            className="text-xs font-extrabold text-brand-purple hover:underline"
          >
            See all
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
          <h3 className="font-brand text-sm font-bold text-brand-deep">
            Your kind of crowd
          </h3>
          <button
            type="button"
            onClick={() => onShowToast("Discovering new fan meetups…")}
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
            onClick={() =>
              onShowToast("Fan meetups feature activated for your area!")
            }
            className="cursor-pointer mt-3 w-full rounded-xl bg-brand-purple py-2 text-center text-xs font-bold text-white shadow-md shadow-brand-purple/20 transition hover:bg-brand-deep"
          >
            Find your people
          </button>
        </div>
      </section>

      {/* Quick reminder card */}
      <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
        <h3 className="font-brand text-xs font-bold uppercase tracking-wider text-muted">
          Quick reminder
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Keep exchanges on-platform, check venue accessibility before
          travelling, and share only what you’re comfortable sharing.
        </p>
      </section>
    </aside>
  )
}
