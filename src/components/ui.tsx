import type { ButtonHTMLAttributes, ReactNode } from "react";

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

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-3xl border border-line bg-paper", className)}>{children}</div>
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

// Deterministic QR-style code (visual placeholder, not a scannable code)
export function QRCode({ value, size = 132 }: { value: string; size?: number }) {
  const n = 21;
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  const rand = (i: number) => {
    const x = Math.sin(h + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const cells: boolean[] = [];
  for (let i = 0; i < n * n; i++) cells.push(rand(i) > 0.5);
  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const cell = size / n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Ticket QR code">
      <rect width={size} height={size} fill="#fff" />
      {cells.map((on, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        if (finder(r, c)) return null;
        return on ? <rect key={i} x={c * cell} y={r * cell} width={cell} height={cell} fill="#0b0b0f" /> : null;
      })}
      {[
        [0, 0],
        [0, n - 7],
        [n - 7, 0],
      ].map(([r, c], i) => (
        <g key={i}>
          <rect x={c * cell} y={r * cell} width={cell * 7} height={cell * 7} fill="#0b0b0f" />
          <rect x={(c + 1) * cell} y={(r + 1) * cell} width={cell * 5} height={cell * 5} fill="#fff" />
          <rect x={(c + 2) * cell} y={(r + 2) * cell} width={cell * 3} height={cell * 3} fill="#4f2fff" />
        </g>
      ))}
    </svg>
  );
}
