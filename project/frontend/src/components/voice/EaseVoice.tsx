import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Pause, Play, Volume2 } from "lucide-react";
import {
  narrationPageForPath,
  type NarrationPageId,
  useAccessibility,
} from "../../lib/accessibility";
import { Button, Select, cx } from "../ui";
import { useEaseVoiceConfig } from "../../lib/easeVoiceConfig";
import { watchIdle, watchSelection } from "./easeVoiceWatchers";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30 focus-visible:ring-offset-2";

export function EaseVoice() {
  const { pathname } = useLocation();
  const { settings, narrations, audio, loadNarrations, saveSettings } = useAccessibility();
  const config = useEaseVoiceConfig();
  const [playback, setPlayback] = useState<"idle" | "playing" | "paused">("idle");
  const [page, setPage] = useState<NarrationPageId>(() => narrationPageForPath(pathname));
  const player = useRef<HTMLAudioElement | null>(null);
  const recordingUrl = audio[page]?.url;

  useEffect(() => {
    setPage(narrationPageForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const changePage = (event: Event) => {
      setPage((event as CustomEvent<NarrationPageId>).detail);
    };
    window.addEventListener("eventease:narration-page", changePage);
    return () => window.removeEventListener("eventease:narration-page", changePage);
  }, []);

  // Pick up text and recordings the admin saved on the server for the page being viewed.
  useEffect(() => {
    void loadNarrations([page]);
  }, [page]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (player.current) {
      player.current.pause();
      player.current = null;
    }
    setPlayback("idle");
  }, []);

  const speak = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const text = narrations[page].trim();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.voiceSpeed;
    utterance.onend = () => setPlayback("idle");
    utterance.onerror = () => setPlayback("idle");
    window.speechSynthesis.speak(utterance);
    setPlayback("playing");
  }, [narrations, page, settings.voiceSpeed]);

  // An admin recording plays instead of the browser voice; without one we read the text aloud.
  const readPage = useCallback(() => {
    stop();
    if (!recordingUrl) {
      speak();
      return;
    }
    const recording = new Audio(recordingUrl);
    recording.playbackRate = settings.voiceSpeed;
    recording.onended = () => {
      player.current = null;
      setPlayback("idle");
    };
    recording.onerror = () => {
      player.current = null;
      speak(); // the recording could not be loaded: fall back to the browser voice
    };
    player.current = recording;
    recording.play().then(
      () => setPlayback("playing"),
      () => {
        player.current = null;
        setPlayback("idle");
      },
    );
  }, [recordingUrl, settings.voiceSpeed, speak, stop]);

  const togglePlayback = () => {
    if (playback === "playing") {
      if (player.current) player.current.pause();
      else window.speechSynthesis.pause();
      setPlayback("paused");
      return;
    }
    if (playback === "paused") {
      if (player.current) void player.current.play();
      else window.speechSynthesis.resume();
      setPlayback("playing");
      return;
    }
    readPage();
  };

  useEffect(() => {
    if (settings.autoNarrate) readPage();
    else stop();
    return stop;
  }, [page, settings.autoNarrate, readPage, stop]);

  // Read any text aloud straight away, at the visitor's voice speed. Stops whatever was playing.
  const voiceSpeed = settings.voiceSpeed;
  const say = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    if (player.current) {
      player.current.pause();
      player.current = null;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceSpeed;
    utterance.lang = document.documentElement.lang || "en-SG";
    utterance.onend = () => setPlayback("idle");
    utterance.onerror = () => setPlayback("idle");
    window.speechSynthesis.speak(utterance);
    setPlayback("playing");
  }, [voiceSpeed]);

  // 1. Highlighting text on any page reads it out (admin setting "Read selected text aloud").
  useEffect(() => {
    if (!config.selectToRead) return;
    return watchSelection(window, document, say);
  }, [config.selectToRead, say]);

  // 3. After a while with no activity, offer help out loud (admin settings "Idle prompt").
  useEffect(() => {
    if (!config.idlePromptEnabled || !config.idlePromptText.trim()) return;
    return watchIdle(window, document, config.idleSeconds, () => {
      // Browsers only allow speech after the visitor has interacted with the page at least once.
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (activation && !activation.hasBeenActive) return;
      if (window.speechSynthesis?.speaking || player.current) return; // never talk over narration
      say(config.idlePromptText);
    });
  }, [config.idlePromptEnabled, config.idlePromptText, config.idleSeconds, say]);

  // 2. The floating player is hidden unless an admin turns it back on.
  if (!config.showFloatingPlayer) return null;

  return (
    <div
      role="toolbar"
      aria-label="EaseVoice narration controls"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full border border-brand-purple/20 bg-white/95 p-1.5 pl-3.5 shadow-[0_14px_40px_-12px_rgba(50,19,79,0.35)] backdrop-blur"
    >
      <div className="hidden items-center gap-2.5 pr-1 sm:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-lilac text-brand-purple">
          <Volume2 className="h-4 w-4" />
        </span>
        <span className="font-brand text-sm font-bold text-brand-deep">EaseVoice</span>
      </div>
      <Button
        type="button"
        variant={playback === "playing" ? "dark" : "primary"}
        size="sm"
        onClick={togglePlayback}
        aria-label={playback === "playing" ? "Pause page narration" : "Play page narration"}
        className={focusRing}
      >
        {playback === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {playback === "playing" ? "Pause" : "Play"}
      </Button>
      <label className="flex items-center gap-2">
        <span className="sr-only">Voice speed</span>
        <Select
          value={settings.voiceSpeed}
          onChange={(event) =>
            saveSettings({ ...settings, voiceSpeed: Number(event.target.value) })
          }
          aria-label="Voice speed"
          className={cx(
            "h-9 w-[4.75rem] rounded-full border-0 bg-brand-lilac/60 py-0 pl-3 pr-6 text-xs font-bold text-brand-deep",
            focusRing,
          )}
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
            <option key={speed} value={speed}>{speed}x</option>
          ))}
        </Select>
      </label>
    </div>
  );
}

export default EaseVoice;
