import {
  Users,
  Camera,
  Rotate3d,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Clock,
} from "lucide-react"
import { cx } from "../../ui"

interface CommunitySidebarProps {
  tab: "feed" | "views"
  onSelectTab: (tab: "feed" | "views") => void
  isSidebarCollapsed: boolean
  onToggleCollapse: (collapsed: boolean) => void
  onShowToast: (msg: string) => void
}

export function CommunitySidebar({
  tab,
  onSelectTab,
  isSidebarCollapsed,
  onToggleCollapse,
  onShowToast,
}: CommunitySidebarProps) {
  return (
    <aside className="space-y-4">
      <div
        className={cx(
          "rounded-3xl border border-brand-line bg-white shadow-sm lg:sticky lg:top-2 transition-all duration-300",
          isSidebarCollapsed ? "p-2.5" : "p-4",
        )}
      >
        {/* Collapse/Expand Toggle Header */}
        {isSidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1.5 pb-2">
            <button
              type="button"
              onClick={() => onToggleCollapse(false)}
              title="Expand Channels"
              className="cursor-pointer flex h-9 w-9 items-center justify-center rounded-xl bg-brand-lilac/70 text-brand-purple hover:bg-brand-purple hover:text-white transition shadow-sm"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="text-[9px] font-black uppercase tracking-wider text-muted text-center leading-tight">
              Channels
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted">
              Channels
            </span>
            <button
              type="button"
              onClick={() => onToggleCollapse(true)}
              title="Collapse Channels"
              className="cursor-pointer inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-muted hover:bg-brand-lilac/60 hover:text-brand-purple transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="text-[10px]">Collapse</span>
            </button>
          </div>
        )}

        {/* Channels List */}
        {isSidebarCollapsed ? (
          <div
            className="flex flex-col items-center gap-2"
            role="tablist"
            aria-label="Community channels"
          >
            {/* Channel 1: EaseConnect */}
            <button
              type="button"
              onClick={() => onSelectTab("feed")}
              title="EaseConnect: Discussions & fan forums"
              className={cx(
                "cursor-pointer flex h-10 w-10 items-center justify-center rounded-xl transition-all shadow-xs",
                tab === "feed"
                  ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                  : "bg-brand-lilac/50 text-brand-deep hover:bg-brand-purple hover:text-white",
              )}
            >
              <Users className="h-5 w-5" />
            </button>

            {/* Channel 2: EasePix & EaseXplore */}
            <button
              type="button"
              onClick={() => onSelectTab("views")}
              title="EasePix & EaseXplore: Seat sharing & 360° views"
              className={cx(
                "cursor-pointer flex h-10 w-10 items-center justify-center rounded-xl transition-all shadow-xs",
                tab === "views"
                  ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                  : "bg-brand-lilac/50 text-brand-deep hover:bg-brand-purple hover:text-white",
              )}
            >
              <div className="flex items-center -space-x-1">
                <Camera className="h-3.5 w-3.5 shrink-0" />
                <Rotate3d className="h-3.5 w-3.5 shrink-0" />
              </div>
            </button>

            <div className="my-2 h-px w-8 bg-brand-line" />

            {/* Compact Your Space Icons */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => onShowToast("You have 4 saved posts.")}
                title="Saved posts"
                className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-lilac/50 hover:text-brand-purple transition"
              >
                <Bookmark className="h-4 w-4 text-brand-purple" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onShowToast(
                    "You are part of: Live Music Fans & Festival Crew",
                  )
                }
                title="My groups"
                className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-lilac/50 hover:text-brand-purple transition"
              >
                <Users className="h-4 w-4 text-brand-magenta" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onShowToast("All recent activity is up to date.")
                }
                title="Recent activity"
                className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-lilac/50 hover:text-brand-purple transition"
              >
                <Clock className="h-4 w-4 text-brand-orange" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="space-y-2"
              role="tablist"
              aria-label="Community channels"
            >
              {/* Channel 1: EaseConnect */}
              <button
                type="button"
                onClick={() => onSelectTab("feed")}
                className={cx(
                  "cursor-pointer group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all",
                  tab === "feed"
                    ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                    : "text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple",
                )}
              >
                <div
                  className={cx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                    tab === "feed"
                      ? "bg-white/20 text-white"
                      : "bg-brand-lilac/70 text-brand-purple group-hover:bg-brand-purple group-hover:text-white",
                  )}
                >
                  <Users className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <b className="font-feature text-sm font-black italic tracking-tight leading-tight block">
                    EaseConnect
                  </b>
                  <small
                    className={cx(
                      "block text-[10px] truncate",
                      tab === "feed" ? "text-white/80" : "text-muted",
                    )}
                  >
                    Discussions & fan forums
                  </small>
                </div>
              </button>

              {/* Channel 2: EasePix & EaseXplore */}
              <button
                type="button"
                onClick={() => onSelectTab("views")}
                className={cx(
                  "cursor-pointer flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all border",
                  tab === "views"
                    ? "border-brand-purple/30 bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                    : "border-transparent bg-transparent hover:bg-brand-lilac/40 text-brand-deep",
                )}
              >
                <div className="flex items-center -space-x-1.5 shrink-0">
                  <div
                    title="EasePix: Seat View Photos"
                    className={cx(
                      "flex h-8 w-8 items-center justify-center rounded-xl border-2 transition-colors shadow-xs",
                      tab === "views"
                        ? "border-transparent bg-white/20 text-white"
                        : "border-white bg-brand-lilac text-brand-purple",
                    )}
                  >
                    <Camera className="h-4 w-4" />
                  </div>
                  <div
                    title="EaseXplore: 360° Views"
                    className={cx(
                      "flex h-8 w-8 items-center justify-center rounded-xl border-2 transition-colors shadow-xs",
                      tab === "views"
                        ? "border-transparent bg-white/20 text-white"
                        : "border-white bg-orange-100 text-brand-orange",
                    )}
                  >
                    <Rotate3d className="h-4 w-4" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <b className="font-feature text-sm font-black italic tracking-tight leading-tight block">
                    EasePix & EaseXplore
                  </b>
                  <small
                    className={cx(
                      "block text-[10px] truncate",
                      tab === "views" ? "text-white/80" : "text-muted",
                    )}
                  >
                    Seat sharing & 360° views
                  </small>
                </div>
              </button>
            </div>

            <div className="my-3.5 h-px bg-brand-line" />

            <div className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-wider text-muted">
              Your space
            </div>
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => onShowToast("You have 4 saved posts.")}
                className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
              >
                <Bookmark className="h-4 w-4 text-brand-purple" /> Saved posts
              </button>
              <button
                type="button"
                onClick={() =>
                  onShowToast(
                    "You are part of: Live Music Fans & Festival Crew",
                  )
                }
                className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
              >
                <Users className="h-4 w-4 text-brand-magenta" /> My groups
              </button>
              <button
                type="button"
                onClick={() =>
                  onShowToast("All recent activity is up to date.")
                }
                className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
              >
                <Clock className="h-4 w-4 text-brand-orange" /> Recent activity
              </button>
            </nav>

            <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-lilac/70 via-brand-warm to-brand-lilac/40 p-3.5 border border-brand-purple/15">
              <strong className="block font-brand text-xs font-bold text-brand-deep">
                Make someone’s night ✨
              </strong>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Share a seat view or a useful tip to help another fan feel
                event-ready.
              </p>
              <button
                type="button"
                onClick={() =>
                  onShowToast("Every verified seat view earns +15 EasePoints!")
                }
                className="cursor-pointer mt-2 text-[11px] font-extrabold text-brand-purple hover:underline"
              >
                How it works
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
