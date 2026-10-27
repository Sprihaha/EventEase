import { cx } from "../../ui"
import type { FilterType } from "../types"

interface FeedFilterBarProps {
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
}

const filterOptions: readonly { id: FilterType; label: string }[] = [
  { id: "all", label: "For you" },
  { id: "following", label: "Following" },
  { id: "views", label: "Seat views" },
  { id: "questions", label: "Questions" },
] as const

export function FeedFilterBar({ filter, onFilterChange }: FeedFilterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
      {filterOptions.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onFilterChange(f.id)}
          className={cx(
            "cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold whitespace-nowrap transition-all",
            filter === f.id
              ? "bg-brand-lilac text-brand-purple shadow-sm ring-1 ring-brand-purple/30 font-extrabold"
              : "text-muted hover:bg-brand-lilac/40 hover:text-brand-deep",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
