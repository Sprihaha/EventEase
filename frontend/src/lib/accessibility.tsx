import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";

export type AccessibilitySettings = {
  voiceSpeed: number;
  autoNarrate: boolean;
};

export type NarrationAudience = "customer" | "organizer" | "admin";

const allAudiences: NarrationAudience[] = ["customer", "organizer", "admin"];

export const narrationPages = [
  { id: "home", name: "Home", audiences: allAudiences },
  { id: "browse-events", name: "Browse events", audiences: allAudiences },
  { id: "event-details", name: "Event details", audiences: allAudiences },
  { id: "select-tickets", name: "Select tickets", audiences: ["customer"] },
  { id: "checkout", name: "Checkout and payment", audiences: ["customer"] },
  { id: "booking-confirmation", name: "Booking confirmation", audiences: ["customer"] },
  { id: "my-tickets", name: "My tickets", audiences: ["customer"] },
  { id: "assistance-request", name: "Assistance request", audiences: ["customer"] },
  { id: "organizer-dashboard", name: "Organiser dashboard", audiences: ["organizer"] },
  { id: "ticket-sales", name: "Ticket sales", audiences: ["organizer"] },
  { id: "venue-status", name: "Venue status", audiences: ["organizer"] },
  { id: "organizer-seat-maps", name: "Organiser seat maps", audiences: ["organizer"] },
  { id: "easeanalytics", name: "EaseAnalytics", audiences: ["organizer"] },
  { id: "admin-dashboard", name: "Admin dashboard", audiences: ["admin"] },
  { id: "event-approvals", name: "Event approvals", audiences: ["admin"] },
  { id: "assistance-queue", name: "Assistance queue", audiences: ["admin"] },
  { id: "easevoice-narration", name: "EaseVoice narration", audiences: ["admin"] },
  { id: "platform-analytics", name: "Platform analytics", audiences: ["admin"] },
  { id: "accessibility-settings", name: "Accessibility settings", audiences: allAudiences },
] as const;

export type NarrationPageId = (typeof narrationPages)[number]["id"];
export type Narrations = Record<NarrationPageId, string>;

const defaultSettings: AccessibilitySettings = {
  voiceSpeed: 1,
  autoNarrate: false,
};

const defaultNarrations: Narrations = {
  home: "Welcome to EventEase...",
  "browse-events": "",
  "event-details": "...",
  "select-tickets": "",
  checkout: "...",
  "booking-confirmation": "",
  "my-tickets": "",
  "assistance-request": "...",
  "organizer-dashboard": "",
  "ticket-sales": "",
  "venue-status": "",
  "organizer-seat-maps": "",
  easeanalytics: "",
  "admin-dashboard": "",
  "event-approvals": "",
  "assistance-queue": "",
  "easevoice-narration": "",
  "platform-analytics": "",
  "accessibility-settings": "",
};

type AccessibilityStore = {
  settings: AccessibilitySettings;
  narrations: Narrations;
  saveSettings: (settings: AccessibilitySettings) => void;
  saveNarration: (page: NarrationPageId, text: string) => void;
};

const accessibilityGlobal = globalThis as typeof globalThis & {
  __eventEaseAccessibilityContext?: Context<AccessibilityStore | null>;
};
const AccessibilityCtx =
  accessibilityGlobal.__eventEaseAccessibilityContext ??
  createContext<AccessibilityStore | null>(null);
accessibilityGlobal.__eventEaseAccessibilityContext = AccessibilityCtx;

function initialSettings() {
  try {
    const saved = localStorage.getItem("eventease-accessibility-settings");
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function initialNarrations() {
  try {
    const saved = localStorage.getItem("eventease-page-narrations");
    return saved ? { ...defaultNarrations, ...JSON.parse(saved) } : defaultNarrations;
  } catch {
    return defaultNarrations;
  }
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(initialSettings);
  const [narrations, setNarrations] = useState<Narrations>(initialNarrations);
  const value = useMemo(
    () => ({
      settings,
      narrations,
      saveSettings: (next: AccessibilitySettings) => {
        setSettings(next);
        localStorage.setItem("eventease-accessibility-settings", JSON.stringify(next));
      },
      saveNarration: (page: NarrationPageId, text: string) => {
        setNarrations((current) => {
          const next = { ...current, [page]: text };
          localStorage.setItem("eventease-page-narrations", JSON.stringify(next));
          return next;
        });
      },
    }),
    [settings, narrations],
  );
  return <AccessibilityCtx.Provider value={value}>{children}</AccessibilityCtx.Provider>;
}

export function useAccessibility() {
  const value = useContext(AccessibilityCtx);
  if (!value) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return value;
}

export function narrationPageForPath(pathname: string): NarrationPageId {
  if (pathname === "/") return "home";
  if (pathname === "/events") return "browse-events";
  if (pathname.startsWith("/events/")) return "event-details";
  if (pathname === "/dashboard/customer") return "my-tickets";
  if (pathname.startsWith("/assistance/request/")) return "assistance-request";
  if (pathname === "/dashboard/organizer") return "organizer-dashboard";
  if (pathname === "/dashboard/admin") return "admin-dashboard";
  if (pathname === "/admin/easevoice-narration") return "easevoice-narration";
  if (pathname === "/settings/accessibility") return "accessibility-settings";
  return "home";
}

export function narrationForPath(pathname: string, narrations: Narrations) {
  return narrations[narrationPageForPath(pathname)];
}
