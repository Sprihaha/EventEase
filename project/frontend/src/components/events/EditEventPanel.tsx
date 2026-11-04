import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import {
  backendEventCategories,
  fetchOrganiserEvent,
  updateOrganiserEvent,
  type OrganiserEventChanges,
  type OrganiserEventDetails,
} from "../../lib/backendApi";
import type { EventItem } from "../../lib/data";
import { useStore } from "../../lib/store";
import { Button, Field, Input, Select, Textarea } from "../ui";
import TicketTierEditor from "../TicketTierEditor";
import PosterField from "./PosterField";

const label = (code: string) => {
  const words = code.toLowerCase().split("_");
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
};

/** "2026-12-01T12:00:00Z" → "2026-12-01T20:00", the Singapore time a datetime-local input shows. */
function toSingaporeInput(iso: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

type Form = { category: string; shortDescription: string; description: string; startAt: string; endAt: string; imageUrl: string };

const toForm = (e: OrganiserEventDetails): Form => ({
  category: e.category, shortDescription: e.shortDescription ?? "", description: e.description ?? "",
  startAt: toSingaporeInput(e.startAt), endAt: toSingaporeInput(e.endAt), imageUrl: e.imageUrl ?? "",
});

/**
 * Edit an event after it was created: everything except its name and venue (ticket holders chose
 * the event by those), plus the ticket tiers. Ticket holders are emailed if the date or time changes.
 */
export default function EditEventPanel({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const { refreshManagedEvents } = useStore();
  const [original, setOriginal] = useState<OrganiserEventDetails | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchOrganiserEvent(event.id), backendEventCategories()])
      .then(([details, cats]) => {
        if (!active) return;
        setOriginal(details);
        setForm(toForm(details));
        setCategories(cats);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Could not load this event."));
    return () => { active = false; };
  }, [event.id]);

  const set = (key: keyof Form) => (value: string) => {
    setSaved("");
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !original) return;
    const before = toForm(original);
    if (!form.startAt || !form.endAt) return setError("Enter both a start and an end time.");
    if (form.endAt <= form.startAt) return setError("The event must end after it starts.");
    // Send only what changed, so untouched fields are never rewritten.
    const changes: OrganiserEventChanges = {};
    if (form.category !== before.category) changes.category = form.category;
    if (form.shortDescription !== before.shortDescription) changes.shortDescription = form.shortDescription.trim() || null;
    if (form.description !== before.description) changes.description = form.description.trim() || null;
    if (form.imageUrl !== before.imageUrl) changes.imageUrl = form.imageUrl.trim() || null;
    // Times are Singapore time without a zone; the server reads them that way.
    if (form.startAt !== before.startAt) changes.startAt = form.startAt;
    if (form.endAt !== before.endAt) changes.endAt = form.endAt;
    if (!Object.keys(changes).length) return setSaved("Nothing to save: no changes yet.");
    const datesChanged = "startAt" in changes || "endAt" in changes;
    setSaving(true);
    setError("");
    try {
      const updated = await updateOrganiserEvent(event.id, changes);
      setOriginal(updated);
      setForm(toForm(updated));
      setSaved(datesChanged && event.status === "published"
        ? "Saved. Ticket holders have been emailed the new date and time."
        : "Saved.");
      await refreshManagedEvents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-brand-purple/15 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-brand text-lg font-bold text-brand-deep">Edit event</h4>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {!form ? (
        error ? <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>
          : <p className="mt-3 text-sm text-muted">Loading event details…</p>
      ) : (
        <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
          <div className="rounded-xl bg-mist/60 p-3 text-sm sm:col-span-2">
            <p className="flex items-center gap-1.5 font-semibold text-brand-deep"><Lock className="h-3.5 w-3.5" /> {original?.title}</p>
            <p className="mt-0.5 text-muted">{original?.venueName} · The name and venue cannot be changed.</p>
          </div>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set("category")(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </Select>
          </Field>
          <div className="hidden sm:block" />
          <Field label="Starts">
            <Input type="datetime-local" value={form.startAt} onChange={(e) => set("startAt")(e.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="datetime-local" value={form.endAt} onChange={(e) => set("endAt")(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <PosterField value={form.imageUrl} onChange={set("imageUrl")} disabled={saving} />
          </div>
          <div className="sm:col-span-2">
            <Field label="Short description (optional)">
              <Input maxLength={300} value={form.shortDescription} onChange={(e) => set("shortDescription")(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea rows={4} maxLength={5000} value={form.description} onChange={(e) => set("description")(e.target.value)} />
            </Field>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{error}</p>}
          {saved && <p role="status" className="text-sm font-semibold text-emerald-700 sm:col-span-2">{saved}</p>}
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}
      {event.tiers.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <TicketTierEditor event={event} />
        </div>
      )}
    </div>
  );
}
