import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, HelpCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useStore } from "../lib/store";
import { ApiError } from "../lib/backendApi";
import { HELP_LIMITS, fetchHelpPage, keyFromName, saveHelpPage, type HelpFeature, type HelpPage } from "../lib/helpPage";
import { Badge, Button, Card, Field, Input, Textarea, cx } from "../components/ui";

// Friendly headings for the work packages the features belong to. Anything else shows as typed.
const GROUPS: Record<string, string> = {
  A: "Find events",
  B: "Book and keep your tickets",
  C: "Community",
  D: "Swap tickets",
  E: "Accessibility and organiser insights",
};
const groupTitle = (pkg: string) => GROUPS[pkg.trim().toUpperCase()] ?? (pkg.trim() || "More");

/** Ease feature names use the same italic display font as EaseComms in the header. */
function FeatureName({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cx(name.startsWith("Ease") && "font-feature italic font-black tracking-tight", className)}>
      {name}
    </span>
  );
}

/**
 * The terms are plain text with two simple markers: a line starting with "## " is a heading and
 * a line starting with "- " is a bullet. Everything is shown as text, never as HTML.
 */
function Terms({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="mt-2 list-disc space-y-1.5 pl-5">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      return;
    }
    flush();
    if (!line) return;
    if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="mt-7 font-brand text-lg font-bold text-brand-deep first:mt-0">
          {line.slice(3)}
        </h3>,
      );
    } else {
      blocks.push(<p key={`p-${blocks.length}`} className="mt-2">{line}</p>);
    }
  });
  flush();
  return <div className="text-sm leading-relaxed text-muted">{blocks}</div>;
}

function messageOf(cause: unknown, fallback: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Your login has expired. Please sign in as an admin again.";
    if (cause.status === 403) return "Only an administrator can change EaseHelp.";
    return cause.message;
  }
  return cause instanceof Error ? cause.message : fallback;
}

export default function EaseHelp() {
  const { user } = useStore();
  const isAdmin = user?.role === "admin";
  const [page, setPage] = useState<HelpPage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<HelpPage | null>(null); // set while an admin is editing
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    fetchHelpPage()
      .then(setPage)
      .catch((cause) => setLoadError(messageOf(cause, "EaseHelp could not be loaded. Please refresh the page.")));
  }, []);

  // Jump to a feature when the address has #easepix, once the content has loaded.
  useEffect(() => {
    if (!page || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [page]);

  const shown = draft ?? page;
  const groups = useMemo(() => {
    const out: { title: string; features: HelpFeature[] }[] = [];
    (page?.features ?? []).forEach((feature) => {
      const title = groupTitle(feature.package);
      const group = out.find((g) => g.title === title);
      if (group) group.features.push(feature);
      else out.push({ title, features: [feature] });
    });
    return out;
  }, [page]);

  // ---------------------------------------------------------------- admin editing
  const updateFeature = (index: number, change: Partial<HelpFeature>) =>
    setDraft((d) => d && { ...d, features: d.features.map((f, i) => (i === index ? { ...f, ...change } : f)) });
  const moveFeature = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const features = [...d.features];
      const [item] = features.splice(index, 1);
      features.splice(index + by, 0, item);
      return { ...d, features };
    });
  const removeFeature = (index: number) =>
    setDraft((d) => d && { ...d, features: d.features.filter((_, i) => i !== index) });
  const addFeature = () =>
    setDraft((d) => {
      if (!d) return d;
      const key = keyFromName("new feature", new Set(d.features.map((f) => f.key)));
      return { ...d, features: [...d.features, { key, name: "", package: "", tagline: "", description: "" }] };
    });

  const problems: string[] = [];
  if (draft) {
    if (draft.features.length === 0) problems.push("Keep at least one feature.");
    if (draft.features.length > HELP_LIMITS.features) problems.push(`At most ${HELP_LIMITS.features} features.`);
    draft.features.forEach((f, i) => {
      const label = f.name.trim() || `Feature ${i + 1}`;
      if (!f.name.trim()) problems.push(`Feature ${i + 1} needs a name.`);
      if (!f.description.trim()) problems.push(`${label} needs a description.`);
    });
    if (!draft.terms.trim()) problems.push("The terms and conditions cannot be empty.");
  }

  const startEditing = () => {
    if (!page) return;
    setDraft({ features: page.features.map((f) => ({ ...f })), terms: page.terms });
    setSaveError("");
    setSavedNote(false);
  };

  const cancelEditing = () => {
    if (window.confirm("Discard your changes to EaseHelp?")) {
      setDraft(null);
      setSaveError("");
    }
  };

  const save = async () => {
    if (!draft || problems.length || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      // New features get a stable key from their name the first time they are saved.
      const isNew = (f: HelpFeature) => f.key.startsWith("new-feature");
      const taken = new Set(draft.features.filter((f) => !isNew(f)).map((f) => f.key));
      const features = draft.features.map((f) => {
        if (!isNew(f)) return f;
        const key = keyFromName(f.name, taken);
        taken.add(key);
        return { ...f, key };
      }).map((f) => {
        return { ...f, name: f.name.trim(), package: f.package.trim(), tagline: f.tagline.trim(), description: f.description.trim() };
      });
      const saved = await saveHelpPage({ features, terms: draft.terms.trim() });
      setPage(saved);
      setDraft(null);
      setSavedNote(true);
    } catch (cause) {
      setSaveError(messageOf(cause, "EaseHelp was not saved. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- render
  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-14">
        <Card className="p-8 text-center" role="alert">
          <p className="font-semibold text-danger">{loadError}</p>
        </Card>
      </div>
    );
  }
  if (!shown) return <p className="mx-auto max-w-4xl px-5 py-14 text-muted" role="status">Loading EaseHelp…</p>;

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge tone="accent"><HelpCircle className="h-3 w-3" /> Help and guides</Badge>
          <h1 className="mt-4 font-feature text-4xl font-black italic tracking-tight text-brand-deep sm:text-5xl">EaseHelp</h1>
          <p className="mt-3 max-w-2xl text-muted">
            What each EventEase feature does and how to use it, plus the terms that apply when you use EventEase.
          </p>
        </div>
        {isAdmin && !draft && (
          <Button variant="outline" onClick={startEditing}>
            <Pencil className="h-4 w-4" /> Edit page
          </Button>
        )}
      </div>
      {savedNote && <p role="status" className="mt-4 text-sm font-semibold text-live">EaseHelp saved. Everyone sees the new version now.</p>}

      {draft ? (
        // ---------------------------------------------------------------- admin editor
        <div className="mt-10 space-y-5">
          <Card className="border-brand-purple/30 bg-brand-lilac/30 p-4 text-sm text-brand-deep">
            You are editing EaseHelp for everyone. Package groups features under a heading (A–E, or any text).
          </Card>
          {draft.features.map((feature, index) => (
            <Card key={feature.key} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">Feature {index + 1}</span>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" aria-label="Move up" disabled={index === 0} onClick={() => moveFeature(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Move down" disabled={index === draft.features.length - 1} onClick={() => moveFeature(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Remove ${feature.name || "feature"}`} onClick={() => removeFeature(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Name">
                  <Input value={feature.name} maxLength={HELP_LIMITS.name} onChange={(e) => updateFeature(index, { name: e.target.value })} />
                </Field>
                <Field label="Package">
                  <Input value={feature.package} maxLength={HELP_LIMITS.package} onChange={(e) => updateFeature(index, { package: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="One-line summary">
                    <Input value={feature.tagline} maxLength={HELP_LIMITS.tagline} onChange={(e) => updateFeature(index, { tagline: e.target.value })} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label={`What it does (${feature.description.length}/${HELP_LIMITS.description})`}>
                    <Textarea rows={4} value={feature.description} maxLength={HELP_LIMITS.description} onChange={(e) => updateFeature(index, { description: e.target.value })} />
                  </Field>
                </div>
              </div>
            </Card>
          ))}
          <Button variant="outline" onClick={addFeature} disabled={draft.features.length >= HELP_LIMITS.features}>
            <Plus className="h-4 w-4" /> Add feature
          </Button>

          <Card className="p-5">
            <Field label={`Terms and conditions (${draft.terms.length}/${HELP_LIMITS.terms})`}>
              <Textarea rows={18} value={draft.terms} maxLength={HELP_LIMITS.terms} onChange={(e) => setDraft({ ...draft, terms: e.target.value })} />
            </Field>
            <p className="mt-2 text-xs text-muted">Start a line with “## ” for a heading and “- ” for a bullet point.</p>
          </Card>

          {problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-danger">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          {saveError && <p role="alert" className="text-sm text-danger">{saveError}</p>}
          <div className="sticky bottom-4 z-10 flex flex-wrap gap-3 rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur">
            <Button onClick={() => void save()} disabled={problems.length > 0 || saving}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save EaseHelp"}
            </Button>
            <Button variant="ghost" onClick={cancelEditing} disabled={saving}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        // ---------------------------------------------------------------- what everyone sees
        <>
          <nav aria-label="EaseHelp topics" className="mt-8 flex flex-wrap gap-2">
            {shown.features.map((feature) => (
              <a key={feature.key} href={`#${feature.key}`}
                className="rounded-full border border-brand-purple/20 bg-white px-3.5 py-1.5 text-sm text-brand-deep transition hover:border-brand-purple hover:bg-brand-lilac/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30">
                <FeatureName name={feature.name} />
              </a>
            ))}
            <a href="#terms" className="rounded-full border border-brand-purple/20 bg-white px-3.5 py-1.5 text-sm text-brand-deep transition hover:border-brand-purple hover:bg-brand-lilac/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30">
              Terms and conditions
            </a>
          </nav>

          {groups.map((group) => (
            <Fragment key={group.title}>
              <h2 className="mt-12 font-brand text-2xl font-bold text-brand-deep">{group.title}</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.features.map((feature) => (
                  <Card key={feature.key} id={feature.key} className="scroll-mt-24 p-6">
                    <h3 className="text-xl text-brand-deep"><FeatureName name={feature.name} className="text-2xl" /></h3>
                    {feature.tagline && <p className="mt-1 font-semibold text-brand-deep">{feature.tagline}</p>}
                    <p className="mt-3 text-sm leading-relaxed text-muted">{feature.description}</p>
                  </Card>
                ))}
              </div>
            </Fragment>
          ))}

          <section id="terms" aria-labelledby="terms-title" className="scroll-mt-24">
            <h2 id="terms-title" className="mt-16 font-brand text-2xl font-bold text-brand-deep">Terms and conditions</h2>
            {shown.updatedAt && (
              <p className="mt-1 text-xs text-muted">
                Last updated {new Date(shown.updatedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
            <Card className="mt-4 p-6 sm:p-8"><Terms text={shown.terms} /></Card>
          </section>
        </>
      )}
    </div>
  );
}
