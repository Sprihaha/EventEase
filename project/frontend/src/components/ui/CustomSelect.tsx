import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown, Check } from "lucide-react";
import { cx } from "./cx";

export interface CustomSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  onChange?: (e: any) => void;
  children?: ReactNode;
  className?: string;
  placeholder?: string;
  /** Where the option list opens. Use "above" near the bottom of the screen. */
  placement?: "below" | "above";
}

/** Plain text of an <option>'s children: `{speed}x` arrives as ["0.5", "x"], which String() would join with a comma. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join("");
  return String(node);
}

export function Select({
  value: controlledValue,
  defaultValue,
  onChange,
  children,
  className,
  disabled,
  placeholder = "Select an option...",
  placement = "below",
  name,
  id,
  ...rest
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(
    controlledValue !== undefined
      ? String(controlledValue)
      : defaultValue !== undefined
        ? String(defaultValue)
        : "",
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const currentValue =
    controlledValue !== undefined ? String(controlledValue) : internalValue;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Parse <option> children
  const options: Array<{ value: string; label: string; disabled?: boolean }> = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const childProps = child.props as {
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      };
      options.push({
        value: String(childProps.value ?? textOf(childProps.children)),
        label: textOf(childProps.children) || String(childProps.value ?? ""),
        disabled: childProps.disabled,
      });
    } else if (child.type === "optgroup") {
      const groupProps = child.props as {
        children?: ReactNode;
      };
      Children.forEach(groupProps.children, (optChild) => {
        if (!isValidElement(optChild)) return;
        const optProps = optChild.props as {
          value?: string | number;
          children?: ReactNode;
          disabled?: boolean;
        };
        options.push({
          value: String(optProps.value ?? textOf(optProps.children)),
          label: textOf(optProps.children) || String(optProps.value ?? ""),
          disabled: optProps.disabled,
        });
      });
    }
  });

  const selectedOption = options.find((opt) => opt.value === currentValue);
  const displayLabel = selectedOption ? selectedOption.label : (currentValue || placeholder);

  const handleSelect = (val: string) => {
    if (disabled) return;
    setInternalValue(val);
    setIsOpen(false);
    if (onChange) {
      onChange({ target: { value: val, name } });
    }
  };

  return (
    <div
      ref={containerRef}
      className={cx("relative w-full", isOpen ? "z-50" : "z-10")}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") {
            setIsOpen(false);
          } else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            if (!isOpen) {
              e.preventDefault();
              setIsOpen(true);
            }
          }
        }}
        className={cx(
          "w-full rounded-2xl border border-brand-purple/20 bg-white/95 py-2.5 pl-3.5 pr-10 text-sm font-medium text-brand-deep shadow-xs outline-none transition text-left cursor-pointer flex items-center justify-between",
          "hover:border-brand-purple focus:border-brand-purple focus:ring-4 focus:ring-brand-purple/15",
          disabled && "bg-neutral-100 opacity-60 cursor-not-allowed",
          className,
        )}
      >
        <span className={cx("truncate", !selectedOption && !currentValue && "text-muted/65")}>
          {displayLabel}
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-brand-purple">
          <ChevronDown
            className={cx(
              "h-4 w-4 transition-transform duration-200",
              (placement === "above") !== isOpen && "rotate-180",
            )}
          />
        </span>
      </button>

      {/* Floating Options Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className={cx(
            "absolute left-0 max-h-60 w-full overflow-y-auto rounded-2xl border border-brand-purple/20 bg-white p-1.5 shadow-xl z-50 transition-all duration-150 animate-in fade-in zoom-in-95",
            placement === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {options.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted">No options available</div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === currentValue;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  className={cx(
                    "dropdown-menu-item group flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-left text-sm transition",
                    isSelected
                      ? "is-selected bg-brand-deep text-white font-semibold shadow-xs"
                      : "text-brand-deep font-medium hover:bg-brand-purple/15 hover:border-brand-purple/40 hover:text-brand-deep",
                    opt.disabled && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-brand-orange shrink-0 ml-2" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default Select;
