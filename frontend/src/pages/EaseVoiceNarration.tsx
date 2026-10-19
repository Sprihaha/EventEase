import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pause, ShieldX, Volume2, X } from "lucide-react";
import { useStore } from "../lib/store";
import {
  narrationPages,
  type NarrationAudience,
  type NarrationPageId,
  useAccessibility,
} from "../lib/accessibility";
import { Badge, Button, Card, Select, Textarea, cx } from "../components/ui";

const maxLength = 5000;

export default function EaseVoiceNarration({ embedded = false }: { embedded?: boolean }) {
  const { user } = useStore();
  const { settings, narrations, saveNarration } = useAccessibility();
  const [page, setPage] = useState<NarrationPageId>("home");
  const [audience, setAudience] = useState<NarrationAudience>("customer");
  const [draft, setDraft] = useState(narrations.home);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

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
  const hasNarration = (id: NarrationPageId) => Boolean(narrations[id].trim());

  const choosePage = (id: NarrationPageId) => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPage(id);
    setDraft(narrations[id]);
    setError("");
    setSaved(false);
    setMenuOpen(false);
  };

  const chooseAudience = (nextAudience: NarrationAudience) => {
    const firstPage = narrationPages.find((item) =>
      item.audiences.includes(nextAudience as never),
    )!;
    setAudience(nextAudience);
    choosePage(firstPage.id);
  };

  const preview = () => {
    if (!draft.trim()) {
      setError("Narration text cannot be blank");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
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

  const save = () => {
    if (!draft.trim()) {
      setError("Narration text cannot be blank");
      setSaved(false);
      return;
    }
    saveNarration(page, draft.trim());
    setDraft(draft.trim());
    setError("");
    setSaved(true);
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

        <div className="mt-7 flex flex-wrap gap-3 border-t border-line pt-6">
          <Button type="button" variant="outline" onClick={preview}>
            {speaking ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {speaking ? "Stop preview" : "Preview"}
          </Button>
          <Button type="button" onClick={save}>Save narration</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              window.speechSynthesis?.cancel();
              setSpeaking(false);
              setDraft(narrations[page]);
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
