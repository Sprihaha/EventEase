import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { useStore } from "../../lib/store";
import type { Role } from "../../lib/data";
import { cx } from "../ui";
import { PanelLeftClose, PanelLeftOpen, ChevronRight, type LucideIcon } from "lucide-react";

export type NavItem = { id: string; label: string; icon: LucideIcon; badge?: number };

export function DashboardShell({
  role,
  title,
  nav,
  headerAction,
  children,
}: {
  role: Role;
  title: string | ((active: string) => string);
  nav: NavItem[];
  headerAction?: ReactNode | ((active: string) => ReactNode);
  children: (active: string) => ReactNode;
}) {
  const { user, sessionLoading } = useStore();
  const [active, setActive] = useState(nav[0].id);
  const [collapsed, setCollapsed] = useState(false);

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
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user.role !== role) return <Navigate to={`/dashboard/${user.role}`} replace />;

  return (
    <div
      className={cx(
        "mx-auto max-w-7xl gap-8 px-5 py-8 lg:grid transition-all duration-300",
        collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[240px_1fr]",
      )}
    >
      {/* Sidebar */}
      <aside className="mb-6 lg:mb-0 transition-all duration-300">
        <div className="lg:sticky lg:top-24">
          <div
            className={cx(
              "rounded-3xl border border-brand-purple/15 bg-white shadow-sm transition-all duration-300",
              collapsed ? "p-2.5" : "p-4",
            )}
          >
            <div
              className={cx(
                "flex items-center pb-2 border-b border-brand-purple/10",
                collapsed ? "justify-center" : "justify-between px-2 pt-0.5",
              )}
            >
              {!collapsed && (
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  Navigation
                </span>
              )}
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-muted transition-all duration-200 hover:bg-brand-lilac/80 hover:text-brand-purple hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4 text-brand-purple" />
                ) : (
                  <PanelLeftClose className="h-4 w-4 text-brand-purple" />
                )}
              </button>
            </div>

            <nav
              className={cx(
                "mt-3 flex flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap",
                collapsed && "lg:items-center",
              )}
            >
              {nav.map((n) => {
                const isSelected = active === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setActive(n.id)}
                    aria-pressed={isSelected}
                    title={collapsed ? n.label : undefined}
                    className={cx(
                      "dashboard-nav-item group relative flex cursor-pointer items-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20 active:scale-[0.98]",
                      collapsed
                        ? "h-11 w-11 justify-center p-0 lg:w-full hover:bg-brand-purple/15 hover:scale-105"
                        : "gap-2.5 px-3.5 py-2.5 text-sm whitespace-nowrap lg:w-full",
                      isSelected
                        ? "bg-brand-deep text-white shadow-sm font-semibold"
                        : "text-brand-deep/80 border border-transparent font-medium hover:border-brand-purple/40 hover:bg-brand-purple/15 hover:text-brand-deep hover:shadow-xs hover:translate-x-1.5",
                    )}
                  >
                    <n.icon
                      className={cx(
                        "shrink-0 transition-all duration-150",
                        collapsed ? "h-5 w-5" : "h-4 w-4",
                        isSelected
                          ? "text-brand-orange"
                          : "text-brand-purple group-hover:scale-115 group-hover:text-brand-orange",
                      )}
                    />
                    {!collapsed && (
                      <span
                        className={cx(
                          "flex-1 text-left transition-colors duration-150",
                          n.label.startsWith("Ease") ? "font-feature italic font-black tracking-tight" : "",
                          isSelected ? "" : "group-hover:font-semibold group-hover:text-brand-deep",
                        )}
                      >
                        {n.label}
                      </span>
                    )}
                    {!collapsed && !isSelected && (
                      <ChevronRight className="nav-chevron h-4 w-4 shrink-0 text-brand-purple opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0" />
                    )}
                    {n.badge ? (
                      collapsed ? (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white shadow transition-transform duration-200 group-hover:scale-110">
                          {n.badge}
                        </span>
                      ) : (
                        <span
                          className={cx(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold transition-all duration-200 group-hover:scale-105",
                            isSelected ? "bg-white/20 text-white" : "bg-danger/10 text-danger group-hover:bg-danger/15",
                          )}
                        >
                          {n.badge}
                        </span>
                      )
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-brand text-4xl font-bold tracking-tight text-brand-deep">
            {typeof title === "function" ? title(active) : title}
          </h1>
          {headerAction && (
            <div>{typeof headerAction === "function" ? headerAction(active) : headerAction}</div>
          )}
        </div>
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

export default DashboardShell;
