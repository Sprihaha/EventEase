import { useEffect, useState } from "react";
import { Save, Volume2 } from "lucide-react";
import { ApiError } from "../../lib/backendApi";
import {
  IDLE_PROMPT_MAX_LENGTH,
  IDLE_SECONDS_MAX,
  IDLE_SECONDS_MIN,
  saveEaseVoiceConfig,
  useEaseVoiceConfig,
  type EaseVoiceConfig,
} from "../../lib/easeVoiceConfig";
import { Button, Card, Field, Input, Textarea, cx } from "../ui";

type Draft = Omit<EaseVoiceConfig, "updatedAt" | "idleSeconds"> & { idleSeconds: string };

const toDraft = (config: EaseVoiceConfig): Draft => ({ ...config, idleSeconds: String(config.idleSeconds) });

function Toggle({ label, help, checked, onChange }: {
  label: string; help: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-t border-brand-purple/10 py-5 first:border-t-0 first:pt-0">
      <div>
        <div className="font-bold text-brand-deep">{label}</div>
        <p className="mt-1 text-sm text-muted">{help}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-8 w-14 shrink-0 cursor-pointer rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30",
          checked ? "bg-brand-purple" : "bg-line",
        )}
      >
        <span className={cx("absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition", checked ? "left-7" : "left-1")} />
      </button>
    </div>
  );
}

/** Admin-only: how EaseVoice behaves for every visitor. The page that shows this already checks the admin role. */
export default function EaseVoiceBehaviourSettings() {
  const config = useEaseVoiceConfig();
  const [draft, setDraft] = useState<Draft>(() => toDraft(config));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // Show the saved settings when they arrive, unless the admin has started editing.
  useEffect(() => {
    if (!touched) setDraft(toDraft(config));
  }, [config, touched]);

  const change = (update: Partial<Draft>) => {
    setTouched(true);
    setNote(null);
    setDraft((d) => ({ ...d, ...update }));
  };

  const seconds = Number(draft.idleSeconds);
  const problems: string[] = [];
  if (!Number.isInteger(seconds) || seconds < IDLE_SECONDS_MIN || seconds > IDLE_SECONDS_MAX)
    problems.push(`Idle time must be a whole number from ${IDLE_SECONDS_MIN} to ${IDLE_SECONDS_MAX} seconds.`);
  if (draft.idlePromptEnabled && !draft.idlePromptText.trim()) problems.push("Write the idle prompt, or turn it off.");

  const preview = () => {
    if (!("speechSynthesis" in window) || !draft.idlePromptText.trim()) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(draft.idlePromptText.trim()));
  };

  const save = async () => {
    if (problems.length || saving) return;
    setSaving(true);
    setNote(null);
    try {
      await saveEaseVoiceConfig({
        selectToRead: draft.selectToRead,
        idlePromptEnabled: draft.idlePromptEnabled,
        idleSeconds: seconds,
        idlePromptText: draft.idlePromptText.trim() || config.idlePromptText,
        showFloatingPlayer: draft.showFloatingPlayer,
      });
      setTouched(false);
      setNote({ ok: true, text: "Saved. Every visitor gets these settings on their next page load." });
    } catch (cause) {
      const text = cause instanceof ApiError && cause.status === 403
        ? "Only an administrator can change EaseVoice settings."
        : cause instanceof Error ? cause.message : "The settings were not saved. Please try again.";
      setNote({ ok: false, text });
    } finally {
      setSaving(false);
    }
  };

  const minutes = Number.isFinite(seconds) && seconds >= 60 ? ` (${+(seconds / 60).toFixed(1)} min)` : "";

  return (
    <Card className="mt-8 p-6 sm:p-8">
      <h2 className="font-brand text-xl font-bold text-brand-deep">EaseVoice behaviour</h2>
      <p className="mt-1 text-sm text-muted">Applies to every visitor on every page. Only administrators can change it.</p>

      <div className="mt-6">
        <Toggle
          label="Read selected text aloud"
          help="When someone highlights words on any page, EaseVoice reads them out straight away."
          checked={draft.selectToRead}
          onChange={(value) => change({ selectToRead: value })}
        />
        <Toggle
          label="Offer help when someone is idle"
          help="After a period with no mouse, keyboard, touch or scrolling, EaseVoice says the prompt below once."
          checked={draft.idlePromptEnabled}
          onChange={(value) => change({ idlePromptEnabled: value })}
        />
        {draft.idlePromptEnabled && (
          <div className="grid gap-4 pb-5 sm:grid-cols-[12rem_1fr]">
            <Field label={`Idle time in seconds${minutes}`}>
              <Input
                type="number"
                min={String(IDLE_SECONDS_MIN)}
                max={String(IDLE_SECONDS_MAX)}
                step="1"
                value={draft.idleSeconds}
                onChange={(e) => change({ idleSeconds: e.target.value })}
              />
            </Field>
            <Field label={`Prompt (${draft.idlePromptText.length}/${IDLE_PROMPT_MAX_LENGTH})`}>
              <Textarea
                rows={2}
                maxLength={IDLE_PROMPT_MAX_LENGTH}
                value={draft.idlePromptText}
                onChange={(e) => change({ idlePromptText: e.target.value })}
              />
            </Field>
            <div className="sm:col-start-2">
              <Button variant="outline" size="sm" onClick={preview} disabled={!draft.idlePromptText.trim()}>
                <Volume2 className="h-4 w-4" /> Preview prompt
              </Button>
            </div>
          </div>
        )}
        <Toggle
          label="Show the floating EaseVoice player"
          help="The Play / speed bar at the bottom-right of every page. Visitors can still change their voice speed under Accessibility settings."
          checked={draft.showFloatingPlayer}
          onChange={(value) => change({ showFloatingPlayer: value })}
        />
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!touched || problems.length > 0 || saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save EaseVoice settings"}
        </Button>
        {note && (
          <span role={note.ok ? "status" : "alert"} className={cx("text-sm", note.ok ? "text-live" : "text-danger")}>
            {note.text}
          </span>
        )}
      </div>
    </Card>
  );
}
