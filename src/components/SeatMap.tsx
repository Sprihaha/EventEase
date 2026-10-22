import type { LiveSeat } from "../lib/ticketingApi";
import { cx } from "./ui";

export function SeatMap({ seats, selected, onToggle, disabled = false }: {
  seats: LiveSeat[]; selected: string[]; onToggle: (seat: LiveSeat) => void; disabled?: boolean;
}) {
  const rows = [...new Set(seats.map(s => s.row))];
  return <div>
    <div className="mx-auto mb-6 w-2/3 rounded-t-[100%] border-t-2 border-brand-purple/40 py-2 text-center text-xs font-bold uppercase tracking-widest text-brand-purple">Stage</div>
    <div className="overflow-x-auto space-y-3">
      {rows.map(row => <div key={row} className="flex items-center justify-center gap-2">
        <span className="w-6 text-sm font-bold">{row}</span>
        {seats.filter(s => s.row === row).map(s => <button key={s.id} type="button"
          aria-label={`Seat ${s.label}, ${s.categoryName}, ${s.seatSection}, ${s.status}`}
          aria-pressed={selected.includes(s.id)} disabled={disabled || (s.status !== "AVAILABLE" && !selected.includes(s.id))}
          onClick={() => onToggle(s)} title={`${s.label} · ${s.categoryName} · S$${(s.priceCents/100).toFixed(2)} · ${s.status}`}
          className={cx("h-10 w-10 rounded-lg border text-xs font-bold transition disabled:cursor-not-allowed",
            selected.includes(s.id) ? "bg-brand-orange text-white border-brand-orange" :
            s.status === "AVAILABLE" ? "bg-brand-lilac text-brand-purple border-brand-purple/20 hover:ring-2" : "bg-stone-200 text-stone-500 opacity-60")}>{s.label}</button>)}
      </div>)}
    </div>
    <p className="mt-5 text-center text-xs text-muted">Purple: available · Orange: selected · Grey: held, sold or unavailable</p>
    <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-muted">{[...new Set(seats.map(s => `${s.categoryName} · ${s.seatSection} · S$${(s.priceCents/100).toFixed(2)}`))].map(t => <span key={t}>{t}</span>)}</div>
  </div>;
}
