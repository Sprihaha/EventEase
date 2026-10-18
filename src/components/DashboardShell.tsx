import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { useStore } from "../lib/store";
import type { Role } from "../lib/data";
import { Badge, cx } from "./ui";
import type { LucideIcon } from "lucide-react";

export type NavItem = { id: string; label: string; icon: LucideIcon; badge?: number };

export function DashboardShell({
  role,
  title,
  nav,
  children,
}: {
  role: Role;
  title: string;
  nav: NavItem[];
  children: (active: string) => ReactNode;
}) {
  const { user } = useStore();
  const [active, setActive] = useState(nav[0].id);

  useEffect(() => {
    const pages: Partial<Record<Role, Record<string, string>>> = {
      customer: { tickets: "my-tickets" },
      organizer: {
        overview: "organizer-dashboard",
        sales: "ticket-sales",
        venues: "venue-status",
        seats: "organizer-seat-maps",
        analytics: "easeanalytics",
      },
      admin: {
        overview: "admin-dashboard",
        events: "event-approvals",
        assistance: "assistance-queue",
        narration: "easevoice-narration",
        analytics: "platform-analytics",
      },
    };
    const page = pages[role]?.[active];
    if (page) {
      window.dispatchEvent(new CustomEvent("eventease:narration-page", { detail: page }));
    }
  }, [active, role]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/dashboard/${user.role}`} replace />;

  return (
    <div className="mx-auto max-w-7xl gap-8 px-5 py-8 lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="mb-6 lg:mb-0">
        <div className="lg:sticky lg:top-24">
          <div className="rounded-3xl border border-line p-4">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-semibold text-white">
                {user.name[0]}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <Badge tone="accent" className="mt-0.5 capitalize">
                  {role}
                </Badge>
              </div>
            </div>
            <nav className="mt-3 flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
              {nav.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setActive(n.id)}
                  aria-pressed={active === n.id}
                  className={cx(
                    "flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 lg:w-full",
                    active === n.id ? "bg-ink text-white" : "text-muted hover:bg-mist hover:text-ink",
                  )}
                >
                  <n.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{n.label}</span>
                  {n.badge ? (
                    <span
                      className={cx(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                        active === n.id ? "bg-white/20" : "bg-danger/10 text-danger",
                      )}
                    >
                      {n.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children(active)}</div>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "accent" | "live" | "danger";
}) {
  const ring = {
    neutral: "border-line",
    accent: "border-accent/30 bg-accent-soft/40",
    live: "border-live/30 bg-live/5",
    danger: "border-danger/30 bg-danger/5",
  }[tone];
  return (
    <div className={cx("rounded-2xl border p-5", ring)}>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

// Lightweight bar chart
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-44 items-end gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-lg bg-accent transition-all"
              style={{ height: `${(d.value / max) * 100}%` }}
              title={String(d.value)}
            />
          </div>
          <span className="text-xs text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
