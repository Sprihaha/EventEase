import { useEffect, useState, forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import QR from "qrcode";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "dark" | "danger";
  size?: "sm" | "md" | "lg";
}) {
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

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "live" | "warn" | "danger";
  className?: string;
}) {
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

export function Card({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-3xl border border-brand-purple/10 bg-white shadow-[0_4px_24px_-8px_rgba(50,19,79,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-orange">
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-brand-deep">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-brand-purple/20 bg-white px-3.5 h-11 text-sm text-brand-text outline-none transition focus:border-brand-purple focus:ring-4 focus:ring-brand-purple/15 placeholder:text-muted/65";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "appearance-none pr-8", props.className)} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  (props, ref) => {
    return (
      <textarea
        ref={ref}
        {...props}
        className={cx(inputCls, "h-auto py-2.5 leading-relaxed", props.className)}
      />
    );
  }
);
Textarea.displayName = "Textarea";

// Real, scannable QR code. `value` is encoded verbatim; ticket refs are wrapped
// into a verification URL so a phone camera resolves to the check-in endpoint.
export function ticketPayload(ref: string, seats?: string) {
  const u = new URL("/verify/" + encodeURIComponent(ref), window.location.origin);
  if (seats) u.searchParams.set("seats", seats);
  return u.toString();
}

export function QRCode({ value, size = 132 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QR.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 0,
      color: { dark: "#1c1526", light: "#ffffff" },
    })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label="Scannable ticket QR code"
      style={{ width: size, height: size }}
      className="rounded-md ring-2 ring-brand-purple/25 [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export { InfoTooltip, type InfoTooltipProps } from "./InfoTooltip";
