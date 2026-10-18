import { useEffect, useState } from "react";
import { CheckCircle2, Volume2 } from "lucide-react";
import {
  type AccessibilitySettings as Settings,
  useAccessibility,
} from "../lib/accessibility";
import { Badge, Button, Card, cx } from "../components/ui";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 focus-visible:ring-offset-2";

export default function AccessibilitySettings() {
  const { settings, saveSettings } = useAccessibility();
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, []);

  const save = () => {
    saveSettings(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Badge tone="accent"><Volume2 className="h-3 w-3" /> EaseVoice</Badge>
      <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight">
        Accessibility settings
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        Choose how quickly EaseVoice reads and whether narration starts automatically.
      </p>

      <Card className="mt-8 p-6 sm:p-8">
        <label className="block">
          <span className="flex items-center justify-between font-medium">
            Voice speed
            <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink">
              {draft.voiceSpeed.toFixed(2).replace(/0$/, "")}x
            </span>
          </span>
          <p className="mt-1 text-sm text-muted">Adjust narration from 0.5x to 2.0x.</p>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.25"
            value={draft.voiceSpeed}
            onChange={(event) => {
              setSaved(false);
              setDraft({ ...draft, voiceSpeed: Number(event.target.value) });
            }}
            aria-label="Voice speed"
            className={cx("mt-5 w-full accent-accent", focusRing)}
          />
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>0.5x</span><span>1.0x</span><span>1.5x</span><span>2.0x</span>
          </div>
        </label>

        <div className="mt-8 flex items-center justify-between gap-5 border-t border-line pt-6">
          <div>
            <div className="font-medium">Auto-narrate on page load</div>
            <p className="mt-1 text-sm text-muted">
              Automatically read the narration whenever you open a page.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.autoNarrate}
            aria-label="Auto-narrate on page load"
            onClick={() => {
              setSaved(false);
              setDraft({ ...draft, autoNarrate: !draft.autoNarrate });
            }}
            className={cx(
              "relative h-8 w-14 shrink-0 rounded-full transition",
              draft.autoNarrate ? "bg-accent" : "bg-line",
              focusRing,
            )}
          >
            <span
              className={cx(
                "absolute top-1 h-6 w-6 rounded-full bg-paper shadow-sm transition",
                draft.autoNarrate ? "left-7" : "left-1",
              )}
            />
          </button>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button type="button" onClick={save} className={focusRing}>Save settings</Button>
          {saved && (
            <div role="status" className="flex items-center gap-2 text-sm font-medium text-live">
              <CheckCircle2 className="h-4 w-4" /> Settings saved
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
