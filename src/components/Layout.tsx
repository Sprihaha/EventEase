import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import {
  Ticket,
  Search,
  Users,
  LayoutDashboard,
  Accessibility,
  Type,
  Contrast,
  LogOut,
  ChevronRight,
  ChevronDown,
  Settings,
  Route,
} from "lucide-react";
import { useStore } from "../lib/store";
import type { Role } from "../lib/data";
import { Badge, Button, Select, cx } from "./ui";
import EaseVoice from "./EaseVoice";

function AccessibilityBar() {
  const [big, setBig] = useState(false);
  const [contrast, setContrast] = useState(false);
  useEffect(() => {
    document.documentElement.style.fontSize = big ? "18px" : "16px";
  }, [big]);
  useEffect(() => {
    document.documentElement.style.filter = contrast ? "contrast(1.15) saturate(1.1)" : "";
  }, [contrast]);
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-mist/60 p-1">
      <Accessibility className="ml-1.5 mr-0.5 h-4 w-4 text-muted" aria-hidden />
      <button
        onClick={() => setBig((v) => !v)}
        aria-pressed={big}
        title="Toggle larger text"
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-full transition",
          big ? "bg-accent text-white" : "text-ink hover:bg-paper",
        )}
      >
        <Type className="h-4 w-4" />
      </button>
      <button
        onClick={() => setContrast((v) => !v)}
        aria-pressed={contrast}
        title="Toggle high contrast"
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-full transition",
          contrast ? "bg-accent text-white" : "text-ink hover:bg-paper",
        )}
      >
        <Contrast className="h-4 w-4" />
      </button>
    </div>
  );
}

const navLinks = [
  { to: "/events", label: "Discover", icon: Search },
  { to: "/community", label: "Community", icon: Users },
];

export default function Layout() {
  const { user, login, logout } = useStore();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenu = useRef<HTMLDivElement>(null);
  const dash = user ? `/dashboard/${user.role}` : "/login";

  const previewAs = (role: Role) => {
    login(role);
    navigate(`/dashboard/${role}`);
  };

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!userMenu.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink">
              <Ticket className="h-4 w-4 text-white" />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">EventEase</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  cx(
                    "rounded-full px-3.5 py-2 text-sm font-medium transition",
                    isActive ? "bg-mist text-ink" : "text-muted hover:text-ink",
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft/50 p-1 pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-accent-ink xl:hidden">
                Prototype
              </span>
              <div className="hidden items-center gap-2 xl:flex">
                <span className="text-xs font-semibold text-accent-ink">Preview as</span>
                <Badge tone="accent" className="bg-paper normal-case tracking-normal">
                  Prototype only
                </Badge>
              </div>
              <Select
                aria-label="Preview prototype as a role"
                value={user?.role ?? ""}
                onChange={(event) => previewAs(event.target.value as Role)}
                className="h-8 w-28 rounded-full border-0 bg-paper py-0 pl-3 pr-7 text-xs font-semibold focus:ring-2 sm:w-32"
              >
                <option value="" disabled>Preview as</option>
                <option value="customer">Customer</option>
                <option value="organizer">Organiser</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div className="hidden lg:block">
              <AccessibilityBar />
            </div>
            {user ? (
              <div ref={userMenu} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label="Open user menu"
                  className="focus-visible:ring-4 focus-visible:ring-accent/30"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-white">
                    {user.name[0]}
                  </span>
                  <span className="hidden sm:inline">{user.name}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                {userMenuOpen && (
                  <div
                    role="menu"
                    aria-label="User menu"
                    className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-line bg-paper p-2 shadow-xl"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate(dash);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-mist focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                    >
                      <LayoutDashboard className="h-4 w-4 text-accent" />
                      <span className="capitalize">{user.role} dashboard</span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate("/settings/accessibility");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-mist focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                    >
                      <Settings className="h-4 w-4 text-accent" />
                      Accessibility settings
                    </button>
                    {user.role === "customer" && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/assistance");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-mist focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                      >
                        <Route className="h-4 w-4 text-accent" />
                        My assistance requests
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                        navigate("/");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" onClick={() => navigate("/login")}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
      <EaseVoice />

      <footer className="mt-24 border-t border-line bg-ink text-white">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                  <Ticket className="h-4 w-4 text-ink" />
                </span>
                <span className="font-display text-xl">EventEase</span>
              </div>
              <p className="mt-4 max-w-xs text-sm text-white/60">
                A next-generation, hassle-free ticketing platform. Transparent pricing, verified
                tickets, and a community that has your back.
              </p>
            </div>
            {[
              { h: "Discover", items: ["Concerts", "Theatre", "Sports", "Cultural"] },
              { h: "Platform", items: ["Community", "Secure Exchange", "Accessibility", "Fraud Shield"] },
              { h: "For Organizers", items: ["Create events", "Analytics", "Pricing tools", "Apply to sell"] },
            ].map((col) => (
              <div key={col.h}>
                <div className="text-sm font-semibold">{col.h}</div>
                <ul className="mt-4 space-y-2.5 text-sm text-white/60">
                  {col.items.map((it) => (
                    <li key={it} className="flex cursor-pointer items-center gap-1 hover:text-white">
                      {it} <ChevronRight className="h-3 w-3" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row">
            <span>© 2026 EventEase. Built for Ticketmaster.</span>
            <span>Transparent fees · No hidden charges · PDPA compliant</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
