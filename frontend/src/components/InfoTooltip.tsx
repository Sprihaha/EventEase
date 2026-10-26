import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type MouseEvent,
} from "react";
import { HelpCircle } from "lucide-react";
import { cx } from "./ui";

export interface InfoTooltipProps {
  /** Text or rich content displayed inside the tooltip bubble */
  content: ReactNode;
  /** Optional title header displayed in brand-orange */
  title?: ReactNode;
  /** Side where tooltip bubble appears relative to trigger (default: "top") */
  side?: "top" | "bottom" | "left" | "right";
  /** Alignment of tooltip bubble (default: "center") */
  align?: "center" | "start" | "end";
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Size of default question mark icon button (default: "md") */
  size?: "sm" | "md" | "lg";
  /** Custom wrapper classes */
  className?: string;
  /** Custom trigger button classes */
  triggerClassName?: string;
  /** Custom tooltip card classes (e.g. custom width) */
  tooltipClassName?: string;
  /** Optional custom trigger node (replaces the default question mark icon) */
  children?: ReactNode;
}

export function InfoTooltip({
  content,
  title,
  side = "top",
  align = "center",
  ariaLabel,
  size = "md",
  className,
  triggerClassName,
  tooltipClassName,
  children,
}: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimeout();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 120);
  };

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  const sizeStyles = {
    sm: "h-4 w-4 text-[10px]",
    md: "h-4.5 w-4.5 text-xs",
    lg: "h-5 w-5 text-xs",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  // Position classes
  const positionClasses = {
    top: {
      center: "bottom-full mb-2 left-1/2 -translate-x-1/2",
      start: "bottom-full mb-2 left-0",
      end: "bottom-full mb-2 right-0",
    },
    bottom: {
      center: "top-full mt-2 left-1/2 -translate-x-1/2",
      start: "top-full mt-2 left-0",
      end: "top-full mt-2 right-0",
    },
    left: {
      center: "right-full mr-2.5 top-1/2 -translate-y-1/2",
      start: "right-full mr-2.5 top-0",
      end: "right-full mr-2.5 bottom-0",
    },
    right: {
      center: "left-full ml-2.5 top-1/2 -translate-y-1/2",
      start: "left-full ml-2.5 top-0",
      end: "left-full ml-2.5 bottom-0",
    },
  }[side][align];

  // Arrow indicator classes
  const arrowClasses = {
    top: {
      center: "top-full left-1/2 -translate-x-1/2 border-x-[5px] border-x-transparent border-t-[6px] border-t-brand-deep/95",
      start: "top-full left-3 border-x-[5px] border-x-transparent border-t-[6px] border-t-brand-deep/95",
      end: "top-full right-3 border-x-[5px] border-x-transparent border-t-[6px] border-t-brand-deep/95",
    },
    bottom: {
      center: "bottom-full left-1/2 -translate-x-1/2 border-x-[5px] border-x-transparent border-b-[6px] border-b-brand-deep/95",
      start: "bottom-full left-3 border-x-[5px] border-x-transparent border-b-[6px] border-b-brand-deep/95",
      end: "bottom-full right-3 border-x-[5px] border-x-transparent border-b-[6px] border-b-brand-deep/95",
    },
    left: {
      center: "left-full top-1/2 -translate-y-1/2 border-y-[5px] border-y-transparent border-l-[6px] border-l-brand-deep/95",
      start: "left-full top-2.5 border-y-[5px] border-y-transparent border-l-[6px] border-l-brand-deep/95",
      end: "left-full bottom-2.5 border-y-[5px] border-y-transparent border-l-[6px] border-l-brand-deep/95",
    },
    right: {
      center: "right-full top-1/2 -translate-y-1/2 border-y-[5px] border-y-transparent border-r-[6px] border-r-brand-deep/95",
      start: "right-full top-2.5 border-y-[5px] border-y-transparent border-r-[6px] border-r-brand-deep/95",
      end: "right-full bottom-2.5 border-y-[5px] border-y-transparent border-r-[6px] border-r-brand-deep/95",
    },
  }[side][align];

  const defaultLabel =
    ariaLabel ?? (typeof title === "string" ? title : "More information");

  return (
    <div
      ref={containerRef}
      className={cx("relative inline-flex items-center", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={defaultLabel}
          aria-expanded={isOpen}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen((prev) => !prev);
            }
          }}
          className={cx("cursor-help inline-flex items-center", triggerClassName)}
        >
          {children}
        </div>
      ) : (
        <button
          type="button"
          aria-label={defaultLabel}
          aria-expanded={isOpen}
          onClick={handleClick}
          onFocus={handleMouseEnter}
          onBlur={handleMouseLeave}
          className={cx(
            "flex items-center justify-center rounded-full font-bold transition-all cursor-help shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40",
            isOpen
              ? "bg-brand-purple text-white ring-2 ring-brand-purple/30"
              : "bg-brand-purple/15 text-brand-purple hover:bg-brand-purple hover:text-white",
            sizeStyles[size],
            triggerClassName,
          )}
        >
          <HelpCircle className={iconSizes[size]} />
        </button>
      )}

      {isOpen && (
        <div
          role="tooltip"
          className={cx(
            "absolute z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/20 bg-brand-deep/95 p-3 text-white shadow-2xl backdrop-blur-md pointer-events-auto transition-all animate-in fade-in-0 zoom-in-95",
            positionClasses,
            tooltipClassName,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="mb-1 flex items-center gap-1.5 font-bold text-xs text-brand-orange">
              {title}
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-white/90 font-medium">
            {content}
          </div>
          <div className={cx("absolute pointer-events-none", arrowClasses)} />
        </div>
      )}
    </div>
  );
}

export default InfoTooltip;
