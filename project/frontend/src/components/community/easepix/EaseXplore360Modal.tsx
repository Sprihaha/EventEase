import { useEffect, useState, useMemo, useRef } from "react"
import { useNavigate } from "react-router"
import {
  Rotate3d,
  X,
  Search,
  ExternalLink,
  Video,
  ShieldCheck,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { cx } from "../../ui"
import { formatMediaEmbedUrl, backendListVenues, type Venue } from "../../../lib/backendApi"
import { isVenueMatch } from "./seatMatching"
import { useStore } from "../../../lib/store"
import type { Preview360Photo, SearchableOption, User } from "../types"

interface EaseXplore360ModalProps {
  preview360Photo: Preview360Photo | null
  onClose: () => void
  sectionOptions: SearchableOption[]
  hasAccessibleSeats: boolean
  onUpdatePreview: (
    updater: (prev: Preview360Photo | null) => Preview360Photo | null,
  ) => void
  user?: User | null
}

export function EaseXplore360Modal({
  preview360Photo,
  onClose,
  sectionOptions,
  hasAccessibleSeats,
  onUpdatePreview,
  user,
}: EaseXplore360ModalProps) {
  const navigate = useNavigate()
  const { user: storeUser } = useStore()
  const currentUser = user ?? storeUser

  const [ownedVenues, setOwnedVenues] = useState<Venue[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      try {
        if (modalRef.current && document.fullscreenEnabled && !document.fullscreenElement) {
          await modalRef.current.requestFullscreen?.()
        }
      } catch {
        // Fallback gracefully to CSS fullscreen
      }
      setIsFullscreen(true)
    } else {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen?.()
        }
      } catch {
        // ignore
      }
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {})
          }
          setIsFullscreen(false)
        } else {
          onClose()
        }
      } else if (e.key === "f" || e.key === "F") {
        const target = e.target as HTMLElement | null
        if (target && !["INPUT", "TEXTAREA"].includes(target.tagName)) {
          e.preventDefault()
          toggleFullscreen()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isFullscreen, onClose])

  useEffect(() => {
    if (currentUser?.role === "organizer") {
      backendListVenues()
        .then(setOwnedVenues)
        .catch(() => setOwnedVenues([]))
    } else {
      setOwnedVenues([])
    }
  }, [currentUser?.role])

  const matchedOwnedVenue = useMemo(() => {
    if (!currentUser || currentUser.role !== "organizer" || !preview360Photo) return null
    const targetVenueName = (preview360Photo.venueName || preview360Photo.title || "").trim()
    return (
      ownedVenues.find(
        (v) =>
          (preview360Photo.venueId && v.id === preview360Photo.venueId) ||
          isVenueMatch(v.name, targetVenueName),
      ) ?? null
    )
  }, [currentUser, ownedVenues, preview360Photo])

  const isOwner = Boolean(matchedOwnedVenue)

  const handleConfigureEaseXplore = () => {
    if (!matchedOwnedVenue) return
    onClose()
    navigate(
      `/dashboard/organizer?tab=venue-setup&venueId=${encodeURIComponent(
        matchedOwnedVenue.id,
      )}&venue=${encodeURIComponent(matchedOwnedVenue.name)}`,
    )
  }

  if (!preview360Photo) return null

  return (
    <div
      className={cx(
        "fixed inset-0 z-50 flex items-center justify-center transition-all duration-200",
        isFullscreen ? "bg-black p-0" : "bg-brand-deep/80 p-3 sm:p-4 backdrop-blur-md"
      )}
      onClick={isFullscreen ? undefined : onClose}
    >
      <div
        ref={modalRef}
        className={cx(
          "relative overflow-hidden bg-brand-deep shadow-2xl flex flex-col transition-all duration-200",
          isFullscreen
            ? "w-screen h-screen max-w-none rounded-none border-0"
            : "w-full max-w-4xl rounded-3xl border border-white/20"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 sm:px-6 py-3.5 text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-md">
              <Rotate3d className="h-5 w-5 animate-spin" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-brand text-base sm:text-lg font-bold text-white leading-tight truncate">
                  EaseXplore · 360° View
                </h3>
                {isFullscreen && (
                  <span className="hidden sm:inline-flex rounded-full bg-brand-orange/20 px-2 py-0.5 text-[10px] font-extrabold text-brand-orange border border-brand-orange/30">
                    Full Screen Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80 mt-0.5 font-medium truncate">
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
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="cursor-pointer rounded-xl px-2.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold border border-white/10 hover:border-white/20"
              title={isFullscreen ? "Exit full screen (Esc or F)" : "Expand to full screen (F)"}
              aria-label={isFullscreen ? "Exit full screen" : "Expand to full screen"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-4 w-4 text-brand-orange" />
                  <span className="hidden sm:inline">Exit Full Screen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4 text-brand-orange" />
                  <span className="hidden sm:inline">Full Screen</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition border border-white/10 hover:border-white/20"
              title="Close EaseXplore"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 360 Media Viewer / Video Player */}
        <div
          className={cx(
            "relative w-full bg-black overflow-hidden flex items-center justify-center",
            isFullscreen ? "flex-1 min-h-0 h-full" : "h-[450px]"
          )}
        >
          {/* Overlay fullscreen toggle inside viewer */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="cursor-pointer rounded-full bg-brand-deep/85 px-3 py-1.5 text-xs font-bold text-white backdrop-blur border border-white/20 flex items-center gap-1.5 shadow-md hover:bg-brand-deep hover:border-white/40 transition active:scale-95"
              title={isFullscreen ? "Exit full screen (Esc or F)" : "Expand to full screen (F)"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5 text-brand-orange" />
                  <span>Exit Full Screen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5 text-brand-orange" />
                  <span>Full Screen</span>
                </>
              )}
            </button>
          </div>
          {(() => {
            if (!preview360Photo.externalTourUrl) {
              const venueName = preview360Photo.venueName || "Venue"

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
                        {isOwner
                          ? "No views provided yet"
                          : "No views provided by organizer"}
                      </h4>
                      <p className="mt-2 text-xs text-white/80 leading-relaxed font-medium">
                        {isOwner
                          ? `As the organiser of ${venueName}, you can configure an interactive 360° virtual tour or video walkthrough in Venue Setup.`
                          : "Search for the venue's website instead to view official seating guides, layouts, and facility information."}
                      </p>
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

        {/* Rights Reserved Notice & External Website / Configure Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-black/50 px-5 py-3 text-xs text-white shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-orange shrink-0" />
            <span className="text-[11px] text-white/90 font-medium">
              {preview360Photo.externalTourUrl
                ? preview360Photo.venueName
                  ? `View 360° view · All rights reserved by ${preview360Photo.venueName}`
                  : "View 360° view · All rights reserved by venue"
                : isOwner
                  ? `No EaseXplore view configured yet · Manage in Venue Setup`
                  : `No views provided by organizer · Search ${preview360Photo.venueName || "venue"} website`}
            </span>
          </div>

          {preview360Photo.externalTourUrl
            ? (() => {
                const media = formatMediaEmbedUrl(
                  preview360Photo.externalTourUrl,
                )
                return (
                  <div className="flex items-center gap-2">
                    {isOwner && (
                      <button
                        type="button"
                        onClick={handleConfigureEaseXplore}
                        className="cursor-pointer shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-3 py-2 text-xs font-bold text-white transition-all active:scale-95 border border-white/20"
                      >
                        <Rotate3d className="h-3.5 w-3.5 text-brand-orange" />
                        <span>Configure EaseXplore</span>
                      </button>
                    )}
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
                  </div>
                )
              })()
            : (() => {
                const venueName = preview360Photo.venueName || "Venue"
                const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${venueName} website`)}`
                return isOwner ? (
                  <button
                    type="button"
                    onClick={handleConfigureEaseXplore}
                    className="cursor-pointer shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                  >
                    <Rotate3d className="h-4 w-4" />
                    <span>Configure EaseXplore</span>
                  </button>
                ) : (
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
