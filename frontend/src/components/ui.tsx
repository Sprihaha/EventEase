import { useEffect, useState } from "react";
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
    "inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";
  const sizes = {
    sm: "text-sm px-4 h-9",
    md: "text-sm px-5 h-11",
    lg: "text-base px-7 h-13",
  };
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-ink shadow-[0_6px_20px_-6px_rgba(79,47,255,0.6)]",
    dark: "bg-ink text-white hover:bg-ink/90",
    outline: "border border-line text-ink hover:border-ink hover:bg-mist",
    ghost: "text-ink hover:bg-mist",
    danger: "bg-danger/10 text-danger hover:bg-danger hover:text-white",
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
    neutral: "bg-mist text-muted",
    accent: "bg-accent-soft text-accent-ink",
    live: "bg-live/10 text-live",
    warn: "bg-warn/10 text-warn",
    danger: "bg-danger/10 text-danger",
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
    <div {...props} className={cx("rounded-3xl border border-line bg-paper", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{children}</div>
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
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-paper px-3.5 h-11 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10 placeholder:text-muted";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "appearance-none pr-8", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(inputCls, "h-auto py-2.5 leading-relaxed", props.className)}
    />
  );
}

// Real, scannable QR code. `value` is encoded verbatim; ticket refs are wrapped
// into a verification URL so a phone camera resolves to the check-in endpoint.
export function ticketPayload(ref: string, seats?: string) {
  const u = new URL("https://eventease.io/verify/" + encodeURIComponent(ref));
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
      color: { dark: "#0b0b0f", light: "#ffffff" },
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
      className="rounded-md ring-2 ring-accent/20 [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
