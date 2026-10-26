import { useState, useRef, useEffect } from "react"
import { Search, X, ChevronDown } from "lucide-react"
import { cx } from "../../ui"
import type { SearchableOption } from "../types"

export interface SearchableComboboxProps {
  label: string
  placeholder: string
  value: string
  onChange: (val: string) => void
  options: SearchableOption[]
  allowCustom?: boolean
  disabled?: boolean
}

export function SearchableCombobox({
  label,
  placeholder,
  value,
  onChange,
  options,
  allowCustom = true,
  disabled = false,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(
    (opt) => opt.value === value || opt.label === value,
  )
  const displayValue = isOpen
    ? query
    : selectedOption
      ? selectedOption.label
      : value

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (!value) {
      setQuery("")
    }
  }, [value])

  const filteredOptions = options.filter((opt) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      opt.label.toLowerCase().includes(q) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
      opt.value.toLowerCase().includes(q)
    )
  })

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-[11px] font-bold text-brand-deep">
        {label}
      </label>
      <div
        className={cx(
          "relative flex items-center rounded-xl border transition-all",
          disabled
            ? "cursor-not-allowed bg-stone-100 border-stone-200 opacity-60 pointer-events-none"
            : isOpen
              ? "border-brand-purple ring-2 ring-brand-purple/20 bg-white"
              : "border-brand-line bg-brand-warm/30 hover:border-brand-purple/50",
        )}
      >
        <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-muted pointer-events-none" />
        <input
          type="text"
          disabled={disabled}
          value={disabled ? "" : displayValue}
          onFocus={(e) => {
            if (disabled) return
            setQuery(selectedOption ? selectedOption.label : value)
            setIsOpen(true)
            e.target.select()
          }}
          onChange={(e) => {
            if (disabled) return
            const next = e.target.value
            setQuery(next)
            if (allowCustom) {
              onChange(next)
            }
            if (!isOpen) setIsOpen(true)
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-2.5 py-2 text-xs font-semibold text-brand-deep outline-none placeholder:font-normal placeholder:text-muted disabled:cursor-not-allowed"
        />
        {!disabled && value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange("")
              setQuery("")
            }}
            className="p-1 text-muted hover:text-brand-deep cursor-pointer"
            title="Clear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            if (disabled) return
            if (!isOpen) {
              setQuery(selectedOption ? selectedOption.label : value)
            }
            setIsOpen(!isOpen)
          }}
          className="mr-2 p-1 text-muted hover:text-brand-deep transition-transform disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronDown
            className={cx(
              "h-3.5 w-3.5 transition-transform duration-200",
              isOpen && "rotate-180 text-brand-purple",
            )}
          />
        </button>
      </div>

      {/* Dropdown Popover */}
      {!disabled && isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-brand-purple/20 bg-white p-1 shadow-xl backdrop-blur-md">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value || opt.label === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setQuery(opt.label)
                    setIsOpen(false)
                  }}
                  className={cx(
                    "cursor-pointer flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                    isSelected
                      ? "bg-brand-purple text-white font-bold"
                      : "text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span
                      className={cx(
                        "ml-2 text-[10px] shrink-0",
                        isSelected ? "text-white/80" : "text-muted",
                      )}
                    >
                      {opt.sublabel}
                    </span>
                  )}
                </button>
              )
            })
          ) : (
            <div className="px-3 py-2 text-center text-[11px] text-muted">
              {allowCustom && query ? (
                <span>
                  Using custom:{" "}
                  <strong className="text-brand-deep font-bold">
                    &quot;{query}&quot;
                  </strong>
                </span>
              ) : (
                <span>No matching options</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
