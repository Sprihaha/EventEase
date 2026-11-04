import { useEffect, useState, type FormEvent } from "react";
import { Tag, X } from "lucide-react";
import type { EventItem } from "../lib/data";
import { currency } from "../lib/store";
import { createPromoCode, fetchPromoCodes, setPromoActive, type PromoCode } from "../lib/promoApi";
import { Badge, Button, Card, Field, Input, Select } from "./ui";

const CODE_RULE = /^[A-Z0-9-]{3,32}$/;
const blank = { eventId: "", code: "", percentOff: "10", maxRedemptions: "", startsAt: "", endsAt: "" };

function status(p: PromoCode, now = Date.now()): { label: string; tone: "live" | "neutral" | "accent" } {
  if (!p.active) return { label: "Off", tone: "neutral" };
  if (p.endsAt && Date.parse(p.endsAt) <= now) return { label: "Ended", tone: "neutral" };
  if (p.startsAt && Date.parse(p.startsAt) > now) return { label: "Scheduled", tone: "accent" };
  if (p.maxRedemptions !== null && p.redemptions >= p.maxRedemptions) return { label: "Used up", tone: "neutral" };
  return { label: "Active", tone: "live" };
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

/**
 * Promotions tab: percentage-off codes for the organiser's events. Customers type the code at
 * checkout and the discount comes off every ticket in that booking.
 */
export default function PromoCodes({ events }: { events: EventItem[] }) {
  const [promos, setPromos] = useState<PromoCode[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  // Codes can only be added to events that can still sell tickets.
  const sellable = events.filter((e) => !e.isPast && e.status !== "rejected");

  useEffect(() => {
    const controller = new AbortController();
    fetchPromoCodes(controller.signal)
      .then(setPromos)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Could not load promo codes.");
        setPromos([]);
      });
    return () => controller.abort();
  }, []);

  const set = (key: keyof typeof blank) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const openForm = () => {
    setForm({ ...blank, eventId: sellable[0]?.id ?? "" });
    setFormError("");
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const code = form.code.trim().toUpperCase();
    const percent = Number(form.percentOff);
    const limit = form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null;
    if (!form.eventId) return setFormError("Choose an event.");
    if (!CODE_RULE.test(code)) return setFormError("Use 3 to 32 letters, numbers or dashes for the code.");
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) return setFormError("The discount must be a whole number from 1 to 90.");
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return setFormError("The limit must be a whole number of 1 or more, or left empty.");
    if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) return setFormError("The end date must be after the start date.");
    setSaving(true);
    setFormError("");
    try {
      const created = await createPromoCode({
        eventId: form.eventId, code, percentOff: percent, maxRedemptions: limit,
        // datetime-local values have no time zone; the server reads them as Singapore time.
        startsAt: form.startsAt || null, endsAt: form.endsAt || null,
      });
      setPromos((list) => [created, ...(list ?? [])]);
      setOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create the promo code.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (promo: PromoCode) => {
    setBusyId(promo.id);
    try {
      const updated = await setPromoActive(promo.id, !promo.active);
      setPromos((list) => (list ?? []).map((p) => (p.id === updated.id ? updated : p)));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not update the promo code.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-6">
      {open && (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-brand text-xl font-bold text-brand-deep">New promo code</h3>
              <p className="mt-1 text-sm text-muted">Customers enter the code at checkout and get this percentage off every ticket in their booking.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close new promo form"
              className="rounded-lg p-1.5 text-muted hover:bg-brand-lilac/60 hover:text-brand-deep">
              <X className="h-5 w-5" />
            </button>
          </div>
          {sellable.length === 0 ? (
            <p className="mt-5 text-sm text-muted">You have no upcoming events to add a promo code to. Create an event first.</p>
          ) : (
            <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2" noValidate>
              <div className="sm:col-span-2">
                <Field label="Event">
                  <Select value={form.eventId} onChange={(e) => set("eventId")(e.target.value)} aria-label="Event">
                    {sellable.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Code">
                <Input value={form.code} maxLength={32} placeholder="e.g. EARLYBIRD" autoComplete="off"
                  onChange={(e) => set("code")(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
              </Field>
              <Field label="Discount (% off each ticket)">
                <Input type="number" min={1} max={90} step={1} value={form.percentOff}
                  onChange={(e) => set("percentOff")(e.target.value)} />
              </Field>
              <Field label="Limit (bookings, optional)">
                <Input type="number" min={1} step={1} value={form.maxRedemptions} placeholder="No limit"
                  onChange={(e) => set("maxRedemptions")(e.target.value)} />
              </Field>
              <div className="hidden sm:block" />
              <Field label="Starts (optional)">
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt")(e.target.value)} />
              </Field>
              <Field label="Ends (optional)">
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt")(e.target.value)} />
              </Field>
              {formError && <p role="alert" className="text-sm font-semibold text-red-600 sm:col-span-2">{formError}</p>}
              <div className="flex gap-3 sm:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create promo code"}</Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-5">
          <h3 className="font-brand text-xl font-bold text-brand-deep">Promotions</h3>
          {!open && <Button size="sm" onClick={openForm}><Tag className="h-4 w-4" /> New promo</Button>}
        </div>
        {loadError && <p role="alert" className="border-b border-line px-5 py-3 text-sm font-semibold text-red-600">{loadError}</p>}
        {promos === null ? (
          <p className="p-5 text-sm text-muted">Loading promo codes…</p>
        ) : promos.length === 0 ? (
          <p className="p-5 text-sm text-muted">No promo codes yet. Press <strong>New promo</strong> to create one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-purple/10 bg-brand-purple/5 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="p-4">Code</th>
                  <th className="p-4">Event</th>
                  <th className="p-4">Discount</th>
                  <th className="p-4">Redemptions</th>
                  <th className="p-4">Valid</th>
                  <th className="p-4">Status</th>
                  <th className="p-4"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => {
                  const s = status(p);
                  return (
                    <tr key={p.id} className="border-b border-line transition-colors last:border-0 hover:bg-brand-purple/5">
                      <td className="p-4"><code className="rounded bg-brand-purple/10 px-2 py-1 font-mono text-xs font-semibold text-brand-purple">{p.code}</code></td>
                      <td className="p-4 text-muted">{p.eventTitle}</td>
                      <td className="p-4 font-semibold text-brand-deep">{p.percentOff}% off</td>
                      <td className="p-4 text-muted">
                        {p.redemptions}{p.maxRedemptions !== null && ` / ${p.maxRedemptions}`}
                        {p.discountGivenCents > 0 && <span className="block text-xs">{currency(p.discountGivenCents / 100)} off in total</span>}
                      </td>
                      <td className="p-4 text-muted">
                        {p.startsAt || p.endsAt
                          ? `${p.startsAt ? shortDate(p.startsAt) : "Now"} – ${p.endsAt ? shortDate(p.endsAt) : "no end"}`
                          : "Any time"}
                      </td>
                      <td className="p-4"><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td className="p-4 text-right">
                        <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => toggle(p)}>
                          {p.active ? "Turn off" : "Turn on"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
