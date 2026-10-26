import { Users, Repeat } from "lucide-react"
import { cx } from "../../ui"

interface CommunityHeaderNavProps {
  mainSection: "comms" | "exchange"
  onSelectComms: () => void
  onSelectExchange: () => void
}

export function CommunityHeaderNav({
  mainSection,
  onSelectComms,
  onSelectExchange,
}: CommunityHeaderNavProps) {
  return (
    <nav
      id="main-tabs-nav"
      aria-label="Community Sections"
      className="sticky top-16 z-30 mb-3.5 sm:mb-4 rounded-2xl border border-brand-line bg-white/95 p-2 shadow-sm backdrop-blur-md"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Tab 1: EaseComms */}
        <button
          type="button"
          id="tab-easecomms"
          onClick={onSelectComms}
          className={cx(
            "cursor-pointer group relative flex items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-left transition-all duration-200",
            mainSection === "comms"
              ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
              : "bg-brand-warm/60 text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple",
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                mainSection === "comms"
                  ? "bg-white/20 text-white"
                  : "bg-brand-lilac/70 text-brand-purple group-hover:bg-brand-purple group-hover:text-white",
              )}
            >
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-brand text-base sm:text-lg font-black tracking-tight leading-none">
                  EaseComms
                </span>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                    mainSection === "comms"
                      ? "bg-white/25 text-white"
                      : "bg-brand-lilac text-brand-purple",
                  )}
                >
                  Community
                </span>
              </div>
              <p
                className={cx(
                  "mt-1 text-xs truncate",
                  mainSection === "comms" ? "text-white/85" : "text-muted",
                )}
              >
                Discussions, 360° seat views & venue accessibility
              </p>
            </div>
          </div>
        </button>

        {/* Tab 2: EaseExchange */}
        <button
          type="button"
          id="tab-easeexchange"
          onClick={onSelectExchange}
          className={cx(
            "cursor-pointer group relative flex items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-left transition-all duration-200",
            mainSection === "exchange"
              ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
              : "bg-brand-warm/60 text-brand-deep hover:bg-orange-50/70 hover:text-brand-orange",
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                mainSection === "exchange"
                  ? "bg-white/20 text-white"
                  : "bg-orange-100 text-brand-orange group-hover:bg-brand-orange group-hover:text-white",
              )}
            >
              <Repeat className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-brand text-base sm:text-lg font-black tracking-tight leading-none">
                  EaseExchange
                </span>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                    mainSection === "exchange"
                      ? "bg-white/25 text-white"
                      : "bg-orange-100 text-brand-orange",
                  )}
                >
                  Ticket Swaps
                </span>
              </div>
              <p
                className={cx(
                  "mt-1 text-xs truncate",
                  mainSection === "exchange" ? "text-white/85" : "text-muted",
                )}
              >
                Face-value ticket swaps backed by community verification
              </p>
            </div>
          </div>
        </button>
      </div>
    </nav>
  )
}
