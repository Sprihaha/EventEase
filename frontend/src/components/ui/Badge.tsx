import type { ReactNode } from "react";
import { cx } from "./cx";

export interface BadgeProps {
  children: ReactNode;
  tone?: "neutral" | "accent" | "live" | "warn" | "danger";
  className?: string;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: BadgeProps) {
  const tones = {
    neutral: "bg-brand-lilac/70 text-brand-deep border border-brand-purple/10",
    accent: "bg-brand-lilac text-brand-purple border border-brand-purple/20",
    live: "bg-live/10 text-live border border-live/20",
    warn: "bg-warn/10 text-warn border border-warn/20",
    danger: "bg-danger/10 text-danger border border-danger/20",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
