import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Field, Input } from "./ui";
import { useStore, currency } from "../lib/store";
import type { EventItem, TicketTier } from "../lib/data";

// Change a tier's price and seats on an approved event. The backend refuses a lower price once
// tickets are sold, and fewer seats than are already sold.
function TierRow({ eventId, tier }: { eventId: string; tier: TicketTier }) {
  const { updateTier } = useStore();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(tier.price));
  const [seats, setSeats] = useState(String(tier.total));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await updateTier(eventId, tier.id, { priceCents: Math.round(Number(price) * 100), quantity: Number(seats) });
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this tier.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-brand-deep">{tier.name}</span>
        <span className="flex items-center gap-3 text-muted">
          {currency(tier.price)} · {tier.total} seats
          <Button size="sm" variant="ghost" aria-label={`Edit ${tier.name}`} onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-purple/15 p-3">
      <div className="font-medium text-brand-deep">{tier.name}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Price (S$)">
          <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Seats">
          <Input type="number" min={Math.max(tier.sold, 1)} step={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
        </Field>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function TicketTierEditor({ event }: { event: EventItem }) {
  return (
    <details className="mt-4 rounded-xl bg-mist/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-brand-deep">Manage ticket tiers</summary>
      <div className="mt-3 space-y-2">
        {event.tiers.map((tier) => <TierRow key={tier.id} eventId={event.id} tier={tier} />)}
      </div>
    </details>
  );
}
