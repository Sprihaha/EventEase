import { useState } from "react";
import { Armchair, MapPin } from "lucide-react";
import type { EventItem } from "../lib/data";
import { fmtDate } from "../lib/store";
import { SeatMap } from "./SeatMap";
import { Badge, Card, Select } from "./ui";

export function OperationsSeatMap({
  events,
  eyebrow,
}: {
  events: EventItem[];
  eyebrow: string;
}) {
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? "");
  const selected = events.find((event) => event.id === selectedId) ?? events[0];

  if (!selected) {
    return (
      <Card className="p-10 text-center">
        <Armchair className="mx-auto h-8 w-8 text-muted" />
        <p className="mt-3 text-muted">No event seat maps are available.</p>
      </Card>
    );
  }

  const sold = selected.tiers.reduce((sum, tier) => sum + tier.sold, 0);
  const capacity = selected.tiers.reduce((sum, tier) => sum + tier.total, 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_1fr]">
      <Card className="h-max p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium">Event</span>
          <Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
            {events.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </Select>
        </label>
        <div className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
          <div>
            <div className="text-xs text-muted">Venue</div>
            <div className="mt-1 flex items-start gap-1.5 font-medium">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              {selected.venue}, {selected.city}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Event date</div>
            <div className="mt-1 font-medium">{fmtDate(selected.date)}</div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Seats sold</span>
            <Badge tone={sold / Math.max(capacity, 1) > 0.8 ? "warn" : "live"}>{sold} / {capacity}</Badge>
          </div>
        </div>
      </Card>
      <Card className="p-5 sm:p-7">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">{selected.title}</h2>
            <p className="mt-1 text-sm text-muted">Operational view of sold and available inventory.</p>
          </div>
          <Badge tone="accent"><Armchair className="h-3 w-3" /> Live inventory</Badge>
        </div>
        <SeatMap ev={selected} selected={[]} onToggle={() => undefined} />
      </Card>
    </div>
  );
}
