import { useEffect, useRef, useState } from "react";
import { ChevronDown, Music, Pause, ShieldX, Trash2, Upload, Volume2, X } from "lucide-react";
import { useStore } from "../lib/store";
import { ApiError, MAX_NARRATION_AUDIO_BYTES } from "../lib/backendApi";
import {
  narrationPages,
  type NarrationAudience,
  type NarrationPageId,
  useAccessibility,
} from "../lib/accessibility";
import { Badge, Button, Card, Select, Textarea, cx } from "../components/ui";

const maxLength = 5000;

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function problemText(reason: unknown, fallback: string) {
  if (reason instanceof ApiError) {
    if (reason.status === 401) return "Your login has expired. Please log in as an admin again.";
    if (reason.status === 403) return "Only an administrator can change narration.";
    return reason.message;
  }
  return fallback;
}

export default function EaseVoiceNarration({ embedded = false }: { embedded?: boolean }) {
  const { user } = useStore();
  const { settings, narrations, audio, saveNarration, loadNarrations, uploadAudio, removeAudio } =
    useAccessibility();
  const [page, setPage] = useState<NarrationPageId>("home");
  const [audience, setAudience] = useState<NarrationAudience>("customer");
  const [draft, setDraft] = useState(narrations.home);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState<"upload" | "remove" | null>(null);
  const [recordingNote, setRecordingNote] = useState<{ ok: boolean; text: string } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewSound = useRef<HTMLAudioElement | null>(null);

  // Show what is saved on the server (text and recordings) for every page.
  useEffect(() => {
    void loadNarrations(narrationPages.map((item) => item.id));
  }, []);

  // When the server text arrives, refresh the editor unless the admin has already started typing.
  useEffect(() => {
    if (!dirty) setDraft(narrations[page]);
  }, [narrations, page, dirty]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
      window.speechSynthesis?.cancel();
      previewSound.current?.pause();
    };
  }, []);

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-xl items-center px-5 py-16 text-center">
        <Card className="w-full p-10">
          <ShieldX className="mx-auto h-12 w-12 text-danger" />
          <h1 className="mt-5 font-brand text-3xl font-bold text-brand-deep">
            Access denied: admins only
          </h1>
          <p className="mt-3 text-sm text-muted">
            Narration content can only be managed by an EventEase administrator.
          </p>
        </Card>
      </div>
    );
  }

  const selectedPage = narrationPages.find((item) => item.id === page)!;
  const availablePages = narrationPages.filter((item) =>
    item.audiences.includes(audience as never),
  );
  const hasNarration = (id: NarrationPageId) => Boolean(narrations[id].trim()) || Boolean(audio[id]);

  const stopPreview = () => {
    window.speechSynthesis?.cancel();
    if (previewSound.current) {
      previewSound.current.pause();
      previewSound.current = null;
    }
    setSpeaking(false);
  };

  const choosePage = (id: NarrationPageId) => {
    stopPreview();
    setPage(id);
    setDraft(narrations[id]);
    setDirty(false);
    setError("");
    setSaved(false);
    setRecordingNote(null);
    setMenuOpen(false);
  };

  const chooseAudience = (nextAudience: NarrationAudience) => {
    const firstPage = narrationPages.find((item) =>
      item.audiences.includes(nextAudience as never),
    )!;
    setAudience(nextAudience);
    choosePage(firstPage.id);
  };

  // Preview plays what visitors will hear: the recording if there is one, otherwise the text read aloud.
  const preview = () => {
    if (speaking) {
      stopPreview();
      return;
    }
    const uploaded = audio[page];
    if (uploaded) {
      const sound = new Audio(uploaded.url);
      sound.playbackRate = settings.voiceSpeed;
      sound.onended = () => {
        previewSound.current = null;
        setSpeaking(false);
      };
      sound.onerror = () => {
        previewSound.current = null;
        setSpeaking(false);
        setError("The recording could not be played. Try uploading it again.");
      };
      previewSound.current = sound;
      sound.play().then(
        () => setSpeaking(true),
        () => {
          previewSound.current = null;
          setError("The recording could not be played. Try uploading it again.");
        },
      );
      return;
    }
    if (!draft.trim()) {
      setError("Write some narration text or upload an MP3 to preview.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(draft.trim());
    utterance.rate = settings.voiceSpeed;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const save = async () => {
    if (!draft.trim()) {
      setError("Narration text cannot be blank");
      setSaved(false);
      return;
    }
    setSaving(true);
    try {
      await saveNarration(page, draft.trim());
      setDraft(draft.trim());
      setDirty(false);
      setError("");
      setSaved(true);
    } catch (reason) {
      setSaved(false);
      setError(problemText(reason, "Could not save the narration. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  const recording = audio[page];
  const canUpload = recordingBusy === null;

  const chooseFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setRecordingNote(null);
    if (!/\.mp3$/i.test(file.name) && file.type !== "audio/mpeg") {
      setRecordingNote({ ok: false, text: "Please choose an MP3 file (a file ending in .mp3)." });
      return;
    }
    if (file.size > MAX_NARRATION_AUDIO_BYTES) {
      setRecordingNote({
        ok: false,
        text: `That file is ${sizeLabel(file.size)}. The limit is ${sizeLabel(MAX_NARRATION_AUDIO_BYTES)}.`,
      });
      return;
    }
    setRecordingBusy("upload");
    try {
      await uploadAudio(page, file);
      setRecordingNote({ ok: true, text: `Recording “${file.name}” uploaded. It now plays instead of the computer voice.` });
    } catch (reason) {
      setRecordingNote({
        ok: false,
        text: problemText(reason, "Could not upload the recording. Check your connection and try again."),
      });
    } finally {
      setRecordingBusy(null);
    }
  };

  const deleteRecording = async () => {
    setRecordingNote(null);
    setRecordingBusy("remove");
    try {
      await removeAudio(page);
      setRecordingNote({ ok: true, text: "Recording removed. This page is read aloud by the computer voice again." });
    } catch (reason) {
      setRecordingNote({ ok: false, text: problemText(reason, "Could not remove the recording. Try again.") });
    } finally {
      setRecordingBusy(null);
    }
  };

  return (
    <div className={embedded ? "" : "mx-auto max-w-4xl px-5 py-14"}>
      <Badge tone="accent"><Volume2 className="h-3 w-3" /> Admin only</Badge>
      <h1 className="mt-4 font-brand text-3xl sm:text-4xl font-bold tracking-tight text-brand-deep">
        EaseVoice narration
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Edit the spoken introduction for one EventEase page at a time.
      </p>

      <Card className="mt-8 p-6 sm:p-8">
        <div className="grid gap-5 md:grid-cols-[13rem_1fr]">
          <label>
            <span className="mb-1.5 block text-sm font-medium">Role</span>
            <Select
              value={audience}
              onChange={(event) => chooseAudience(event.target.value as NarrationAudience)}
              aria-label="Filter narration pages by role"
            >
              <option value="customer">Customer</option>
              <option value="organizer">Organiser</option>
              <option value="admin">Admin</option>
            </Select>
          </label>
          <div ref={menu} className="relative">
            <label id="narration-page-label" className="mb-1.5 block text-sm font-medium">
              Page
            </label>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-labelledby="narration-page-label selected-narration-page"
            className="flex h-12 w-full items-center justify-between rounded-xl border border-line bg-paper px-4 text-left transition hover:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
          >
            <span id="selected-narration-page" className="font-medium">
              {selectedPage.name}
              <span className="ml-2 text-sm font-normal text-muted">({selectedPage.id})</span>
            </span>
            <span className="flex items-center gap-3">
              <Badge tone={hasNarration(page) ? "live" : "neutral"}>
                {hasNarration(page) ? "Has narration" : "Not set"}
              </Badge>
              <ChevronDown className="h-4 w-4 text-muted" />
            </span>
          </button>
          {menuOpen && (
            <div
              role="listbox"
              aria-labelledby="narration-page-label"
              className="absolute inset-x-0 top-[4.75rem] z-30 max-h-80 overflow-y-auto rounded-2xl border border-line bg-paper p-2 shadow-xl"
            >
              {availablePages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={page === item.id}
                  onClick={() => choosePage(item.id)}
                  className={cx(
                    "flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20",
                    page === item.id ? "bg-brand-purple/10 text-brand-purple font-semibold" : "hover:bg-brand-purple/5",
                  )}
                >
                  <span>
                    <span className="font-medium">{item.name}</span>
                    <span className="ml-2 text-sm text-muted">({item.id})</span>
                  </span>
                  <Badge tone={hasNarration(item.id) ? "live" : "neutral"}>
                    {hasNarration(item.id) ? "Has narration" : "Not set"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>

        <div className="mt-7">
          <label htmlFor="narration-editor" className="text-sm font-medium">Narration text</label>
          <Textarea
            id="narration-editor"
            rows={12}
            maxLength={maxLength}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setDirty(true);
              setError("");
              setSaved(false);
            }}
            placeholder="No narration yet for this page"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "narration-error narration-count" : "narration-count"}
            className="mt-2 focus-visible:ring-4 focus-visible:ring-accent/20"
          />
          <div className="mt-2 flex items-start justify-between gap-4 text-sm">
            <div>
              {error && <p id="narration-error" role="alert" className="font-medium text-danger">{error}</p>}
              {saved && <p role="status" className="font-medium text-live">Narration saved</p>}
              {!draft && !error && (
                <p className="text-muted">No narration yet for this page</p>
              )}
            </div>
            <span id="narration-count" className="shrink-0 text-xs text-muted">
              {draft.length}/{maxLength}
            </span>
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-line bg-mist/40 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
            <Music className="h-4 w-4 text-brand-purple" /> Your own recording (MP3)
          </div>
          <p className="mt-1 text-sm text-muted">
            Upload an MP3 of your own voice for this page. When a recording exists, visitors hear it instead of the
            computer voice. Maximum {sizeLabel(MAX_NARRATION_AUDIO_BYTES)}.
          </p>

          {recording && (
            <div className="mt-4">
              <div className="text-sm">
                <span className="font-medium">{recording.filename}</span>
                <span className="ml-2 text-muted">{sizeLabel(recording.sizeBytes)}</span>
              </div>
              <audio
                key={recording.url}
                controls
                preload="metadata"
                src={recording.url}
                aria-label={`Recording for ${selectedPage.name}`}
                className="mt-2 w-full"
              />
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept=".mp3,audio/mpeg"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose an MP3 recording"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!canUpload}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {recordingBusy === "upload" ? "Uploading…" : recording ? "Replace MP3" : "Upload MP3"}
            </Button>
            {recording && (
              <Button type="button" variant="ghost" disabled={recordingBusy !== null} onClick={() => void deleteRecording()}>
                <Trash2 className="h-4 w-4" />
                {recordingBusy === "remove" ? "Removing…" : "Remove recording"}
              </Button>
            )}
          </div>
          {recordingNote && (
            <p
              role={recordingNote.ok ? "status" : "alert"}
              className={cx("mt-3 text-sm font-medium", recordingNote.ok ? "text-live" : "text-danger")}
            >
              {recordingNote.text}
            </p>
          )}
        </div>

        <div className="mt-7 flex flex-wrap gap-3 border-t border-line pt-6">
          <Button type="button" variant="outline" onClick={preview}>
            {speaking ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {speaking ? "Stop preview" : audio[page] ? "Preview recording" : "Preview text"}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save narration"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              stopPreview();
              setDraft(narrations[page]);
              setDirty(false);
              setError("");
              setSaved(false);
            }}
          >
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
