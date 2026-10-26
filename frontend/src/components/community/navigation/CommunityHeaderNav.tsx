import { Users, Camera, Rotate3d, Repeat } from "lucide-react"
import { cx } from "../../ui"

export type CommunityTab = "feed" | "views" | "exchange"

export interface CommunityHeaderNavProps {
  activeTab?: CommunityTab
  onSelectTab?: (tab: CommunityTab) => void
  // Legacy compatibility props:
  mainSection?: "comms" | "exchange"
  onSelectComms?: () => void
  onSelectExchange?: () => void
}

export function CommunityHeaderNav({
  activeTab,
  onSelectTab,
  mainSection,
  onSelectComms,
  onSelectExchange,
}: CommunityHeaderNavProps) {
  const currentTab: CommunityTab =
    activeTab ?? (mainSection === "exchange" ? "exchange" : "feed")

  const handleSelect = (tab: CommunityTab) => {
    if (onSelectTab) {
      onSelectTab(tab)
    } else if (tab === "exchange" && onSelectExchange) {
      onSelectExchange()
    } else if (onSelectComms) {
      onSelectComms()
    }
  }

  const items = [
    {
      id: "feed" as const,
      label: "EaseConnect",
      desc: "Discussions, fan forums & live chat",
      icon: (active: boolean) => (
        <div
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            active
              ? "bg-white/20 text-white"
              : "bg-brand-lilac/70 text-brand-purple group-hover:bg-brand-purple group-hover:text-white",
          )}
        >
          <Users className="h-4.5 w-4.5" />
        </div>
      ),
    },
    {
      id: "views" as const,
      label: "EasePix & EaseXplore",
      desc: "Seat sharing & 360° venue views",
      icon: (active: boolean) => (
        <div className="flex items-center -space-x-1.5 shrink-0">
          <div
            title="EasePix: Seat View Photos"
            className={cx(
              "flex h-8 w-8 items-center justify-center rounded-xl border-2 transition-colors shadow-xs",
              active
                ? "border-transparent bg-white/20 text-white"
                : "border-white bg-brand-lilac text-brand-purple group-hover:bg-brand-purple group-hover:text-white",
            )}
          >
            <Camera className="h-4 w-4" />
          </div>
          <div
            title="EaseXplore: 360° Views"
            className={cx(
              "flex h-8 w-8 items-center justify-center rounded-xl border-2 transition-colors shadow-xs",
              active
                ? "border-transparent bg-white/20 text-white"
                : "border-white bg-orange-100 text-brand-orange group-hover:bg-brand-orange group-hover:text-white",
            )}
          >
            <Rotate3d className="h-4 w-4" />
          </div>
        </div>
      ),
    },
    {
      id: "exchange" as const,
      label: "EaseXchange",
      desc: "Face-value ticket swaps",
      icon: (active: boolean) => (
        <div
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            active
              ? "bg-white/20 text-white"
              : "bg-orange-100 text-brand-orange group-hover:bg-brand-orange group-hover:text-white",
          )}
        >
          <Repeat className="h-4.5 w-4.5" />
        </div>
      ),
    },
  ]

  return (
    <nav
      id="main-tabs-nav"
      aria-label="Community Sections"
      className="sticky top-16 z-30 mb-3.5 sm:mb-4 rounded-2xl border border-brand-line bg-white/95 p-1.5 sm:p-2 shadow-sm backdrop-blur-md"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {items.map((item) => {
          const isActive = currentTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              id={`tab-${item.id}`}
              onClick={() => handleSelect(item.id)}
              title={item.desc}
              className={cx(
                "cursor-pointer group relative flex items-center justify-center gap-3 rounded-xl px-4 py-2.5 sm:py-3 transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                  : "bg-brand-warm/60 text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple",
              )}
            >
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                {item.icon(isActive)}
                <span className="font-feature italic font-black text-sm tracking-tight leading-none truncate">
                  {item.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
