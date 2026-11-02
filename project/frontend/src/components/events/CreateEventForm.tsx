import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, History, Plus, Trash2 } from "lucide-react";
import {
  backendEventCategories,
  backendListVenues,
  backendTicketCategoryTypes,
  type NewEventInput,
  type Venue,
} from "../../lib/backendApi";
import { Badge, Button, Card, Eyebrow, Field, Input, Select, Textarea } from "../ui";
import { useStore } from "../../lib/store";
import { currentOrganisationId } from "../../lib/currentOrganisation";
import { clearDraft, draftKey, emptyDetails, hasContent, readDraft, writeDraft, type TierDraft } from "./createEventDraft";


// Backend values are upper-case codes such as "SPECIAL_ASSISTANCE"; show them as "Special assistance".
function label(code: string) {
  const words = code.toLowerCase().split("_");
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
}

export default function CreateEventForm({ onCreate }: { onCreate: (input: NewEventInput) => Promise<void> }) {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [tierTypes, setTierTypes] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");

  const { user } = useStore();
  const storageKey = draftKey(user?.id, currentOrganisationId());
  // Restore any unsaved draft once, when the form opens.
  const [restored] = useState(() => readDraft(storageKey));
  const [showRestored, setShowRestored] = useState(restored !== null);

  const [details, setDetails] = useState(restored?.details ?? emptyDetails);
  const [venueId, setVenueId] = useState(restored?.venueId ?? "");
  const [tiers, setTiers] = useState<TierDraft[]>(restored?.tiers ?? []);
  const [nextKey, setNextKey] = useState(restored?.nextKey ?? 1);
  // section id -> tier key ("" = not on sale)
  const [assignment, setAssignment] = useState<Record<string, number | "">>(restored?.assignment ?? {});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([backendListVenues(), backendEventCategories(), backendTicketCategoryTypes()])
      .then(([venueList, categoryList, typeList]) => {
        setVenues(venueList);
        setCategories(categoryList);
        setTierTypes(typeList);
      })
      .catch((cause) => setLoadError(messageOf(cause)));
  }, []);

  const venue = useMemo(() => venues?.find((v) => v.id === venueId) ?? null, [venues, venueId]);
  const dirty = !done && hasContent({ details, venueId, tiers });

  // Autosave on every change, so switching dashboard tabs or refreshing keeps the work.
  useEffect(() => {
    if (!done) writeDraft(storageKey, { details, venueId, tiers, nextKey, assignment });
  }, [storageKey, done, details, venueId, tiers, nextKey, assignment]);

  // A restored draft may name a venue that has since been removed.
  useEffect(() => {
    if (venues && venueId && !venues.some((v) => v.id === venueId)) {
      setVenueId("");
      setAssignment({});
    }
  }, [venues, venueId]);

  // Closing the browser tab drops sessionStorage, so warn before that happens.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const setDetail = (key: keyof typeof emptyDetails, value: string) => setDetails((d) => ({ ...d, [key]: value }));

  const chooseVenue = (id: string) => {
    setVenueId(id);
    setAssignment({});
  };

  const addTier = () => {
    setTiers((all) => [...all, { key: nextKey, name: "", type: tierTypes[0] ?? "", price: "" }]);
    setNextKey((k) => k + 1);
  };
  const updateTier = (key: number, change: Partial<TierDraft>) =>
    setTiers((all) => all.map((t) => (t.key === key ? { ...t, ...change } : t)));
  const removeTier = (key: number) => {
    setTiers((all) => all.filter((t) => t.key !== key));
    setAssignment((current) =>
      Object.fromEntries(Object.entries(current).map(([section, tier]) => [section, tier === key ? "" : tier])),
    );
  };

  const seatsForTier = (key: number) =>
    venue?.sections.filter((s) => assignment[s.id] === key).reduce((sum, s) => sum + s.seatCount, 0) ?? 0;
  const seatsOnSale = tiers.reduce((sum, t) => sum + seatsForTier(t.key), 0);

  const problems: string[] = [];
  if (details.title.trim().length < 3) problems.push("Enter an event title (at least 3 characters).");
  if (!details.category) problems.push("Choose a category.");
  if (!details.startAt || !details.endAt) problems.push("Enter the start and end date & time.");
  else if (new Date(details.endAt) <= new Date(details.startAt)) problems.push("The event must end after it starts.");
  if (!venue) problems.push("Choose a venue.");
  if (tiers.length === 0) problems.push("Add at least one ticket tier.");
  tiers.forEach((t, i) => {
    const name = t.name.trim() || `Tier ${i + 1}`;
    if (!t.name.trim()) problems.push(`Tier ${i + 1} needs a name.`);
    if (!t.type) problems.push(`${name} needs a type.`);
    if (t.price === "" || Number.isNaN(Number(t.price)) || Number(t.price) < 0) problems.push(`${name} needs a valid price.`);
    if (venue && seatsForTier(t.key) === 0) problems.push(`Assign at least one section to ${name}.`);
  });

  const submit = async () => {
    if (problems.length > 0 || !venue || saving) return;
    setSaving(true);
    setError("");
    try {
      await onCreate({
        title: details.title.trim(),
        category: details.category,
        description: details.description.trim(),
        venueId: venue.id,
        startAt: new Date(details.startAt).toISOString(),
        endAt: new Date(details.endAt).toISOString(),
        imageUrl: details.imageUrl.trim(),
        tiers: tiers.map((t) => ({
          name: t.name.trim(),
          type: t.type,
          priceCents: Math.round(Number(t.price) * 100),
          sectionIds: venue.sections.filter((s) => assignment[s.id] === t.key).map((s) => s.id),
        })),
      });
      clearDraft(storageKey);
      setDone(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };

  const startAgain = () => {
    clearDraft(storageKey);
    setDetails(emptyDetails);
    setVenueId("");
    setTiers([]);
    setNextKey(1);
    setAssignment({});
    setError("");
    setShowRestored(false);
    setDone(false);
  };

  const discardDraft = () => {
    if (window.confirm("Discard this draft? Everything you entered will be cleared.")) startAgain();
  };

  if (done) {
    return (
      <Card className="p-10 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-live" />
        <h3 className="mt-3 font-brand text-2xl font-bold text-brand-deep">Event submitted</h3>
        <p className="mt-1 text-muted">
          Your event is now <Badge tone="warn">pending</Badge> admin approval. Seats become bookable once it is
          approved.
        </p>
        <Button className="mt-5" onClick={startAgain}>
          Create another
        </Button>
      </Card>
    );
  }

  if (loadError) return <Card className="p-6 text-danger" role="alert">{loadError}</Card>;
  if (venues === null) return <Card className="p-6 text-muted">Loading your venues…</Card>;
  if (venues.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="font-semibold">Set up a venue first</p>
        <p className="mt-1 text-sm text-muted">
          Open <strong>Venue setup</strong> in the sidebar and upload your venue layout. You can then create events
          there.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      {showRestored && restored && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-purple/20 bg-brand-lilac/40 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-brand-deep">
            <History className="h-4 w-4 text-brand-purple" />
            We restored your unsaved draft from {new Date(restored.savedAt).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })}.
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRestored(false)}>Keep editing</Button>
            <Button variant="outline" size="sm" onClick={discardDraft}>Start over</Button>
          </span>
        </div>
      )}
      <Eyebrow>New event</Eyebrow>
      <h3 className="mt-1 font-brand text-2xl font-bold text-brand-deep">Event details</h3>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Event title">
            <Input value={details.title} onChange={(e) => setDetail("title", e.target.value)} />
          </Field>
        </div>
        <Field label="Category">
          <Select value={details.category} onChange={(e) => setDetail("category", e.target.value)}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Venue">
          <Select value={venueId} onChange={(e) => chooseVenue(e.target.value)}>
            <option value="">Choose…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.area} ({v.seatCount} seats)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starts">
          <Input type="datetime-local" value={details.startAt} onChange={(e) => setDetail("startAt", e.target.value)} />
        </Field>
        <Field label="Ends">
          <Input type="datetime-local" value={details.endAt} onChange={(e) => setDetail("endAt", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Image URL (optional)">
            <Input type="url" value={details.imageUrl} onChange={(e) => setDetail("imageUrl", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description">
            <Textarea rows={3} value={details.description} onChange={(e) => setDetail("description", e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Ticket tiers</div>
        <Button variant="outline" size="sm" onClick={addTier} disabled={tierTypes.length === 0}>
          <Plus className="h-4 w-4" /> Add tier
        </Button>
      </div>
      {tiers.length === 0 && <p className="mt-2 text-sm text-muted">Add a tier for each price you will sell at.</p>}
      <div className="mt-3 space-y-3">
        {tiers.map((tier) => (
          <div key={tier.key} className="grid items-end gap-3 rounded-xl bg-mist/60 p-3 sm:grid-cols-[2fr_1.5fr_1fr_auto_auto]">
            <Field label="Tier name">
              <Input value={tier.name} onChange={(e) => updateTier(tier.key, { name: e.target.value })} />
            </Field>
            <Field label="Type">
              <Select value={tier.type} onChange={(e) => updateTier(tier.key, { type: e.target.value })}>
                {tierTypes.map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Price">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={tier.price}
                onChange={(e) => updateTier(tier.key, { price: e.target.value })}
              />
            </Field>
            <Badge tone={seatsForTier(tier.key) > 0 ? "accent" : "neutral"}>{seatsForTier(tier.key)} seats</Badge>
            <Button variant="ghost" size="sm" aria-label="Remove tier" onClick={() => removeTier(tier.key)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {venue && (
        <div className="mt-8">
          <div className="text-sm font-semibold">Sections at {venue.name}</div>
          <p className="mt-1 text-sm text-muted">Choose which tier each section is sold in.</p>
          <div className="mt-3 space-y-2">
            {venue.sections.map((section) => (
              <div
                key={section.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist/60 px-3 py-2.5 text-sm"
              >
                <span>
                  <span className="font-medium">{section.name}</span>
                  <span className="text-muted"> · {section.seatCount} seats</span>
                </span>
                <Select
                  value={String(assignment[section.id] ?? "")}
                  onChange={(e) =>
                    setAssignment((current) => ({
                      ...current,
                      [section.id]: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">Not on sale</option>
                  {tiers.map((t, i) => (
                    <option key={t.key} value={t.key}>
                      {t.name.trim() || `Tier ${i + 1}`}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            {seatsOnSale} of {venue.seatCount} seats on sale.
          </p>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-muted">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button disabled={problems.length > 0 || saving} onClick={() => void submit()}>
          {saving ? "Saving…" : "Submit for approval"}
        </Button>
        {dirty && (
          <>
            <Button variant="ghost" onClick={discardDraft} disabled={saving}>
              Discard draft
            </Button>
            <span className="text-xs text-muted" aria-live="polite">
              Draft saved in this browser tab. You can switch tabs and come back.
            </span>
          </>
        )}
      </div>
    </Card>
  );
}
