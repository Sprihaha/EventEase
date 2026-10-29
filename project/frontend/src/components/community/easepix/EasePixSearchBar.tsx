import { useNavigate } from "react-router"
import { Camera, Sparkles, Search, X } from "lucide-react"
import { SearchableCombobox } from "../../ui"
import type { SearchableOption, EventItem, User } from "../types"

interface EasePixSearchBarProps {
  user: User | null
  events: EventItem[]
  seatVenueInput?: string
  onSeatVenueInputChange?: (venue: string) => void
  venueOptions?: SearchableOption[]
  seatEventIdInput: string
  onSeatEventIdInputChange: (id: string) => void
  eventOptions?: SearchableOption[]
  seatSectionInput: string
  onSeatSectionInputChange: (sec: string) => void
  seatRowInput: string
  onSeatRowInputChange: (row: string) => void
  sectionOptions: SearchableOption[]
  rowSeatOptions: SearchableOption[]
  loadingSeats: boolean
  onFindSeatViews: () => void
  onClearSearchFilter?: () => void
  onOpenUploadModal: () => void
}

export function EasePixSearchBar({
  user,
  events,
  seatVenueInput,
  onSeatVenueInputChange,
  venueOptions,
  seatEventIdInput,
  onSeatEventIdInputChange,
  eventOptions,
  seatSectionInput,
  onSeatSectionInputChange,
  seatRowInput,
  onSeatRowInputChange,
  sectionOptions,
  rowSeatOptions,
  loadingSeats,
  onFindSeatViews,
  onClearSearchFilter,
  onOpenUploadModal,
}: EasePixSearchBarProps) {
  const navigate = useNavigate()
  const hasAnyFilter = Boolean(
    seatVenueInput ||
      seatEventIdInput ||
      seatSectionInput ||
      seatRowInput,
  )

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchableCombobox
            label="Venue"
            placeholder="Search venue..."
            value={seatVenueInput ?? ""}
            onChange={(val) => {
              if (onSeatVenueInputChange) {
                onSeatVenueInputChange(val)
              } else {
                const ev = events.find(
                  (e) => e.venue.toLowerCase() === val.toLowerCase(),
                )
                onSeatEventIdInputChange(ev?.id ?? "")
              }
            }}
            options={
              venueOptions ??
              Array.from(
                new Set(events.map((e) => e.venue).filter(Boolean)),
              ).map((v) => ({
                value: v,
                label: v,
              }))
            }
            allowCustom={false}
          />

          <SearchableCombobox
            label="Event (Optional)"
            placeholder={
              seatVenueInput
                ? "All events (optional)..."
                : "Search event (optional)..."
            }
            value={seatEventIdInput}
            onChange={onSeatEventIdInputChange}
            options={
              eventOptions ??
              (seatVenueInput
                ? events.filter(
                    (e) =>
                      e.venue.toLowerCase() === seatVenueInput.toLowerCase(),
                  )
                : events
              ).map((ev) => ({
                value: ev.id,
                label: ev.title,
              }))
            }
            clearable={true}
            allowCustom={false}
          />

          <SearchableCombobox
            label="Section"
            placeholder={
              !seatVenueInput && !seatEventIdInput
                ? "Select a venue first..."
                : loadingSeats
                  ? "Loading sections..."
                  : "Search or select section..."
            }
            value={seatSectionInput}
            onChange={onSeatSectionInputChange}
            options={sectionOptions}
            disabled={!seatVenueInput && !seatEventIdInput}
            allowCustom={true}
          />

          <SearchableCombobox
            label="Row & Seat"
            placeholder={
              !seatVenueInput && !seatEventIdInput
                ? "Select a venue first..."
                : seatSectionInput
                  ? `Search row or seat in ${seatSectionInput}...`
                  : "Search or select row & seat..."
            }
            value={seatRowInput}
            onChange={onSeatRowInputChange}
            options={rowSeatOptions}
            disabled={!seatVenueInput && !seatEventIdInput}
            allowCustom={true}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          {/* Clear Filter Button - Appears as soon as any dropdown option is selected */}
          {hasAnyFilter && onClearSearchFilter && (
            <button
              type="button"
              onClick={onClearSearchFilter}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-brand-purple/20 bg-white px-4 py-2.5 text-xs font-bold text-muted hover:border-brand-purple hover:bg-brand-lilac/30 hover:text-brand-purple transition-all active:scale-95 shadow-2xs"
            >
              <X className="h-3.5 w-3.5" /> Clear search filter
            </button>
          )}

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
