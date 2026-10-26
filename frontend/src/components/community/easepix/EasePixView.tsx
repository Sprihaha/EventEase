import { X, Rotate3d, Camera } from "lucide-react"
import { EasePixSearchBar } from "./EasePixSearchBar"
import { EasePixSectionGrid } from "./EasePixSectionGrid"
import type { SearchableOption, SectionSegment, EventItem, User } from "../types"

interface EasePixViewProps {
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
  hasSearched: boolean
  gallerySearchFilter: { eventId?: string; section?: string; row?: string } | null;
  selectedGallerySection: string
  onSelectGallerySection: (sec: string) => void
  sectionsToDisplay: SectionSegment[]
  orderedSections: SectionSegment[]
  totalPhotos: number
  onFindSeatViews: () => void
  onClearSearchFilter: () => void
  onOpenUploadModal: (sectionName?: string) => void
  onOpenEaseExplore: (sectionName?: string) => void
  onLikeEasePix: (pixId: string) => void
}

export function EasePixView({
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
  hasSearched,
  gallerySearchFilter,
  selectedGallerySection,
  onSelectGallerySection,
  sectionsToDisplay,
  orderedSections,
  totalPhotos,
  onFindSeatViews,
  onClearSearchFilter,
  onOpenUploadModal,
  onOpenEaseExplore,
  onLikeEasePix,
}: EasePixViewProps) {
  const currentEvent = events.find(
    (e) =>
      e.id ===
      (gallerySearchFilter?.eventId || seatEventIdInput || events[0]?.id),
  )
  const eventTitle = currentEvent?.title ?? "Selected Event"
  const venueTitle = currentEvent?.venue || "Event Venue"

  return (
    <div className="space-y-6">
      {/* Share Your Seat View / Search Bar */}
      <EasePixSearchBar
        user={user}
        events={events}
        seatEventIdInput={seatEventIdInput}
        onSeatEventIdInputChange={onSeatEventIdInputChange}
        seatSectionInput={seatSectionInput}
        onSeatSectionInputChange={onSeatSectionInputChange}
        seatRowInput={seatRowInput}
        onSeatRowInputChange={onSeatRowInputChange}
        sectionOptions={sectionOptions}
        rowSeatOptions={rowSeatOptions}
        loadingSeats={loadingSeats}
        onFindSeatViews={onFindSeatViews}
        onOpenUploadModal={() => onOpenUploadModal()}
      />

      {/* Results Section - Only appears after searching */}
      {hasSearched && (
        <div className="space-y-6 pt-2">
          {/* Gallery Header - Renamed to Results */}
          <div
            id="seat-search-results"
            className="scroll-mt-24 flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <h3 className="font-brand text-base font-bold text-brand-deep">
                Results
              </h3>
              <p className="text-xs text-muted">
                {gallerySearchFilter?.eventId
                  ? `Showing seat views for ${eventTitle}${
                      selectedGallerySection !== "all"
                        ? ` · ${selectedGallerySection}`
                        : gallerySearchFilter.section
                          ? ` · ${gallerySearchFilter.section}`
                          : ""
                    }`
                  : "Real, unedited photos shared by fans who sat there"}
              </p>
            </div>
            {gallerySearchFilter && (
              <button
                type="button"
                onClick={onClearSearchFilter}
                className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold text-brand-purple hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Clear search filter
              </button>
            )}
          </div>

          {/* EaseExplore Venue Banner ("EaseExplore line") */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl border border-brand-purple/20 bg-gradient-to-r from-brand-deep via-[#311c59] to-brand-deep p-4.5 text-white shadow-lg">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-brand-orange shadow-inner border border-white/15">
                <Rotate3d className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-brand text-base font-bold text-white">
                    {venueTitle}
                  </span>
                  <span className="rounded-full bg-brand-orange/20 px-2 py-0.5 text-[10px] font-extrabold text-brand-orange border border-brand-orange/30">
                    360° Panoramic
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-white/80">
                  View interactive 360° sightlines, step-free access, and
                  vantage point elevations for this venue.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenEaseExplore()}
              className="cursor-pointer shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
            >
              <Rotate3d className="h-4 w-4" /> Open EaseXplore
            </button>
          </div>

          {/* Section Segmentation & Options Selector */}
          {!seatEventIdInput && !gallerySearchFilter?.eventId ? (
            <div className="rounded-3xl border border-dashed border-brand-purple/25 bg-brand-warm/30 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-lilac text-brand-purple shadow-sm mb-3">
                <Camera className="h-6 w-6" />
              </div>
              <h4 className="font-brand text-base font-bold text-brand-deep">
                Select an event above
              </h4>
              <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
                Choose an event from the search bar to inspect actual verified
                fan seat views, camera angles, and 360° sightlines for its real
                sections.
              </p>
            </div>
          ) : (
            <EasePixSectionGrid
              sectionsToDisplay={sectionsToDisplay}
              orderedSections={orderedSections}
              selectedGallerySection={selectedGallerySection}
              onSelectGallerySection={onSelectGallerySection}
              totalPhotos={totalPhotos}
              eventTitle={eventTitle}
              searchedSectionQuery={(
                gallerySearchFilter?.section ||
                seatSectionInput ||
                ""
              )
                .trim()
                .toLowerCase()}
              searchedRow={(
                gallerySearchFilter?.row ||
                seatRowInput ||
                ""
              ).trim()}
              user={user}
              onLikeEasePix={onLikeEasePix}
              onOpenUploadModal={onOpenUploadModal}
              onOpenEaseExplore={onOpenEaseExplore}
            />
          )}
        </div>
      )}
    </div>
  )
}
