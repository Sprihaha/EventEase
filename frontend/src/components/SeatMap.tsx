import { useMemo } from "react";
import type { EventItem } from "../lib/data";
import { cx } from "./ui";

// Deterministic "already sold" seats so the map is stable between renders.
function soldSet(ev: EventItem) {
  const set = new Set<string>();
  const target = ev.tiers.reduce((a, t) => a + t.sold, 0);
  let h = 7;
  for (const c of ev.id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  let count = 0;
  let i = 0;
  while (count < target && i < ev.rows * ev.cols * 4) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const r = h % ev.rows;
    const c = (h >> 5) % ev.cols;
    const id = String.fromCharCode(65 + r) + (c + 1);
    if (!set.has(id)) {
      set.add(id);
      count++;
    }
    i++;
  }
  return set;
}

// Rows near the front → VIP, middle → Standard, back → Concession
function tierForRow(ev: EventItem, row: number) {
  const t = ev.rows / 3;
  if (row < t) return ev.tiers.find((x) => x.name === "VIP") ?? ev.tiers[0];
  if (row < t * 2) return ev.tiers.find((x) => x.name === "Standard") ?? ev.tiers[0];
  return ev.tiers.find((x) => x.name === "Concession") ?? ev.tiers[ev.tiers.length - 1];
}

export function SeatMap({
  ev,
  selected,
  onToggle,
}: {
  ev: EventItem;
  selected: string[];
  onToggle: (seat: string, tier: string, price: number) => void;
}) {
  const sold = useMemo(() => soldSet(ev), [ev]);
  const rows = Array.from({ length: ev.rows });
  const cols = Array.from({ length: ev.cols });

  return (
    <div>
      <div className="mb-6 flex items-center justify-center">
        <div className="w-2/3 rounded-t-[100%] border-t-2 border-brand-purple/40 py-2.5 text-center font-brand text-xs font-bold uppercase tracking-[0.3em] text-brand-purple">
          Stage
        </div>
      </div>
      <div className="no-scrollbar overflow-x-auto">
        <div className="mx-auto w-max space-y-1.5">
          {rows.map((_, r) => {
            const tier = tierForRow(ev, r);
            const label = String.fromCharCode(65 + r);
            return (
              <div key={r} className="flex items-center gap-1.5">
                <span className="w-4 text-xs font-bold text-muted">{label}</span>
                {cols.map((__, c) => {
                  const id = label + (c + 1);
                  const isSold = sold.has(id);
                  const isSel = selected.includes(id);
                  return (
                    <button
                      key={c}
                      disabled={isSold}
                      onClick={() => onToggle(id, tier.name, tier.price)}
                      title={`${id} · ${tier.name} · S$${tier.price}`}
                      className={cx(
                        "h-6 w-6 rounded-md text-[9px] font-bold transition-all cursor-pointer",
                        isSold && "cursor-not-allowed bg-brand-purple/10 text-transparent opacity-40",
                        !isSold &&
                          !isSel &&
                          tier.name === "VIP" &&
                          "bg-brand-lilac text-brand-purple hover:ring-2 hover:ring-brand-purple",
                        !isSold &&
                          !isSel &&
                          tier.name === "Standard" &&
                          "bg-mist text-brand-deep hover:ring-2 hover:ring-brand-purple",
                        !isSold &&
                          !isSel &&
                          tier.name === "Concession" &&
                          "bg-stone-100 text-muted hover:ring-2 hover:ring-brand-purple",
                        isSel && "bg-brand-orange text-white ring-2 ring-brand-orange shadow-md",
                      )}
                    >
                      {c + 1}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-muted">
        {ev.tiers.map((t) => (
          <span key={t.id} className="flex items-center gap-1.5">
            <span
              className={cx(
                "h-3 w-3 rounded",
                t.name === "VIP" && "bg-brand-lilac border border-brand-purple/30",
                t.name === "Standard" && "bg-mist border border-brand-purple/20",
                t.name === "Concession" && "bg-stone-100 border border-stone-300",
              )}
            />
            {t.name} · S${t.price}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-brand-orange shadow-xs" /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-brand-purple/10 opacity-50" /> Sold
        </span>
      </div>
    </div>
  );
}
