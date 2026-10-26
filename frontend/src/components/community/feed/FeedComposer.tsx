import { useNavigate } from "react-router"
import { Flame, ImageIcon, X, Camera, Send } from "lucide-react"
import { Button, Textarea } from "../../ui"
import type { AttachedEasePix, EventItem, User } from "../types"

interface FeedComposerProps {
  user: User | null
  events: EventItem[]
  draft: string
  onDraftChange: (text: string) => void
  selectedEventId: string
  onSelectedEventIdChange: (id: string) => void
  photoUrl: string
  onPhotoUrlChange: (url: string) => void
  showPhotoInput: boolean
  onTogglePhotoInput: (show: boolean) => void
  attachedEasePix: AttachedEasePix | null
  onDetachEasePix: () => void
  onOpenUploadModal: () => void
  onSubmitPost: () => void
  composerRef?: React.RefObject<HTMLDivElement | null>
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
}

export function FeedComposer({
  user,
  events,
  draft,
  onDraftChange,
  selectedEventId,
  onSelectedEventIdChange,
  photoUrl,
  onPhotoUrlChange,
  showPhotoInput,
  onTogglePhotoInput,
  attachedEasePix,
  onDetachEasePix,
  onOpenUploadModal,
  onSubmitPost,
  composerRef,
  textareaRef,
}: FeedComposerProps) {
  const navigate = useNavigate()

  if (!user) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-brand-purple/20 bg-gradient-to-r from-brand-lilac/30 via-white to-orange-50/40 p-5 sm:p-6 text-center shadow-xs">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-md mb-3">
          <Flame className="h-5 w-5" />
        </div>
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, left: 0, behavior: "instant" })
            navigate("/login", { state: { returnTo: "/community" } })
          }}
          className="cursor-pointer inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-orange via-brand-magenta to-brand-purple px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-brand-orange/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
        >
          <Flame className="h-4 w-4" /> Got a hot take? We&apos;re listening
        </button>
        <p className="mt-2.5 text-xs text-muted">
          Sign in to share tips, ask questions, or upload EasePix seat views.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={composerRef}
      className="rounded-3xl border-2 border-brand-purple/20 bg-white p-5 shadow-sm transition-all focus-within:border-brand-purple focus-within:ring-4 focus-within:ring-brand-purple/10"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta font-bold text-white shadow-sm">
          {user.name?.[0] ?? "Y"}
        </div>
        <div>
          <b className="block text-xs font-bold text-brand-deep">
            What’s the story?
          </b>
          <small className="block text-[11px] text-muted">
            Ask the crowd, share a tip, or post a seat view.
          </small>
        </div>
      </div>

      <div className="mt-3.5">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={3}
          placeholder="Drop a tip, ask the crowd, or share the moment…"
          className="border-brand-line bg-brand-warm/30 text-sm focus:border-brand-purple"
        />
      </div>

      {/* Photo URL Input Bar if toggled */}
      {showPhotoInput && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-brand-line bg-brand-lilac/30 p-2">
          <ImageIcon className="h-4 w-4 text-brand-purple" />
          <input
            type="url"
            placeholder="Paste seat photo URL (e.g. Unsplash or direct image link)"
            value={photoUrl}
            onChange={(e) => onPhotoUrlChange(e.target.value)}
            className="flex-1 bg-transparent text-xs text-brand-deep outline-none"
          />
          <button
            type="button"
            onClick={() => onTogglePhotoInput(false)}
            className="text-muted hover:text-brand-deep cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Attached EasePix Preview in Composer */}
      {attachedEasePix && (
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-brand-purple/30 bg-brand-lilac/40 p-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-brand-line bg-black/10">
              <img
                src={attachedEasePix.photo}
                alt="Attached EasePix"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-brand-deep">
                <span className="text-brand-purple">📸 EasePix Attached</span>
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-brand-deep border border-brand-line">
                  {attachedEasePix.section} · {attachedEasePix.row}
                </span>
              </div>
              <small className="block truncate text-[11px] text-muted">
                Will upload to EasePix and EaseComms when you share this post
              </small>
            </div>
          </div>
          <button
            type="button"
            onClick={onDetachEasePix}
            className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-white hover:text-red-500 transition"
            aria-label="Remove attached photo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-line/60">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-brand-purple/40 bg-white px-3 py-1.5 text-xs font-bold text-brand-purple transition hover:bg-brand-purple hover:text-white"
          >
            <Camera className="h-3.5 w-3.5" /> Upload EasePix
          </button>
        </div>

        <Button
          size="sm"
          onClick={onSubmitPost}
          className="border-0 bg-gradient-to-r from-brand-orange to-brand-amber font-bold text-white shadow-md shadow-brand-orange/20 hover:shadow-brand-orange/35"
        >
          <Send className="h-4 w-4" /> Share post
        </Button>
      </div>
    </div>
  )
}
