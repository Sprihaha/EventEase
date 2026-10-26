import {
  Rotate3d,
  X,
  Compass,
  Search,
  ExternalLink,
  Video,
  ShieldCheck,
} from "lucide-react"
import { cx } from "../../ui"
import { formatMediaEmbedUrl } from "../../../lib/backendApi"
import { vantagePoints } from "../constants"
import type { Preview360Photo, SearchableOption } from "../types"

interface EaseXplore360ModalProps {
  preview360Photo: Preview360Photo | null
  onClose: () => void
  sectionOptions: SearchableOption[]
  hasAccessibleSeats: boolean
  onUpdatePreview: (
    updater: (prev: Preview360Photo | null) => Preview360Photo | null,
  ) => void
}

export function EaseXplore360Modal({
  preview360Photo,
  onClose,
  sectionOptions,
  hasAccessibleSeats,
  onUpdatePreview,
}: EaseXplore360ModalProps) {
  if (!preview360Photo) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-brand-deep shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-md">
              <Rotate3d className="h-5 w-5 animate-spin" />
            </div>
            <div>
              <h3 className="font-brand text-lg font-bold text-white leading-tight">
                EaseXplore · 360° View
              </h3>
              <p className="text-xs text-white/80 mt-0.5 font-medium">
                {preview360Photo.title}
                {preview360Photo.section
                  ? ` · ${
                      preview360Photo.section
                        .toLowerCase()
                        .startsWith("section")
                        ? preview360Photo.section
                        : `Section ${preview360Photo.section}`
                    }`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Vantage Point Switcher inside 360 Modal */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-white/5 px-6 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-white/70 mr-1">
            <Compass className="h-3.5 w-3.5 text-brand-orange" />
            <span>Vantage:</span>
          </div>
          {sectionOptions.length > 0 ? (
            sectionOptions.map((opt) => {
              const isSelected =
                preview360Photo.section?.toLowerCase() ===
                opt.value.toLowerCase()
              const secLower = opt.value.toLowerCase()
              const matchedVantage =
                secLower.includes("balcony") ||
                secLower.includes("concession") ||
                secLower.includes("upper")
                  ? vantagePoints[2]
                  : secLower.includes("accessible") ||
                      secLower.includes("wheelchair")
                    ? vantagePoints[3]
                    : secLower.includes("vip") ||
                        secLower.includes("floor") ||
                        secLower.includes("cat 1")
                      ? vantagePoints[0]
                      : vantagePoints[1]

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onUpdatePreview((prev) =>
                      prev
                        ? {
                            ...prev,
                            url: matchedVantage.image,
                            section: opt.value,
                            elevation: matchedVantage.elevation,
                            fov: matchedVantage.fov,
                          }
                        : null,
                    )
                  }
                  className={cx(
                    "cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                    isSelected
                      ? "bg-gradient-to-r from-brand-purple to-brand-magenta text-white shadow-sm"
                      : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
                  )}
                >
                  {opt.value.toLowerCase().startsWith("section")
                    ? opt.value
                    : `Section ${opt.value}`}
                </button>
              )
            })
          ) : (
            <span className="text-white/60 text-xs italic">
              Select an event with seating sections to explore vantage points
            </span>
          )}
          {hasAccessibleSeats && (
            <button
              type="button"
              onClick={() =>
                onUpdatePreview((prev) =>
                  prev
                    ? {
                        ...prev,
                        url: vantagePoints[3].image,
                        section: "Accessible Platform",
                        elevation: vantagePoints[3].elevation,
                        fov: vantagePoints[3].fov,
                      }
                    : null,
                )
              }
              className={cx(
                "cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                preview360Photo.section?.toLowerCase().includes("accessible")
                  ? "bg-gradient-to-r from-brand-purple to-brand-magenta text-white shadow-sm"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
              )}
            >
              ♿ Accessible Platform
            </button>
          )}
        </div>

        {/* 360 Media Viewer / Video Player */}
        <div className="relative h-[430px] w-full bg-black overflow-hidden flex items-center justify-center">
          {(() => {
            if (!preview360Photo.externalTourUrl) {
              const venueName = preview360Photo.venueName || "Venue"
              const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${venueName} website`)}`

              return (
                <div className="relative h-full w-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#120824] via-brand-deep to-[#1b092a] text-white">
                  {/* Ambient background glow */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-orange/15 via-brand-purple/10 to-transparent pointer-events-none" />

                  <div className="relative z-10 max-w-md space-y-4">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl text-brand-orange">
                      <Rotate3d className="h-8 w-8 text-brand-orange" />
                    </div>

                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange/15 px-3 py-1 text-[11px] font-extrabold text-brand-orange border border-brand-orange/30 mb-2">
                        EaseXplore · Official Venue View
                      </span>
                      <h4 className="font-brand text-xl font-bold text-white tracking-tight">
                        No views provided by organizer
                      </h4>
                      <p className="mt-2 text-xs text-white/80 leading-relaxed font-medium">
                        Search for the venue&apos;s website instead to view
                        official seating guides, layouts, and facility
                        information.
                      </p>
                    </div>

                    <div className="pt-2">
                      <a
                        href={googleSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-3 text-xs font-bold text-white shadow-lg shadow-brand-orange/30 transition-all hover:opacity-95 hover:shadow-xl hover:scale-105 active:scale-95"
                      >
                        <Search className="h-4 w-4" />
                        <span>Search {venueName} website on Google</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              )
            }

            const media = formatMediaEmbedUrl(preview360Photo.externalTourUrl)

            if (media.isDirectVideo) {
              return (
                <>
                  <video
                    src={media.embedUrl}
                    controls
                    autoPlay
                    loop
                    className="h-full w-full object-contain bg-black"
                  />
                  <div className="absolute top-3 left-3 pointer-events-none">
                    <span className="rounded-full bg-brand-deep/85 px-3 py-1 text-[11px] font-extrabold text-white backdrop-blur border border-white/20 flex items-center gap-1.5 shadow-md">
                      <Video className="h-3.5 w-3.5 text-brand-orange" /> Venue
                      Video Tour Active
                    </span>
                  </div>
                </>
              )
            }

            return (
              <>
                <iframe
                  src={media.embedUrl}
                  title="Interactive 360° Virtual Tour"
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                />
                <div className="absolute top-3 left-3 pointer-events-none">
                  <span className="rounded-full bg-brand-deep/85 px-3 py-1 text-[11px] font-extrabold text-white backdrop-blur border border-white/20 flex items-center gap-1.5 shadow-md">
                    {media.isYoutube ? (
                      <>
                        <Video className="h-3.5 w-3.5 text-brand-orange" />{" "}
                        YouTube Video Tour Active
                      </>
                    ) : media.isVimeo ? (
                      <>
                        <Video className="h-3.5 w-3.5 text-brand-orange" />{" "}
                        Vimeo Video Tour Active
                      </>
                    ) : (
                      <>
                        <Rotate3d className="h-3.5 w-3.5 text-brand-orange animate-spin" />{" "}
                        Interactive 360° Virtual Tour Active
                      </>
                    )}
                  </span>
                </div>
              </>
            )
          })()}
        </div>

        {/* Rights Reserved Notice & External Website Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-black/50 px-5 py-3.5 text-xs text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-orange shrink-0" />
            <span className="text-[11px] text-white/90 font-medium">
              {preview360Photo.externalTourUrl
                ? preview360Photo.venueName
                  ? `View 360° view · All rights reserved by ${preview360Photo.venueName}`
                  : "View 360° view · All rights reserved by venue"
                : `No views provided by organizer · Search ${preview360Photo.venueName || "venue"} website`}
            </span>
          </div>

          {preview360Photo.externalTourUrl
            ? (() => {
                const media = formatMediaEmbedUrl(
                  preview360Photo.externalTourUrl,
                )
                return (
                  <a
                    href={preview360Photo.externalTourUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                  >
                    {media.isYoutube || media.isVimeo || media.isDirectVideo ? (
                      <Video className="h-4 w-4" />
                    ) : (
                      <Rotate3d className="h-4 w-4" />
                    )}
                    <span>
                      {media.isYoutube
                        ? "Watch on YouTube"
                        : media.isVimeo
                          ? "Watch on Vimeo"
                          : "View 360° Tour on Website"}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )
              })()
            : (() => {
                const venueName = preview360Photo.venueName || "Venue"
                const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${venueName} website`)}`
                return (
                  <a
                    href={googleSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                  >
                    <Search className="h-4 w-4" />
                    <span>Search {venueName} website</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )
              })()}
        </div>
      </div>
    </div>
  )
}
