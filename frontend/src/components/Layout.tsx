import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
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
import { Button, cx } from "./ui";
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
    <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1">
      <Accessibility className="ml-1.5 mr-0.5 h-4 w-4 text-white/70" aria-hidden />
      <button
        onClick={() => setBig((v) => !v)}
        aria-pressed={big}
        title="Toggle larger text"
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-full transition",
          big ? "bg-brand-orange text-white" : "text-white hover:bg-white/15",
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
          contrast ? "bg-brand-orange text-white" : "text-white hover:bg-white/15",
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
  const { user, logout } = useStore();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenu = useRef<HTMLDivElement>(null);
  const dash = user ? `/dashboard/${user.role}` : "/login";

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
    <div className="flex min-h-full flex-col bg-brand-warm text-brand-text">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-deep/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-5 sm:gap-3 lg:gap-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange shadow-[0_2px_10px_rgba(255,101,0,0.4)]">
              <Ticket className="h-4 w-4 text-white" />
            </span>
            <span className="font-brand text-xl font-bold tracking-tight text-white">
              EventEase
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  cx(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    isActive
                      ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
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
                  className="border-white/20 bg-white/10 text-white hover:border-brand-orange hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-brand-orange/30"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange text-[10px] font-bold text-white">
                    {user.name[0]}
                  </span>
                  <span className="hidden font-medium sm:inline">{user.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
                {userMenuOpen && (
                  <div
                    role="menu"
                    aria-label="User menu"
                    className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-brand-purple/15 bg-white p-2 text-brand-text shadow-2xl"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate(dash);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-text transition hover:bg-brand-lilac hover:text-brand-purple focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30"
                    >
                      <LayoutDashboard className="h-4 w-4 text-brand-purple" />
                      <span className="capitalize">{user.role} dashboard</span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate("/settings/accessibility");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-text transition hover:bg-brand-lilac hover:text-brand-purple focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30"
                    >
                      <Settings className="h-4 w-4 text-brand-purple" />
                      Accessibility settings
                    </button>
                    {user.role === "customer" && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/assistance");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-text transition hover:bg-brand-lilac hover:text-brand-purple focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30"
                      >
                        <Route className="h-4 w-4 text-brand-purple" />
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
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate("/login")}
                className="bg-brand-orange text-white shadow-none hover:bg-white hover:text-brand-deep focus-visible:ring-4 focus-visible:ring-brand-orange/30"
              >
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

      <footer className="mt-20 border-t border-white/10 bg-brand-deep text-white">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-orange">
                  <Ticket className="h-4 w-4 text-white" />
                </span>
                <span className="font-brand text-xl font-bold tracking-tight text-white">
                  EventEase
                </span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">
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
                <div className="font-brand text-sm font-bold tracking-wide text-white">{col.h}</div>
                <ul className="mt-4 space-y-2.5 text-sm text-white/65">
                  {col.items.map((it) => (
                    <li
                      key={it}
                      className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-brand-orange"
                    >
                      {it} <ChevronRight className="h-3 w-3 opacity-60" />
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
