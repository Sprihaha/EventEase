import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Square, Volume2 } from "lucide-react";
import { useAccessibility } from "../../lib/accessibility";
import { useEaseVoiceConfig } from "../../lib/easeVoiceConfig";
import { Button, Select, cx } from "../ui";
import { watchIdle, watchSelection } from "./easeVoiceWatchers";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30 focus-visible:ring-offset-2";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * EaseVoice dock: a small tab at the bottom-right of every page. Pressing it slides the panel up;
 * pressing it again slides it down. Reading selected text and the idle prompt work whether or not
 * the panel is open. What EaseVoice does is set by an administrator (Admin → EaseVoice settings).
 */
export function EaseVoice() {
  const { settings, saveSettings } = useAccessibility();
  const config = useEaseVoiceConfig();
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const panelId = useId();
  const tabRef = useRef<HTMLButtonElement>(null);
  const voiceSpeed = settings.voiceSpeed;

  // Read any text aloud straight away, at the visitor's voice speed, replacing whatever was playing.
  const say = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceSpeed;
    utterance.lang = document.documentElement.lang || "en-SG";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [voiceSpeed]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]); // stop talking if EaseVoice is removed from the page

  // Highlighting text on any page reads it out (admin setting "Read selected text aloud").
  useEffect(() => {
    if (!config.selectToRead) return;
    return watchSelection(window, document, say);
  }, [config.selectToRead, say]);

  // While a visitor stays inactive, offer help out loud every idle period (admin setting).
  useEffect(() => {
    if (!config.idlePromptEnabled || !config.idlePromptText.trim()) return;
    return watchIdle(window, document, config.idleSeconds, () => {
      // Browsers only allow speech after the visitor has interacted with the page at least once.
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (activation && !activation.hasBeenActive) return;
      if (window.speechSynthesis?.speaking) return; // never talk over something being read
      say(config.idlePromptText);
    });
  }, [config.idlePromptEnabled, config.idlePromptText, config.idleSeconds, say]);

  // Escape slides the panel down and returns focus to the tab.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      tabRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    // Pinned to the bottom edge: when the panel below the tab grows, the tab rises with it.
    <div className="pointer-events-none fixed bottom-0 right-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col items-end sm:right-6">
      {/* The tab: always visible and small. Pressing it slides the panel up; pressing again slides it down. */}
      <button
        ref={tabRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Hide EaseVoice" : "Show EaseVoice"}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "pointer-events-auto flex items-center gap-2 rounded-t-xl border border-b-0 border-brand-purple/20 bg-white/95 px-3.5 py-2 text-sm font-bold text-brand-deep shadow-[0_-8px_24px_-12px_rgba(50,19,79,0.35)] backdrop-blur transition-colors hover:bg-brand-lilac/60",
          focusRing,
        )}
      >
        <Volume2 className={cx("h-4 w-4 text-brand-purple", speaking && "animate-pulse")} />
        <span className="font-brand">EaseVoice</span>
        {speaking && <span className="sr-only">is reading</span>}
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {/* Height animates from 0 to its content (grid rows 0fr → 1fr); reduced-motion users get no animation. */}
      <div
        className={cx(
          "grid w-full transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div
          id={panelId}
          role="region"
          aria-label="EaseVoice"
          inert={!open}
          className={cx("overflow-hidden", open && "pointer-events-auto")}
        >
          <div className="rounded-tl-2xl border border-b-0 border-brand-purple/20 bg-white/95 p-4 shadow-[0_-14px_40px_-16px_rgba(50,19,79,0.35)] backdrop-blur">
            <p className="text-sm text-brand-deep">
              {config.selectToRead
                ? "Highlight any words on the page and I'll read them aloud."
                : "Reading highlighted text is switched off by the administrator."}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-muted">
                Voice speed
                <Select
                  value={voiceSpeed}
                  onChange={(event) => saveSettings({ ...settings, voiceSpeed: Number(event.target.value) })}
                  aria-label="Voice speed"
                  className={cx(
                    "h-9 w-[4.75rem] rounded-full border-0 bg-brand-lilac/60 py-0 pl-3 pr-6 text-xs font-bold text-brand-deep",
                    focusRing,
                  )}
                >
                  {SPEEDS.map((speed) => (
                    <option key={speed} value={speed}>{speed}x</option>
                  ))}
                </Select>
              </label>
              <Button
                type="button"
                size="sm"
                variant={speaking ? "dark" : "outline"}
                onClick={stop}
                disabled={!speaking}
                className={focusRing}
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EaseVoice;
