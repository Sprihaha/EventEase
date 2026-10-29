import { useNavigate } from "react-router"
import {
  MapPin,
  Sparkles,
  Eye,
  Camera,
  Layers,
  Rotate3d,
  CheckCircle2,
  Heart,
} from "lucide-react"
import { cx } from "../../ui"
import {
  parseSeatKey,
  isSeatMatch,
  matchesSectionQuery,
} from "./seatMatching"
import type { SectionSegment, SectionSeatPhoto, User } from "../types"

interface EasePixSectionGridProps {
  sectionsToDisplay: SectionSegment[]
  orderedSections: SectionSegment[]
  selectedGallerySection: string
  onSelectGallerySection: (sec: string) => void
  totalPhotos: number
  eventTitle: string
  searchedSectionQuery: string
  searchedRow: string
  user: User | null
  onLikeEasePix: (pixId: string) => void
  onOpenUploadModal: (sectionName?: string) => void
  onOpenEaseExplore: (sectionName?: string) => void
}

export function EasePixSectionGrid({
  sectionsToDisplay,
  orderedSections,
  selectedGallerySection,
  onSelectGallerySection,
  totalPhotos,
  eventTitle,
  searchedSectionQuery,
  searchedRow,
  user,
  onLikeEasePix,
  onOpenUploadModal,
  onOpenEaseExplore,
}: EasePixSectionGridProps) {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      {/* Section Selection Bar */}
      <div className="rounded-2xl border border-brand-line bg-white p-3.5 sm:p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-brand-line/60">
          <div>
            <span className="text-xs font-bold text-brand-deep">
              Sections for{" "}
              <span className="text-brand-purple">{eventTitle}</span>
            </span>
            <span className="ml-2 text-[11px] text-muted hidden sm:inline">
              Click a section to filter or view all sections segmented
            </span>
          </div>
          <span className="text-[11px] font-semibold text-muted">
            {selectedGallerySection === "all"
              ? "Auto-segmented by section"
              : `Viewing ${selectedGallerySection} (${sectionsToDisplay[0]?.photos.length ?? 0} views)`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => onSelectGallerySection("all")}
            className={cx(
              "cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all",
              selectedGallerySection === "all"
                ? "bg-gradient-to-r from-brand-purple to-brand-magenta text-white shadow-md shadow-brand-purple/20"
                : "bg-brand-warm/60 border border-brand-line text-brand-deep hover:bg-brand-lilac/40 hover:text-brand-purple",
            )}
          >
            All Sections
            <span
              className={cx(
                "rounded-full px-1.5 py-0.2 text-[10px]",
                selectedGallerySection === "all"
                  ? "bg-white/25 text-white"
                  : "bg-white text-muted",
              )}
            >
              {totalPhotos}
            </span>
          </button>

          {orderedSections.map((sec) => {
            const isSelected =
              selectedGallerySection.toLowerCase() === sec.name.toLowerCase()
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelectGallerySection(sec.name)}
                className={cx(
                  "cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all",
                  isSelected
                    ? "bg-gradient-to-r from-brand-orange to-brand-amber text-white shadow-md shadow-brand-orange/25"
                    : "bg-white border border-brand-line text-brand-deep hover:bg-orange-50 hover:text-brand-orange hover:border-brand-orange/30",
                )}
              >
                {sec.name}
                <span
                  className={cx(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    isSelected
                      ? "bg-white/25 text-white"
                      : "bg-brand-warm text-muted",
                  )}
                >
                  {sec.photos.length}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Segmented Section Cards Grid */}
      <div className="space-y-6">
        {sectionsToDisplay.map((sec) => {
          const isTargetSection = Boolean(
            searchedSectionQuery &&
              matchesSectionQuery(sec.name, searchedSectionQuery),
          )

          const canMatchSeat = !searchedSectionQuery || isTargetSection

          const hasExactSeatMatch = Boolean(
            canMatchSeat &&
              searchedRow &&
              sec.photos.some((p) => isSeatMatch(searchedRow, p.seat)),
          )

          const isSectionWithNoSeatMatch = Boolean(
            isTargetSection &&
              searchedRow &&
              sec.photos.length > 0 &&
              !hasExactSeatMatch,
          )

          let nextRowBeforePhoto: SectionSeatPhoto | null = null
          let nextRowAfterPhoto: SectionSeatPhoto | null = null

          if (isSectionWithNoSeatMatch) {
            const targetKey = parseSeatKey(searchedRow)
            let maxBefore = -Infinity
            let minAfter = Infinity

            sec.photos.forEach((p) => {
              const pKey = parseSeatKey(p.seat)
              if (
                targetKey.type !== "unknown" &&
                pKey.type === targetKey.type
              ) {
                const diff = pKey.val - targetKey.val
                if (diff < 0 && diff > maxBefore) {
                  maxBefore = diff
                  nextRowBeforePhoto = p
                } else if (diff > 0 && diff < minAfter) {
                  minAfter = diff
                  nextRowAfterPhoto = p
                }
              }
            })

            if (
              !nextRowBeforePhoto &&
              !nextRowAfterPhoto &&
              sec.photos.length > 0
            ) {
              nextRowAfterPhoto = sec.photos[0]
            }
          }

          return (
            <div
              key={sec.id}
              className="rounded-3xl border border-brand-line bg-white/90 p-4.5 sm:p-5 shadow-xs transition hover:shadow-sm"
            >
              {/* Section Segment Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-line pb-3.5 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-lilac text-brand-purple shadow-xs">
                    <MapPin className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-brand text-base font-extrabold text-brand-deep">
                        {sec.name}
                      </h4>
                      <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-brand-orange">
                        {sec.rowRange}
                      </span>
                      {hasExactSeatMatch && (
                        <span className="rounded-full bg-gradient-to-r from-brand-orange to-brand-amber text-white px-2.5 py-0.5 text-[10px] font-extrabold shadow-xs flex items-center gap-1 animate-pulse">
                          <Sparkles className="h-3 w-3" /> Exact Seat Match
                          Shown First
                        </span>
                      )}
                      {isSectionWithNoSeatMatch && (
                        <span className="rounded-full bg-amber-100 border border-amber-300 text-amber-800 px-2.5 py-0.5 text-[10px] font-bold flex items-center gap-1">
                          <Eye className="h-3 w-3" /> Showing Closest Seat Angle
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{sec.tier}</p>
                  </div>
                </div>
              </div>

              {/* Case 2: No pics found for the entire section */}
              {sec.photos.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-line bg-brand-warm/30 py-10 px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-lilac/70 text-brand-purple shadow-sm mb-3">
                    <Camera className="h-6 w-6 text-brand-purple" />
                  </div>
                  <h5 className="font-brand text-sm font-bold text-brand-deep">
                    No EasePix found for this section ({sec.name})
                  </h5>
                  <p className="mt-1 text-xs text-muted max-w-md">
                    No fan sightline photos have been shared for {sec.name} yet.
                    Please look at other sections to explore views, or inspect
                    the interactive 360° venue vantage in EaseXplore!
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onSelectGallerySection("all")}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-brand-line bg-white px-3.5 py-2 text-xs font-bold text-brand-deep hover:bg-brand-lilac/30 hover:text-brand-purple transition shadow-xs"
                    >
                      <Layers className="h-3.5 w-3.5" /> Look at other sections
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenEaseExplore(sec.name)}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:opacity-95"
                    >
                      <Rotate3d className="h-3.5 w-3.5" /> Open EaseXplore
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Case 1: No pics found for that row/seat in this section */}
                  {isSectionWithNoSeatMatch && (
                    <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50/40 to-amber-50 p-4 text-brand-deep shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-xs">
                          <Eye className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-brand text-xs font-bold text-amber-950">
                              No EasePix found for &ldquo;{searchedRow}&rdquo;
                              in {sec.name}
                            </h5>
                            <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">
                              Closest Seat Angle
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-amber-900/80">
                            No fan photos have been shared for that exact row or
                            seat yet. Showing the closest seat pictures in{" "}
                            {sec.name} to preview your sightline angle.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!user) {
                            window.scrollTo({
                              top: 0,
                              left: 0,
                              behavior: "instant",
                            })
                            navigate("/login", {
                              state: { returnTo: "/community?tab=views" },
                            })
                          } else {
                            onOpenUploadModal(sec.name)
                          }
                        }}
                        className="cursor-pointer shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100/60 transition shadow-xs"
                      >
                        <Camera className="h-3.5 w-3.5" /> Upload EasePix
                      </button>
                    </div>
                  )}

                  {/* Photos Grid for this section */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sec.photos.map((p, pIdx) => {
                      const isExactSeatMatch = Boolean(
                        canMatchSeat &&
                          searchedRow &&
                          isSeatMatch(searchedRow, p.seat),
                      )
                      const isNextBefore = Boolean(
                        isSectionWithNoSeatMatch && nextRowBeforePhoto === p,
                      )
                      const isNextAfter = Boolean(
                        isSectionWithNoSeatMatch && nextRowAfterPhoto === p,
                      )
                      const isClosestSeat = isNextBefore || isNextAfter

                      return (
                        <div
                          key={pIdx}
                          className={cx(
                            "group relative overflow-hidden rounded-2xl transition-all duration-300",
                            isExactSeatMatch
                              ? "ring-4 ring-brand-orange ring-offset-2 ring-offset-white shadow-xl shadow-brand-orange/35 scale-[1.01] bg-gradient-to-b from-brand-orange/15 via-white to-white"
                              : isClosestSeat
                                ? "ring-3 ring-amber-400 ring-offset-2 ring-offset-white shadow-lg shadow-amber-500/20 scale-[1.005] bg-gradient-to-b from-amber-50/50 to-white"
                                : "border border-brand-line bg-white shadow-xs hover:shadow-md",
                          )}
                        >
                          {/* High-visibility Match Badge */}
                          {isExactSeatMatch && (
                            <div className="absolute top-2.5 right-2.5 z-20">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-orange via-amber-500 to-brand-orange px-3 py-1 text-[11px] font-black text-white shadow-lg shadow-brand-orange/40 animate-pulse tracking-wide uppercase">
                                <Sparkles className="h-3.5 w-3.5" /> Searched
                                Seat Match
                              </span>
                            </div>
                          )}

                          {isClosestSeat && (
                            <div className="absolute top-2.5 right-2.5 z-20">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md shadow-amber-500/30 tracking-wide uppercase">
                                <Sparkles className="h-3 w-3" /> Closest Seat
                                Angle
                              </span>
                            </div>
                          )}

                          <div className="relative h-56 w-full overflow-hidden bg-brand-deep">
                            <img
                              src={p.photo}
                              alt={p.seat}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/95 via-brand-deep/35 to-transparent p-4 flex flex-col justify-between">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="rounded-full bg-brand-deep/85 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                                    {p.authorName}
                                  </span>
                                  {p.isVerified ? (
                                    <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-extrabold text-white backdrop-blur flex items-center gap-1 shadow-xs">
                                      <CheckCircle2 className="h-2.5 w-2.5" />{" "}
                                      Verified Attendee
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white/90 backdrop-blur">
                                      Community Attendee
                                    </span>
                                  )}
                                </div>
                                {p.pixId && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onLikeEasePix(p.pixId!)
                                    }}
                                    className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-brand-deep/80 hover:bg-brand-deep px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur transition"
                                  >
                                    <Heart className="h-3 w-3 text-pink-400 fill-pink-400" />
                                    <span>{p.likesCount ?? 0}</span>
                                  </button>
                                )}
                              </div>

                              <div className="text-white space-y-1.5">
                                <div
                                  className={cx(
                                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black text-white shadow-sm",
                                    isExactSeatMatch
                                      ? "bg-gradient-to-r from-brand-orange to-brand-amber ring-2 ring-white/70 shadow-md"
                                      : isClosestSeat
                                        ? "bg-amber-600/90 ring-1 ring-white/50"
                                        : "bg-brand-orange",
                                  )}
                                >
                                  <MapPin className="h-3.5 w-3.5" /> {p.seat}
                                  {isExactSeatMatch && (
                                    <span className="text-[10px] uppercase font-bold text-white/90">
                                      (Matched Seat)
                                    </span>
                                  )}
                                  {isClosestSeat && (
                                    <span className="text-[10px] uppercase font-bold text-white/90">
                                      (Closest Seat Angle)
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-white/90 line-clamp-2">
                                  {p.vibe}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
