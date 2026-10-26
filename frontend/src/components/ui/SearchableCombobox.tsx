import { useState, useRef, useEffect, type ReactNode } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { cx } from "../ui";

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: ReactNode;
}

export interface SearchableComboboxProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  options: SearchableOption[];
  allowCustom?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

export function SearchableCombobox({
  label,
  placeholder,
  value,
  onChange,
  options,
  allowCustom = true,
  disabled = false,
  clearable = false,
  className,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(
    (opt) => opt.value === value || opt.label === value,
  );
  const displayValue = isOpen
    ? query
    : selectedOption
      ? selectedOption.label
      : value;

  const activePlaceholder = isOpen && selectedOption
    ? selectedOption.label
    : placeholder;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!value) {
      setQuery("");
    }
  }, [value]);

  const filteredOptions = options.filter((opt) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      opt.label.toLowerCase().includes(q) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  });

  return (
    <div
      ref={containerRef}
      className={cx("relative w-full", isOpen ? "z-40" : "z-10", className)}
    >
      <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
          <Search className="h-4 w-4" />
        </div>
        <input
          type="text"
          disabled={disabled}
          value={displayValue}
          placeholder={activePlaceholder}
          onClick={() => {
            if (!isOpen) {
              setIsOpen(true);
              setQuery("");
            }
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            if (allowCustom) {
              onChange(e.target.value);
            }
          }}
          className={cx(
            "w-full rounded-2xl border border-brand-purple/20 bg-white/95 py-2.5 pl-10 pr-10 text-sm font-medium text-brand-deep shadow-xs outline-none transition placeholder:text-muted/60 focus:border-brand-purple focus:ring-4 focus:ring-brand-purple/15 disabled:bg-neutral-100 disabled:opacity-60 cursor-pointer",
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1">
          {clearable && value && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setQuery("");
                setIsOpen(false);
              }}
              className="cursor-pointer rounded-full p-1 text-muted hover:bg-neutral-100 hover:text-brand-deep transition"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setIsOpen((prev) => !prev);
              setQuery("");
            }}
            className="cursor-pointer text-muted hover:text-brand-purple transition"
            aria-label="Toggle options"
          >
            <ChevronDown
              className={cx(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-brand-purple/15 bg-white p-1.5 shadow-xl backdrop-blur-md">
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted">
              {allowCustom ? (
                <span>
                  Press enter or keep typing to use &ldquo;{query}&rdquo;
                </span>
              ) : (
                <span>No matching options found</span>
              )}
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected =
                opt.value === value || opt.label === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  aria-selected={isSelected}
                  className={cx(
                    "dropdown-menu-item group flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left text-sm transition",
                    isSelected
                      ? "is-selected bg-brand-deep text-white font-semibold shadow-xs"
                      : "text-brand-deep font-medium hover:bg-brand-purple/15 hover:border-brand-purple/40 hover:text-brand-deep",
                  )}
                >
                  <div>
                    <div>{opt.label}</div>
                    {opt.sublabel && (
                      <div
                        className={cx(
                          "text-xs",
                          isSelected ? "text-white/80" : "text-muted",
                        )}
                      >
                        {opt.sublabel}
                      </div>
                    )}
                  </div>
                  {opt.badge && <div>{opt.badge}</div>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default SearchableCombobox;
