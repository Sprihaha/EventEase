import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { useStore } from "../lib/store";
import { categoryList, type Category } from "../lib/data";
import { EventCard } from "../components/EventCard";
import { Eyebrow, Input, Select, cx } from "../components/ui";

export default function Browse() {
  const { events } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "All">((params.get("cat") as Category) ?? "All");
  const [sort, setSort] = useState("date");
  const [maxPrice, setMaxPrice] = useState(400);

  const results = useMemo(() => {
    let list = events.filter((e) => e.status === "published");
    if (cat !== "All") list = list.filter((e) => e.category === cat);
    if (q) list = list.filter((e) => (e.title + e.venue + e.city).toLowerCase().includes(q.toLowerCase()));
    list = list.filter((e) => Math.min(...e.tiers.map((t) => t.price)) <= maxPrice);
    list = [...list].sort((a, b) => {
      if (sort === "price") return Math.min(...a.tiers.map((t) => t.price)) - Math.min(...b.tiers.map((t) => t.price));
      return +new Date(a.date) - +new Date(b.date);
    });
    return list;
  }, [events, cat, q, sort, maxPrice]);

  const setCategory = (c: Category | "All") => {
    setCat(c);
    if (c === "All") setParams({});
    else setParams({ cat: c });
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <Eyebrow>Discover</Eyebrow>
      <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight">Browse events</h1>
      <p className="mt-3 max-w-lg text-muted">
        Filter by category, date and price. Interactive seat maps and real-time availability on
        every listing.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className="h-max rounded-3xl border border-line p-5 lg:sticky lg:top-24">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Search</div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name or venue"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Category</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["All", ...categoryList] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cx(
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    cat === c ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-ink hover:text-ink",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
              <span>Max price</span>
              <span className="text-accent">S${maxPrice}</span>
            </div>
            <input
              type="range"
              min={20}
              max={400}
              step={10}
              value={maxPrice}
              onChange={(e) => setMaxPrice(+e.target.value)}
              className="mt-3 w-full accent-accent"
            />
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sort by</div>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="mt-2">
              <option value="date">Date — soonest</option>
              <option value="price">Price — lowest</option>
            </Select>
          </div>
        </aside>

        {/* Results */}
        <div>
          <div className="mb-5 text-sm text-muted">{results.length} events</div>
          {results.length ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((ev) => (
                <EventCard key={ev.id} ev={ev} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-line p-16 text-center text-muted">
              No events match your filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
