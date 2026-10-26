import { Accessibility } from "lucide-react";
import type { LiveSeat } from "../../lib/ticketingApi";
import { cx } from "../ui";

// Sections and rows keep the order they first appear in; seats within a row go by number.
function groupSeats(seats: LiveSeat[]) {
  const sections = new Map<string, Map<string, LiveSeat[]>>();
  for (const seat of seats) {
    const rows = sections.get(seat.seatSection) ?? new Map<string, LiveSeat[]>();
    sections.set(seat.seatSection, rows);
    rows.set(seat.row, [...(rows.get(seat.row) ?? []), seat]);
  }
  return [...sections].map(([name, rows]) => ({
    name,
    rows: [...rows].map(([row, rowSeats]) => ({ row, seats: rowSeats.sort((a, b) => a.number - b.number) })),
  }));
}

export function SeatMap({ seats, selected, onToggle, disabled = false }: {
  seats: LiveSeat[]; selected: string[]; onToggle: (seat: LiveSeat) => void; disabled?: boolean;
}) {
  const sections = groupSeats(seats);
  return (
    <div>
      <div className="mx-auto mb-6 w-2/3 rounded-t-[100%] border-t-2 border-brand-purple/40 py-2 text-center font-brand text-xs font-bold uppercase tracking-widest text-brand-purple">
        Stage
      </div>
      <div className="overflow-x-auto space-y-6">
        {sections.map((section) => (
          <section key={section.name} aria-label={section.name} className="space-y-3">
            {sections.length > 1 && (
              <h3 className="text-center text-xs font-bold uppercase tracking-widest text-muted">{section.name}</h3>
            )}
            {section.rows.map(({ row, seats: rowSeats }) => (
              <div key={row} className="flex items-center justify-center gap-2">
                <span className="w-6 text-sm font-bold text-muted">{row}</span>
                {rowSeats.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Seat ${s.label}, ${s.categoryName}, ${s.seatSection}, ${s.status}`}
                    aria-pressed={selected.includes(s.id)}
                    disabled={disabled || (s.status !== "AVAILABLE" && !selected.includes(s.id))}
                    onClick={() => onToggle(s)}
                    title={`${s.label} · ${s.categoryName}${s.isAccessible ? " (Wheelchair accessible)" : ""} · S$${(s.priceCents / 100).toFixed(2)} · ${s.status}`}
                    className={cx(
                      "h-10 w-10 rounded-lg border text-xs font-bold transition disabled:cursor-not-allowed cursor-pointer",
                      selected.includes(s.id)
                        ? "bg-brand-orange text-white border-brand-orange shadow-md"
                        : s.status === "AVAILABLE"
                          ? s.isAccessible
                            ? "bg-brand-purple text-white border-brand-purple/40 hover:ring-2 hover:ring-brand-purple shadow-sm"
                            : "bg-brand-lilac text-brand-purple border-brand-purple/20 hover:ring-2 hover:ring-brand-purple"
                          : "bg-stone-200 text-stone-500 opacity-60",
                    )}
                  >
                    {s.isAccessible ? <Accessibility className="mx-auto h-4 w-4" /> : s.number}
                  </button>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-muted">
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-brand-lilac border border-brand-purple/20" /> Available
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-brand-purple flex items-center justify-center text-white">
            <Accessibility className="h-3 w-3" />
          </span> Accessible
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-brand-orange" /> Selected
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-stone-200 opacity-60" /> Unavailable
        </span>
      </div>
    </div>
  );
}

export default SeatMap;
