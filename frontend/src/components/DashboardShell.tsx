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
  const { user, sessionLoading } = useStore();
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

  if (sessionLoading) return <p role="status" className="p-10">Restoring session…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/dashboard/${user.role}`} replace />;

  return (
    <div className="mx-auto max-w-7xl gap-8 px-5 py-8 lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="mb-6 lg:mb-0">
        <div className="lg:sticky lg:top-24">
          <div className="rounded-3xl border border-brand-purple/15 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-deep font-bold text-white shadow-sm">
                {user.name[0]}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-brand-deep">{user.name}</div>
                <Badge tone="accent" className="mt-0.5 capitalize">
                  {role}
                </Badge>
              </div>
            </div>
            <nav className="mt-4 flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
              {nav.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setActive(n.id)}
                  aria-pressed={active === n.id}
                  className={cx(
                    "cursor-pointer flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20 lg:w-full",
                    active === n.id
                      ? "bg-brand-deep text-white shadow-sm font-semibold"
                      : "text-muted hover:bg-brand-lilac/50 hover:text-brand-deep font-medium",
                  )}
                >
                  <n.icon className={cx("h-4 w-4 shrink-0", active === n.id ? "text-brand-orange" : "text-brand-purple")} />
                  <span className="flex-1 text-left">{n.label}</span>
                  {n.badge ? (
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        active === n.id ? "bg-white/20 text-white" : "bg-danger/10 text-danger",
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
        <h1 className="font-brand text-4xl font-bold tracking-tight text-brand-deep">{title}</h1>
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
    neutral: "border-brand-purple/15 bg-white shadow-sm",
    accent: "border-brand-purple/30 bg-brand-lilac/40 shadow-sm",
    live: "border-emerald-300 bg-emerald-50/50 shadow-sm",
    danger: "border-rose-300 bg-rose-50/50 shadow-sm",
  }[tone];
  return (
    <div className={cx("rounded-3xl border p-5.5", ring)}>
      <div className="text-xs font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-2 font-brand text-3xl font-bold text-brand-deep">{value}</div>
      {sub && <div className="mt-1 text-xs font-medium text-muted">{sub}</div>}
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
              className="w-full rounded-t-lg bg-gradient-to-t from-brand-purple to-brand-orange transition-all"
              style={{ height: `${(d.value / max) * 100}%` }}
              title={String(d.value)}
            />
          </div>
          <span className="text-xs font-semibold text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
