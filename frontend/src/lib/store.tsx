import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type Context,
  type ReactNode,
} from "react";
import {
  seedPosts,
  seedFraud,
  seedOrganizers,
  seedAssistanceRequests,
  type Role,
  type EventItem,
  type Booking,
  type CommunityPost,
  type FraudAlert,
  type OrganizerAccount,
  type AssistanceRequest,
  type AssistanceLevel,
} from "./data";
import {
  backendMe,
  hasBackendSession,
  backendCancelBooking,
  backendCreateEvent,
  backendLogin,
  backendLogout,
  backendSetEventStatus,
  fetchBackendEvents,
  fetchBackendRoleEvents,
  type BackendAuth,
  type NewEventInput,
} from "./backendApi";
import { isTokenExpired, getTokenExpirationMs, notifySessionExpired, onSessionExpired, clearSavedExpiredReturnTo } from "./session";

import { fetchBookings, bookingForStore } from "./ticketingApi";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  // Set when the backend requires a new password before anything else (e.g. after an admin reset).
  mustChangePassword?: boolean;
  // False for the protected shared accounts, whose password can never change.
  canChangePassword?: boolean;
};

type Store = {
  user: User | null;
  authenticate: (username: string, password: string) => Promise<User | null>;
  startSession: (auth: BackendAuth) => Promise<User>;
  logout: () => void;

  events: EventItem[];
  publicEvents: EventItem[];
  eventsSource: "loading" | "backend" | "error";
  sessionLoading: boolean;
  eventsError: string | null;
  bookingsError: string | null;
  refreshBookings: () => Promise<void>;
  bookings: Booking[];
  posts: CommunityPost[];
  fraud: FraudAlert[];
  organizers: OrganizerAccount[];
  assistanceRequests: AssistanceRequest[];

  cancelBooking: (id: string) => Promise<void>;
  addPost: (p: Omit<CommunityPost, "id" | "when" | "likes">) => void;
  createEvent: (input: NewEventInput) => Promise<void>;
  setEventStatus: (id: string, status: EventItem["status"]) => Promise<void>;
  setOrganizerStatus: (id: string, status: OrganizerAccount["status"]) => void;
  resolveFraud: (id: string) => void;
  addAssistanceRequest: (
    bookingId: string,
    eventId: string,
    supportNeeds: string,
    level: AssistanceLevel,
  ) => AssistanceRequest;
  cancelAssistanceRequest: (id: string) => void;
  updateAssistanceRequest: (
    id: string,
    update: Pick<AssistanceRequest, "assignedStaff" | "status">,
  ) => void;
};

// Keep one context identity across Vite hot updates. Without this, consumers
// refreshed before the provider can temporarily read from a newly-created,
// unprovided context.
const storeGlobal = globalThis as typeof globalThis & {
  __eventEaseStoreContext?: Context<Store | null>;
};
const Ctx = storeGlobal.__eventEaseStoreContext ?? createContext<Store | null>(null);
storeGlobal.__eventEaseStoreContext = Ctx;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [publicEvents, setPublicEvents] = useState<EventItem[]>([]);
  const [eventsSource, setEventsSource] = useState<Store["eventsSource"]>("loading");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const accountId = useRef<string | null>(null);
  const accountRole = useRef<Role | null>(null);
  const loadBookings = async (id: string) => {
    try {
      const result = await fetchBookings();
      if (accountId.current === id) { setBookings(result.map(b => bookingForStore(b, id))); setBookingsError(null); }
    } catch (cause) {
      if (accountId.current === id) { setBookings([]); setBookingsError(cause instanceof Error ? cause.message : "Could not load bookings."); }
    }
  };
  const [posts, setPosts] = useState<CommunityPost[]>(seedPosts);
  const [fraud, setFraud] = useState<FraudAlert[]>(seedFraud);
  const [organizers, setOrganizers] = useState<OrganizerAccount[]>(seedOrganizers);
  const [assistanceRequests, setAssistanceRequests] =
    useState<AssistanceRequest[]>(seedAssistanceRequests);

  useEffect(() => {
    let active = true;
    fetchBackendEvents().then(result => {
      if (active) setPublicEvents(result);
      if (active && accountRole.current !== "organizer" && accountRole.current !== "admin") { setEvents(result); setEventsSource("backend"); setEventsError(null); }
    }).catch(cause => {
      if (active) { setEvents([]); setEventsSource("error"); setEventsError(cause instanceof Error ? cause.message : "Could not load events."); }
    });
    if (hasBackendSession()) {
      if (isTokenExpired()) {
        notifySessionExpired();
        setSessionLoading(false);
        return;
      }
      backendMe().then(account => {
        if (!active) return;
        const role = account.role === "ORGANISER" ? "organizer" : account.role.toLowerCase() as Role;
        accountId.current = account.id;
        accountRole.current = role;
        setUser({
          id: account.id,
          name: account.username,
          email: account.email ?? "",
          role,
          mustChangePassword: account.mustChangePassword,
          canChangePassword: account.passwordChangeable,
        });
        if (role === "customer") void loadBookings(account.id);
        else void fetchBackendRoleEvents(account.role, account.id).then(result => { if (active) { setEvents(result); setEventsSource("backend"); } }).catch(() => { if (active) { setEvents([]); setEventsError("Could not load managed events."); } });
      }).catch(() => { if (active) { accountId.current = null; setUser(null); setBookings([]); void backendLogout(); } })
        .finally(() => active && setSessionLoading(false));
    } else setSessionLoading(false);
    return () => { active = false; };
  }, []);

  // Active session expiration timer & watcher
  useEffect(() => {
    if (!user) return;
    const checkExpiry = () => {
      if (isTokenExpired()) {
        notifySessionExpired();
      }
    };

    const expMs = getTokenExpirationMs();
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (expMs) {
      const remaining = expMs - Date.now();
      if (remaining <= 0) {
        notifySessionExpired();
      } else {
        timer = setTimeout(() => {
          notifySessionExpired();
        }, Math.max(0, remaining));
      }
    }

    const interval = setInterval(checkExpiry, 5000);
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [user]);

  // Handle session expired broadcast: clean up local store state
  useEffect(() => {
    return onSessionExpired(() => {
      accountId.current = null;
      accountRole.current = null;
      setUser(null);
      setBookings([]);
      setBookingsError(null);
    });
  }, []);

  const value = useMemo<Store>(() => {
    // Loads the signed-in user's data from a backend session (after login or a password reset).
    const startSession = async (auth: BackendAuth): Promise<User> => {
      const role = auth.user.role === "ORGANISER" ? "organizer" : (auth.user.role.toLowerCase() as Role);
      const account: User = {
        id: auth.user.id,
        name: auth.user.username,
        email: "",
        role,
        mustChangePassword: auth.mustChangePassword,
        canChangePassword: auth.user.passwordChangeable,
      };
      setEvents([]);
      try {
        const publicResult = await fetchBackendEvents();
        setPublicEvents(publicResult);
        setEvents(role === "customer" ? publicResult : await fetchBackendRoleEvents(auth.user.role, auth.user.id));
        setEventsSource("backend");
        setEventsError(null);
      } catch (cause) {
        setEventsSource("error");
        setEventsError(cause instanceof Error ? cause.message : "Could not load events.");
      }
      accountId.current = account.id;
      accountRole.current = role;
      setBookings([]);
      setUser(account);
      if (role === "customer") await loadBookings(account.id);
      return account;
    };
    return {
      user,
      sessionLoading, eventsError, bookingsError,
      refreshBookings: async () => { if (user?.role === "customer") await loadBookings(user.id); },
      authenticate: async (username, password) => startSession(await backendLogin(username.trim().toLowerCase(), password)),
      startSession,
      logout: () => {
        void backendLogout();
        clearSavedExpiredReturnTo();
        accountId.current = null;
        accountRole.current = null;
        setUser(null);
        setBookings([]);
        setBookingsError(null);
        void fetchBackendEvents().then(result => { setPublicEvents(result); setEvents(result); setEventsSource("backend"); }).catch(() => { setPublicEvents([]); setEvents([]); setEventsSource("error"); });
      },
      events,
      publicEvents,
      eventsSource,
      bookings,
      posts,
      fraud,
      organizers,
      assistanceRequests,
      cancelBooking: async (id) => {
        if (!user) throw new Error("Please sign in.");
        await backendCancelBooking(id);
        await loadBookings(user.id);
      },
      addPost: (p) =>
        setPosts((all) => [
          { ...p, id: "p-" + Date.now(), when: "now", likes: 0 },
          ...all,
        ]),
      createEvent: async (input) => {
        await backendCreateEvent(input);
        if (user) setEvents(await fetchBackendRoleEvents("ORGANISER", user.id));
      },
      setEventStatus: async (id, status) => {
        await backendSetEventStatus(id, status);
        if (user) setEvents(await fetchBackendRoleEvents("ADMIN", user.id));
      },
      setOrganizerStatus: (id, status) =>
        setOrganizers((o) => o.map((x) => (x.id === id ? { ...x, status } : x))),
      resolveFraud: (id) =>
        setFraud((f) => f.map((x) => (x.id === id ? { ...x, resolved: true } : x))),
      addAssistanceRequest: (bookingId, eventId, supportNeeds, level) => {
        const request: AssistanceRequest = {
          id: `ar-${Date.now()}`,
          bookingId,
          eventId,
          userId: user?.id ?? "u-cust",
          requesterUsername: user?.name ?? "hcy001",
          supportNeeds,
          level,
          status: "Submitted",
          createdAt: new Date().toISOString(),
        };
        setAssistanceRequests((all) => [request, ...all]);
        return request;
      },
      cancelAssistanceRequest: (id) =>
        setAssistanceRequests((all) =>
          all.map((request) =>
            request.id === id ? { ...request, status: "Cancelled" } : request,
          ),
        ),
      updateAssistanceRequest: (id, update) =>
        setAssistanceRequests((all) =>
          all.map((request) => (request.id === id ? { ...request, ...update } : request)),
        ),
    };
  }, [
    user,
    sessionLoading, eventsError, bookingsError,
    events,
    publicEvents,
    eventsSource,
    bookings,
    posts,
    fraud,
    organizers,
    assistanceRequests,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}

export const currency = (n: number) => "S$" + n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
