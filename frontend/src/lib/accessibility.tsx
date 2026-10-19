import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import {
  deleteBackendNarrationAudio,
  fetchBackendNarration,
  narrationAudioUrl,
  saveBackendNarration,
  uploadBackendNarrationAudio,
  type BackendNarration,
} from "./backendApi";

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

/** An MP3 recorded by an admin for one page. `url` can be played with an <audio> element. */
export type NarrationAudio = { filename: string; sizeBytes: number; url: string };
export type NarrationAudioMap = Partial<Record<NarrationPageId, NarrationAudio>>;

type AccessibilityStore = {
  settings: AccessibilitySettings;
  narrations: Narrations;
  /** Admin recordings, by page. A page without an entry is read aloud by the browser voice. */
  audio: NarrationAudioMap;
  saveSettings: (settings: AccessibilitySettings) => void;
  /** Admin only: saves the text on the server (and in this browser). Rejects if the server refuses. */
  saveNarration: (page: NarrationPageId, text: string) => Promise<void>;
  /** Fetches the latest text and recording info from the server for these pages. Never rejects. */
  loadNarrations: (pages: NarrationPageId[]) => Promise<void>;
  /** Admin only: uploads an MP3 for a page whose text is already saved. */
  uploadAudio: (page: NarrationPageId, file: File) => Promise<void>;
  /** Admin only: removes the recording for a page. */
  removeAudio: (page: NarrationPageId) => Promise<void>;
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

type RemoteNarrations = [NarrationPageId, BackendNarration | null][];

function toAudio(remote: BackendNarration): NarrationAudio | undefined {
  if (!remote.hasAudio) return undefined;
  return {
    filename: remote.audioFilename ?? "recording.mp3",
    sizeBytes: remote.audioSizeBytes ?? 0,
    // The version in the address makes the browser fetch a replaced recording again.
    url: `${narrationAudioUrl(remote.pageKey)}?v=${encodeURIComponent(
      `${remote.updatedAt}-${remote.audioSizeBytes ?? 0}`,
    )}`,
  };
}

function mergeText(current: Narrations, remote: RemoteNarrations): Narrations {
  let next = current;
  for (const [id, item] of remote) {
    // A page that only has a recording comes back with empty text: keep any text we already have.
    if (item && item.transcript && next[id] !== item.transcript) next = { ...next, [id]: item.transcript };
  }
  return next;
}

function mergeAudio(current: NarrationAudioMap, remote: RemoteNarrations): NarrationAudioMap {
  let next = current;
  for (const [id, item] of remote) {
    if (!item) continue;
    const audio = toAudio(item);
    if (audio?.url === next[id]?.url) continue;
    next = { ...next };
    if (audio) next[id] = audio;
    else delete next[id];
  }
  return next;
}

function rememberNarrations(next: Narrations) {
  try {
    localStorage.setItem("eventease-page-narrations", JSON.stringify(next));
  } catch {
    /* storage unavailable: the server copy is still the source of truth */
  }
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(initialSettings);
  const [narrations, setNarrations] = useState<Narrations>(initialNarrations);
  const [audio, setAudio] = useState<NarrationAudioMap>({});
  const value = useMemo(
    () => ({
      settings,
      narrations,
      audio,
      saveSettings: (next: AccessibilitySettings) => {
        setSettings(next);
        localStorage.setItem("eventease-accessibility-settings", JSON.stringify(next));
      },
      saveNarration: async (page: NarrationPageId, text: string) => {
        const saved = await saveBackendNarration(page, text);
        const remote: RemoteNarrations = [[page, saved]];
        setNarrations((current) => {
          const next = mergeText(current, remote);
          rememberNarrations(next);
          return next;
        });
        setAudio((current) => mergeAudio(current, remote));
      },
      loadNarrations: async (pages: NarrationPageId[]) => {
        const remote: RemoteNarrations = await Promise.all(
          pages.map(async (id) => {
            try {
              return [id, await fetchBackendNarration(id)] as [NarrationPageId, BackendNarration | null];
            } catch {
              return [id, null] as [NarrationPageId, BackendNarration | null]; // offline: keep what we have
            }
          }),
        );
        setNarrations((current) => {
          const next = mergeText(current, remote);
          if (next !== current) rememberNarrations(next);
          return next;
        });
        setAudio((current) => mergeAudio(current, remote));
      },
      uploadAudio: async (page: NarrationPageId, file: File) => {
        const saved = await uploadBackendNarrationAudio(page, file);
        setAudio((current) => mergeAudio(current, [[page, saved]]));
      },
      removeAudio: async (page: NarrationPageId) => {
        await deleteBackendNarrationAudio(page);
        setAudio((current) => {
          const next = { ...current };
          delete next[page];
          return next;
        });
      },
    }),
    [settings, narrations, audio],
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
