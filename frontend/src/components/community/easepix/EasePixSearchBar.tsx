import { useNavigate } from "react-router"
import { Camera, Sparkles, Search } from "lucide-react"
import { SearchableCombobox } from "../common/SearchableCombobox"
import type { SearchableOption, EventItem, User } from "../types"

interface EasePixSearchBarProps {
  user: User | null
  events: EventItem[]
  seatEventIdInput: string
  onSeatEventIdInputChange: (id: string) => void
  seatSectionInput: string
  onSeatSectionInputChange: (sec: string) => void
  seatRowInput: string
  onSeatRowInputChange: (row: string) => void
  sectionOptions: SearchableOption[]
  rowSeatOptions: SearchableOption[]
  loadingSeats: boolean
  onFindSeatViews: () => void
  onOpenUploadModal: () => void
}

export function EasePixSearchBar({
  user,
  events,
  seatEventIdInput,
  onSeatEventIdInputChange,
  seatSectionInput,
  onSeatSectionInputChange,
  seatRowInput,
  onSeatRowInputChange,
  sectionOptions,
  rowSeatOptions,
  loadingSeats,
  onFindSeatViews,
  onOpenUploadModal,
}: EasePixSearchBarProps) {
  const navigate = useNavigate()

  return (
    <div className="rounded-3xl border-2 border-brand-purple/20 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-brand-line">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-orange text-white shadow-sm">
            <Camera className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-brand text-sm font-bold text-brand-deep">
              Share Your Seat View
            </h3>
            <p className="text-[11px] text-muted">
              Help other fans see real sightlines from your section before
              booking
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2.5 py-1 text-[11px] font-black text-brand-orange">
          <Sparkles className="h-3 w-3" /> +15 EasePoints
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-3">
          <SearchableCombobox
            label="Event"
            placeholder="Search event..."
            value={seatEventIdInput}
            onChange={onSeatEventIdInputChange}
            options={events.map((ev) => ({
              value: ev.id,
              label: ev.title,
              sublabel: [ev.venue, ev.category].filter(Boolean).join(" · "),
            }))}
            allowCustom={false}
          />

          <SearchableCombobox
            label="Section"
            placeholder={
              !seatEventIdInput
                ? "Select an event first..."
                : loadingSeats
                  ? "Loading sections..."
                  : "Search or select section..."
            }
            value={seatSectionInput}
            onChange={onSeatSectionInputChange}
            options={sectionOptions}
            disabled={!seatEventIdInput}
            allowCustom={true}
          />

          <SearchableCombobox
            label="Row & Seat"
            placeholder={
              !seatEventIdInput
                ? "Select an event first..."
                : seatSectionInput
                  ? `Search row or seat in ${seatSectionInput}...`
                  : "Search or select row & seat..."
            }
            value={seatRowInput}
            onChange={onSeatRowInputChange}
            options={rowSeatOptions}
            disabled={!seatEventIdInput}
            allowCustom={true}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          {/* Search Button (Purple Gradient) */}
          <button
            type="button"
            onClick={onFindSeatViews}
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-magenta px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-purple/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
          >
            <Search className="h-4 w-4" /> Find Seat Views
          </button>

          {/* Upload EasePix Button or Sign-in Prompt */}
          {!user ? (
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, left: 0, behavior: "instant" })
                navigate("/login", {
                  state: { returnTo: "/community?tab=views" },
                })
              }}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
            >
              <Camera className="h-4 w-4" /> Don&apos;t gatekeep the view, show
              us what we&apos;re missing!
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenUploadModal}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
            >
              <Camera className="h-4 w-4" /> Upload EasePix
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
