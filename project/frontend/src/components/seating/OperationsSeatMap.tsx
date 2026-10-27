import { useEffect, useState } from "react";
import { Armchair, MapPin } from "lucide-react";
import type { EventItem } from "../../lib/data";
import { fmtDate } from "../../lib/store";
import { fetchSeats, type LiveSeat } from "../../lib/ticketingApi";
import { SeatMap } from "./SeatMap";
import { Badge, Card, Select } from "../ui";

export function OperationsSeatMap({
  events,
  eyebrow,
}: {
  events: EventItem[];
  eyebrow: string;
}) {
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? "");
  const selected = events.find((event) => event.id === selectedId) ?? events[0];

  const [seats, setSeats] = useState<LiveSeat[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setSeats([]); setError("");
    if (selected) fetchSeats(selected.id, controller.signal).then(setSeats).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Inventory unavailable.");
    });
    return () => controller.abort();
  }, [selected?.id]);
  if (!selected) {
    return (
      <Card className="p-10 text-center">
        <Armchair className="mx-auto h-8 w-8 text-muted" />
        <p className="mt-3 text-muted">No event seat maps are available.</p>
      </Card>
    );
  }

  const sold = seats.filter(s => s.status === "SOLD").length;
  const capacity = seats.length;

  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_1fr]">
      <Card className="h-max p-5">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-orange">{eyebrow}</div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-brand-deep">Event</span>
          <Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
            {events.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </Select>
        </label>
        <div className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
          <div>
            <div className="text-xs text-muted">Venue</div>
            <div className="mt-1 flex items-start gap-1.5 font-medium text-brand-deep">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
              {selected.venue}, {selected.city}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Date & time</div>
            <div className="mt-1 font-medium text-brand-deep">{fmtDate(selected.date)} · {selected.time}</div>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-muted">Tickets sold</span>
            <span className="font-bold text-brand-deep">{sold} / {capacity}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Availability</span>
            <Badge tone={sold < capacity ? "live" : "warn"}>
              {sold < capacity ? `${capacity - sold} left` : "Sold out"}
            </Badge>
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 className="font-brand text-xl font-bold text-brand-deep">Operations seating status</h2>
            <p className="mt-1 text-sm text-muted">Real-time live seat inventory for {selected.title}.</p>
          </div>
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
        <SeatMap seats={seats} selected={[]} onToggle={() => {}} disabled />
      </Card>
    </div>
  );
}

export default OperationsSeatMap;
