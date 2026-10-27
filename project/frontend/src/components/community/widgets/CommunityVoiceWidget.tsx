import { Volume2, VolumeX } from "lucide-react"

interface CommunityVoiceWidgetProps {
  isPlaying: boolean
  onToggle: () => void
}

export function CommunityVoiceWidget({
  isPlaying,
  onToggle,
}: CommunityVoiceWidgetProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-brand-purple/20 bg-white/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-lilac text-brand-purple">
        {isPlaying ? (
          <VolumeX className="h-4 w-4 animate-pulse text-brand-magenta" />
        ) : (
          <Volume2 className="h-4 w-4 text-brand-purple" />
        )}
      </div>
      <div className="hidden sm:block">
        <b className="block text-xs font-extrabold text-brand-deep leading-tight">
          <span className="font-feature italic font-black">EaseVoice</span>
        </b>
        <small className="block text-[10px] text-muted">
          Listen to the feed
        </small>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-orange to-brand-amber px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-brand-orange/20 transition hover:scale-105 active:scale-95"
      >
        {isPlaying ? "Ⅱ Pause" : "▷ Play"}
      </button>
    </div>
  )
}
