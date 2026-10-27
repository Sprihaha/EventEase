import { useState, useRef } from "react"
import {
  Camera,
  Sparkles,
  X,
  Upload,
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react"
import { cx } from "../../ui"
import { processAndCompressImage } from "../utils/imageOptimization"
import type { SearchableOption, EventItem, User } from "../types"

interface ShareSeatViewModalProps {
  isOpen: boolean
  onClose: () => void
  user: User | null
  events: EventItem[]
  seatVenueInput: string
  onSeatVenueInputChange: (venue: string) => void
  venueOptions?: SearchableOption[]
  seatEventIdInput: string
  onSeatEventIdInputChange: (id: string) => void
  seatSectionInput: string
  onSeatSectionInputChange: (sec: string) => void
  seatRowInput: string
  onSeatRowInputChange: (row: string) => void
  seatPhotoInput: string
  onSeatPhotoInputChange: (photo: string) => void
  sectionOptions: SearchableOption[]
  rowSeatOptions: SearchableOption[]
  shareModalOrigin: "easepix" | "composer"
  selectedEventId: string
  onSelectedEventIdChange: (id: string) => void
  onSubmitUpload: () => Promise<void>
  onShowToast: (msg: string) => void
}

export function ShareSeatViewModal({
  isOpen,
  onClose,
  events,
  seatVenueInput,
  onSeatVenueInputChange,
  venueOptions,
  seatEventIdInput,
  onSeatEventIdInputChange,
  seatSectionInput,
  onSeatSectionInputChange,
  seatRowInput,
  onSeatRowInputChange,
  seatPhotoInput,
  onSeatPhotoInputChange,
  sectionOptions,
  rowSeatOptions,
  shareModalOrigin,
  selectedEventId,
  onSelectedEventIdChange,
  onSubmitUpload,
  onShowToast,
}: ShareSeatViewModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [photoUploadMode, setPhotoUploadMode] = useState<"file" | "url">("file")

  if (!isOpen) return null

  const availableVenues = Array.from(
    new Set([
      ...(venueOptions?.map((v) => v.value) ?? []),
      ...events.map((e) => e.venue).filter(Boolean),
    ]),
  )

  const eventsForVenue = seatVenueInput
    ? events.filter(
        (e) => e.venue.toLowerCase() === seatVenueInput.toLowerCase(),
      )
    : events

  const handleImageFileSelect = async (file: File) => {
    try {
      const result = await processAndCompressImage(file)
      onSeatPhotoInputChange(result.dataUrl)
      if (result.isOptimized) {
        onShowToast("Photo loaded and optimized! ✨")
      } else {
        onShowToast("Photo loaded from your device! ✨")
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not read image file"
      onShowToast(msg)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-4 backdrop-blur-md"
      onClick={() => {
        onSeatPhotoInputChange("")
        onClose()
      }}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-brand-line">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-sm">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-brand text-base font-bold text-brand-deep">
                Share Seat View
              </h3>
              <p className="text-[11px] text-muted">
                Help fellow fans see real sightlines from your seat
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2.5 py-1 text-[11px] font-black text-brand-orange">
              <Sparkles className="h-3 w-3" /> +15 EasePoints
            </span>
            <button
              type="button"
              onClick={() => {
                onSeatPhotoInputChange("")
                onClose()
              }}
              className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-brand-lilac/50 hover:text-brand-deep transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="mt-4 space-y-4">
          {/* Event, Section & Seat Context Details / Inputs */}
          <div className="rounded-2xl border border-brand-line bg-brand-warm/30 p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-muted mb-1.5">
              Seat View Details
            </div>
            <div className="space-y-3">
              {/* Venue Selection (Mandatory) */}
              <div>
                <label className="text-[10px] font-bold text-muted block mb-1">
                  Venue <span className="text-brand-orange">*</span>
                </label>
                <input
                  type="text"
                  list="modal-venue-options"
                  value={seatVenueInput}
                  onChange={(e) => {
                    const newVenue = e.target.value
                    onSeatVenueInputChange(newVenue)
                    if (seatEventIdInput) {
                      const curEv = events.find((ev) => ev.id === seatEventIdInput)
                      if (curEv && curEv.venue.toLowerCase() !== newVenue.toLowerCase()) {
                        onSeatEventIdInputChange("")
                        if (shareModalOrigin === "composer") {
                          onSelectedEventIdChange("")
                        }
                      }
                    }
                  }}
                  placeholder="Select or enter venue name (e.g. Singapore Indoor Stadium)..."
                  className="w-full rounded-xl border border-brand-line bg-white px-2.5 py-1.5 text-xs text-brand-deep outline-none focus:border-brand-purple"
                />
                <datalist id="modal-venue-options">
                  {availableVenues.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>

              {/* Event Selection (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-muted">
                    Event <span className="font-normal text-muted/70">(Optional)</span>
                  </label>
                  {seatEventIdInput && (
                    <button
                      type="button"
                      onClick={() => {
                        onSeatEventIdInputChange("")
                        if (shareModalOrigin === "composer") {
                          onSelectedEventIdChange("")
                        }
                      }}
                      className="cursor-pointer text-[10px] font-bold text-brand-purple hover:underline"
                    >
                      Clear Event (General Venue View)
                    </button>
                  )}
                </div>
                <select
                  value={
                    seatEventIdInput ||
                    (shareModalOrigin === "composer" ? selectedEventId : "") ||
                    ""
                  }
                  onChange={(e) => {
                    const newEventId = e.target.value
                    onSeatEventIdInputChange(newEventId)
                    if (shareModalOrigin === "composer") {
                      onSelectedEventIdChange(newEventId)
                    }
                    if (newEventId) {
                      const ev = events.find((item) => item.id === newEventId)
                      if (ev?.venue && (!seatVenueInput || seatVenueInput.toLowerCase() !== ev.venue.toLowerCase())) {
                        onSeatVenueInputChange(ev.venue)
                      }
                    }
                    onSeatSectionInputChange("")
                    onSeatRowInputChange("")
                  }}
                  className="w-full rounded-xl border border-brand-line bg-white px-2.5 py-1.5 text-xs text-brand-deep outline-none focus:border-brand-purple cursor-pointer"
                >
                  <option value="">No specific event (General venue sightline)</option>
                  {eventsForVenue.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} {ev.venue && (!seatVenueInput || seatVenueInput.toLowerCase() !== ev.venue.toLowerCase()) ? `(${ev.venue})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-muted block mb-1">
                    Section *
                  </label>
                  <input
                    type="text"
                    list="modal-section-options"
                    value={seatSectionInput}
                    onChange={(e) => onSeatSectionInputChange(e.target.value)}
                    placeholder={
                      sectionOptions.length > 0
                        ? "Select or type section..."
                        : "e.g. Section 108, Stalls"
                    }
                    className="w-full rounded-xl border border-brand-line bg-white px-2.5 py-1.5 text-xs text-brand-deep outline-none focus:border-brand-purple"
                  />
                  <datalist id="modal-section-options">
                    {sectionOptions.map((sec) => (
                      <option key={sec.value} value={sec.value}>
                        {sec.label}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted block mb-1">
                    Row & Seat
                  </label>
                  <input
                    type="text"
                    list="modal-row-options"
                    value={seatRowInput}
                    onChange={(e) => onSeatRowInputChange(e.target.value)}
                    placeholder="e.g. Row 12, Seat 5 (or GA)"
                    className="w-full rounded-xl border border-brand-line bg-white px-2.5 py-1.5 text-xs text-brand-deep outline-none focus:border-brand-purple"
                  />
                  <datalist id="modal-row-options">
                    {rowSeatOptions.map((rs) => (
                      <option key={rs.value} value={rs.value}>
                        {rs.label}
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          </div>

          {/* Photo Upload: File Picker or URL Paste */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-brand-deep flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-brand-orange" />
                Seat Sightline Photo *
              </label>
              <div className="flex items-center rounded-lg bg-brand-warm/60 p-0.5 border border-brand-line text-[11px]">
                <button
                  type="button"
                  onClick={() => setPhotoUploadMode("file")}
                  className={cx(
                    "cursor-pointer px-2.5 py-1 rounded-md font-bold transition",
                    photoUploadMode === "file"
                      ? "bg-white text-brand-deep shadow-xs"
                      : "text-muted hover:text-brand-deep",
                  )}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoUploadMode("url")}
                  className={cx(
                    "cursor-pointer px-2.5 py-1 rounded-md font-bold transition",
                    photoUploadMode === "url"
                      ? "bg-white text-brand-deep shadow-xs"
                      : "text-muted hover:text-brand-deep",
                  )}
                >
                  Paste Link
                </button>
              </div>
            </div>

            {photoUploadMode === "file" ? (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImageFileSelect(file)
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const file = e.dataTransfer.files?.[0]
                    if (file) handleImageFileSelect(file)
                  }}
                  className="cursor-pointer flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-orange/40 bg-brand-orange/5 p-4 text-center transition hover:border-brand-orange hover:bg-brand-orange/10"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-brand-deep block">
                      Choose an image file from your device
                    </span>
                    <span className="text-[11px] text-muted">
                      Click to browse or drag & drop (JPG, PNG, WebP)
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="url"
                  value={seatPhotoInput}
                  onChange={(e) => onSeatPhotoInputChange(e.target.value)}
                  placeholder="Paste image URL (e.g. https://images.unsplash.com/...)"
                  className="w-full rounded-xl border border-brand-line bg-brand-warm/30 px-3 py-2.5 text-xs text-brand-deep outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
                />
              </div>
            )}

            {/* Quick actions row */}
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const samples = [
                    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=85",
                    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=85",
                    "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=85",
                  ]
                  const picked =
                    samples[Math.floor(Math.random() * samples.length)]
                  onSeatPhotoInputChange(picked)
                  onShowToast("Loaded sample concert seat photo!")
                }}
                className="cursor-pointer font-bold text-brand-purple hover:underline"
              >
                ⚡ Use Sample Concert Photo
              </button>
              {seatPhotoInput && (
                <button
                  type="button"
                  onClick={() => onSeatPhotoInputChange("")}
                  className="cursor-pointer font-bold text-red-500 hover:underline"
                >
                  Clear photo
                </button>
              )}
            </div>
          </div>

          {/* Photo Preview */}
          {seatPhotoInput ? (
            <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-brand-line shadow-inner">
              <img
                src={seatPhotoInput}
                alt="Seat preview"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 flex items-center justify-between text-white text-[11px]">
                <span className="font-bold truncate">
                  {seatSectionInput || "Section"}{" "}
                  {seatRowInput ? `· ${seatRowInput}` : ""}
                </span>
                <span className="inline-flex items-center gap-1 bg-emerald-500/90 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-24 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-line bg-brand-warm/20 text-center text-xs text-muted">
              <ImageIcon className="h-5 w-5 text-muted mb-1" />
              <span>
                Choose an image file or paste an image link to preview
              </span>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-brand-line">
            <button
              type="button"
              onClick={() => {
                onSeatPhotoInputChange("")
                onClose()
              }}
              className="cursor-pointer rounded-xl border border-brand-line bg-white px-4 py-2.5 text-xs font-bold text-muted hover:bg-brand-warm/50 hover:text-brand-deep transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmitUpload}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
            >
              <Camera className="h-4 w-4" /> Upload EasePix
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
