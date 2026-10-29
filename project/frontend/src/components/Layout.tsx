import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, ScrollRestoration } from "react-router";
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
  Volume2,
  KeyRound,
  Route,
  User,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Badge, Button, InfoTooltip, cx } from "./ui";
import EaseVoice from "./EaseVoice";
import SessionExpiredModal from "./SessionExpiredModal";
import {
  onSessionExpired,
  hasExpiredRedirect,
  clearExpiredRedirect,
  getSavedExpiredReturnTo,
  saveExpiredReturnTo,
} from "../lib/session";

import { AccessibilityBar } from "./layout/AccessibilityBar";
import { OrganisationSwitcher } from "./layout/OrganisationSwitcher";

const navLinks = [
  { to: "/events", label: "Discover", icon: Search },
  { to: "/community", label: "EaseComms", icon: Users },
];

export default function Layout() {
  const { user, logout } = useStore();
  const isCustomerOrAdmin = !user || user.role === "customer" || user.role === "admin";
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenu = useRef<HTMLDivElement>(null);
  const dash = user ? (user.mustChangePassword ? "/change-password" : `/dashboard/${user.role}`) : "/login";
  // The logo opens the dashboard for any logged-in user; visitors go to "/"
  const logoTo = user ? dash : "/";

  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);
  const [expiredReturnTo, setExpiredReturnTo] = useState<string | null>(null);

  // If the user refreshed the page while expired, redirect to /login immediately preserving destination
  useEffect(() => {
    if (hasExpiredRedirect()) {
      clearExpiredRedirect();
      const returnTo = getSavedExpiredReturnTo();
      navigate("/login", {
        replace: true,
        state: returnTo ? { returnTo } : undefined,
      });
    }
  }, [navigate]);

  // Listen for session expiry event to display modal and remember current page
  useEffect(() => {
    return onSessionExpired(() => {
      const currentPath =
        typeof window !== "undefined" && !window.location.pathname.startsWith("/login")
          ? window.location.pathname + window.location.search + window.location.hash
          : getSavedExpiredReturnTo();
      if (currentPath && !currentPath.startsWith("/login")) {
        setExpiredReturnTo(currentPath);
        saveExpiredReturnTo(currentPath);
      }
      setSessionExpiredOpen(true);
    });
  }, []);

  const handleConfirmSessionExpired = () => {
    const returnTo = expiredReturnTo || getSavedExpiredReturnTo();
    setSessionExpiredOpen(false);
    clearExpiredRedirect();
    navigate("/login", {
      replace: true,
      state: returnTo ? { returnTo } : undefined,
    });
  };

  // Only reset scroll to top when navigating to /login
  useEffect(() => {
    if (location.pathname === "/login") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [location.pathname]);

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
      <header className="sticky top-0 z-40 border-b border-brand-purple/10 bg-white/95 text-brand-deep shadow-[0_2px_15px_-4px_rgba(50,19,79,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-5 sm:gap-3 lg:gap-6">
          <Link
            to={logoTo}
            className="flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30"
          >
            <img
              src="/EventEase_logo.png"
              alt="EventEase"
              className="h-10 w-auto object-contain transition-transform hover:scale-[1.02]"
            />
          </Link>

          {isCustomerOrAdmin && (
            <nav className="ml-4 hidden items-center gap-1 md:flex">
              {navLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    cx(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      isActive
                        ? "bg-brand-purple text-white shadow-sm font-bold"
                        : "text-brand-deep/70 hover:bg-brand-lilac/60 hover:text-brand-deep",
                    )
                  }
                >
                  <span className={l.label.startsWith("Ease") ? "font-feature italic font-black tracking-tight" : ""}>
                    {l.label}
                  </span>
                </NavLink>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden lg:block">
              <AccessibilityBar />
            </div>
            {user?.role === "organizer" && <OrganisationSwitcher />}
            {user ? (
              <div ref={userMenu} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label="Open user menu"
                  className="gap-2 border-brand-purple/20 bg-white text-brand-deep hover:border-brand-purple hover:bg-brand-lilac/40 focus-visible:ring-4 focus-visible:ring-brand-orange/30"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange text-[10px] font-bold text-white">
                    {user.name[0]}
                  </span>
                  <span className="hidden font-medium sm:inline">{user.name}</span>
                  <Badge tone="accent" className="hidden px-2 py-0.5 text-[10px] font-bold capitalize sm:inline-flex">
                    {user.role}
                  </Badge>
                  <ChevronDown className="h-3.5 w-3.5 text-muted" />
                </Button>
                {userMenuOpen && (
                  <div
                    role="menu"
                    aria-label="User menu"
                    className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-brand-purple/15 bg-white p-2 text-brand-text shadow-2xl"
                  >
                    <button
                      role="menuitem"
                      aria-pressed={location.pathname.startsWith(dash)}
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate(dash);
                      }}
                      className={cx(
                        "dropdown-menu-item group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30",
                        location.pathname.startsWith(dash) && "is-selected",
                      )}
                    >
                      {user.role === "admin" ? (
                        <LayoutDashboard className="h-4 w-4 shrink-0 text-brand-purple transition-all duration-150" />
                      ) : (
                        <User className="h-4 w-4 shrink-0 text-brand-purple transition-all duration-150" />
                      )}
                      <span className="capitalize">{user.role === "admin" ? "Admin dashboard" : "Profile"}</span>
                    </button>
                    <div
                      aria-pressed={location.pathname === "/settings/accessibility"}
                      className={cx(
                        "dropdown-menu-item group flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-semibold transition",
                        location.pathname === "/settings/accessibility" && "is-selected",
                      )}
                    >
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/settings/accessibility");
                        }}
                        className="flex flex-1 items-center gap-3 text-left focus-visible:outline-none cursor-pointer"
                      >
                        <Volume2 className="h-4 w-4 shrink-0 text-brand-purple transition-all duration-150" />
                        <span>EaseVoice</span>
                      </button>
                      <InfoTooltip
                        side="left"
                        title="What is EaseVoice?"
                        content="Customizable voice narration and speech controls that read event and ticket details aloud."
                        ariaLabel="Learn about EaseVoice"
                        size="sm"
                      />
                    </div>
                    {user.canChangePassword !== false && (
                      <button
                        role="menuitem"
                        aria-pressed={location.pathname === "/change-password"}
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/change-password");
                        }}
                        className={cx(
                          "dropdown-menu-item group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/30",
                          location.pathname === "/change-password" && "is-selected",
                        )}
                      >
                        <KeyRound className="h-4 w-4 shrink-0 text-brand-purple transition-all duration-150" />
                        Change password
                      </button>
                    )}
                    {user.role === "customer" && (
                      <div
                        aria-pressed={location.pathname === "/assistance"}
                        className={cx(
                          "dropdown-menu-item group flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-semibold transition",
                          location.pathname === "/assistance" && "is-selected",
                        )}
                      >
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate("/assistance");
                          }}
                          className="flex flex-1 items-center gap-3 text-left focus-visible:outline-none cursor-pointer"
                        >
                          <Route className="h-4 w-4 shrink-0 text-brand-purple transition-all duration-150" />
                          <span>EaseGuide</span>
                        </button>
                        <InfoTooltip
                          side="left"
                          title="What is EaseGuide?"
                          content="Request and track venue accessibility assistance, escort services, and on-site support for your bookings."
                          ariaLabel="Learn about EaseGuide"
                          size="sm"
                        />
                      </div>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                        navigate("/");
                      }}
                      className="danger-menu-item group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-semibold text-danger transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20"
                    >
                      <LogOut className="h-4 w-4 shrink-0 transition-transform duration-150" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                  navigate("/login");
                }}
                className="bg-brand-orange text-white shadow-md hover:bg-brand-deep hover:text-white focus-visible:ring-4 focus-visible:ring-brand-orange/30"
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
      <SessionExpiredModal
        isOpen={sessionExpiredOpen}
        onConfirm={handleConfirmSessionExpired}
      />

      <footer className="mt-20 border-t border-white/10 bg-brand-deep text-white">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="space-y-6">
              <div>
                <Link to={logoTo} className="inline-block">
                  <img
                    src="/EventEase_logo.png"
                    alt="EventEase"
                    className="h-10 w-auto object-contain"
                  />
                </Link>
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">
                  A next-generation, hassle-free ticketing platform. Transparent pricing, verified
                  tickets, and a community that has your back.
                </p>
              </div>

              <div className="group relative max-w-xs overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] p-3.5 backdrop-blur-md transition-all duration-300 hover:border-brand-orange/40 hover:bg-white/[0.1] hover:shadow-[0_8px_25px_-8px_rgba(255,101,0,0.25)]">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm transition-transform duration-300 group-hover:scale-105">
                    <img
                      src="/gendol_company_logo.jpg"
                      alt="GenDoL"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-brand-orange">
                      A Product of
                    </div>
                    <div className="font-brand text-sm font-bold text-white">
                      GenDoL
                    </div>
                    <div className="text-xs text-white/60">
                      Generations of Doing, Limberly
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {(user?.role === "organizer"
              ? [{ h: "For Organizers", items: ["Create events", "Analytics", "Pricing tools", "Apply to sell"] }]
              : [
                  { h: "Discover", items: ["Concerts", "Theatre", "Sports", "Cultural"] },
                  { h: "Platform", items: ["EaseComms", "Secure Exchange", "Accessibility", "Fraud Shield"] },
                  { h: "For Organizers", items: ["Create events", "Analytics", "Pricing tools", "Apply to sell"] },
                ]
            ).map((col) => (
              <div key={col.h}>
                <div className="font-brand text-sm font-bold tracking-wide text-white">{col.h}</div>
                <ul className="mt-4 space-y-2.5 text-sm text-white/65">
                  {col.items.map((it) => (
                    <li
                      key={it}
                      className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-brand-orange"
                    >
                      <span className={it.startsWith("Ease") ? "font-feature italic font-black tracking-tight" : ""}>{it}</span> <ChevronRight className="h-3 w-3 opacity-60" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:items-center">
            <span>© 2026 EventEase by GenDoL. All rights reserved.</span>
            <span>Transparent fees · No hidden charges · PDPA compliant</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
