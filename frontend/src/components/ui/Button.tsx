import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "dark" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap cursor-pointer";
  const sizes = {
    sm: "text-sm px-4 h-9",
    md: "text-sm px-5 h-11",
    lg: "text-base px-7 h-13",
  };
  const variants = {
    primary:
      "bg-brand-orange text-white hover:bg-[#eb5d00] active:scale-[0.98] shadow-[0_4px_18px_-4px_rgba(255,101,0,0.45)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30",
    dark:
      "bg-brand-deep text-white hover:bg-brand-purple active:scale-[0.98] shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30",
    outline:
      "border border-brand-purple/20 bg-white/80 text-brand-deep hover:border-brand-purple hover:bg-brand-lilac/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20",
    ghost:
      "text-brand-deep hover:bg-brand-lilac/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20",
    danger:
      "bg-danger/10 text-danger hover:bg-danger hover:text-white border border-danger/20",
  };
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props} />;
}

export default Button;
