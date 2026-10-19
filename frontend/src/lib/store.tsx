import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import {
  seedEvents,
  seedBookings,
  seedExchange,
  seedPosts,
  seedFraud,
  seedOrganizers,
  seedAssistanceRequests,
  type Role,
  type EventItem,
  type Booking,
  type ExchangeListing,
  type CommunityPost,
  type FraudAlert,
  type OrganizerAccount,
  type SeatBooking,
  type AssistanceRequest,
  type AssistanceLevel,
} from "./data";
import { fetchLiveEvents } from "./eventsApi";
import {
  ApiError,
  backendCancelBooking,
  backendCreateEvent,
  backendLogin,
  backendLogout,
  backendSetEventStatus,
  fetchBackendEvents,
  fetchBackendRoleEvents,
} from "./backendApi";

export type User = { id: string; name: string; email: string; role: Role };

type Store = {
  user: User | null;
  authenticate: (username: string, password: string) => Promise<User | null>;
  logout: () => void;

  events: EventItem[];
  eventsSource: "loading" | "backend" | "ticketmaster" | "curated";
  bookings: Booking[];
  exchange: ExchangeListing[];
  posts: CommunityPost[];
  fraud: FraudAlert[];
  organizers: OrganizerAccount[];
  assistanceRequests: AssistanceRequest[];

  book: (eventId: string, seats: SeatBooking[], total: number, promo?: string) => Booking;
  cancelBooking: (id: string) => void;
  listForResale: (id: string, seat: string, ask: number) => void;
  addPost: (p: Omit<CommunityPost, "id" | "when" | "likes">) => void;
  createEvent: (e: EventItem) => void;
  setEventStatus: (id: string, status: EventItem["status"]) => void;
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
  const [events, setEvents] = useState<EventItem[]>(seedEvents);
  const [eventsSource, setEventsSource] = useState<Store["eventsSource"]>("loading");
  const [bookings, setBookings] = useState<Booking[]>(seedBookings);
  const [exchange, setExchange] = useState<ExchangeListing[]>(seedExchange);
  const [posts, setPosts] = useState<CommunityPost[]>(seedPosts);
  const [fraud, setFraud] = useState<FraudAlert[]>(seedFraud);
  const [organizers, setOrganizers] = useState<OrganizerAccount[]>(seedOrganizers);
  const [assistanceRequests, setAssistanceRequests] =
    useState<AssistanceRequest[]>(seedAssistanceRequests);

  useEffect(() => {
    let active = true;
    fetchBackendEvents()
      .then((backendEvents) => {
        if (!active) return;
        if (backendEvents.length) {
          setEvents(backendEvents);
          setEventsSource("backend");
          return;
        }
        return fetchLiveEvents().then((live) => {
          if (!active) return;
          if (live.length) {
            setEvents(live);
            setEventsSource("ticketmaster");
          } else {
            setEventsSource("curated");
          }
        });
      })
      .catch(() =>
        fetchLiveEvents()
          .then((live) => {
            if (!active) return;
            if (live.length) setEvents(live);
            setEventsSource(live.length ? "ticketmaster" : "curated");
          })
          .catch(() => active && setEventsSource("curated")),
      );
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<Store>(() => {
    return {
      user,
      authenticate: async (username, password) => {
        const normalized = username.trim().toLowerCase();
        const auth = await backendLogin(normalized, password);
        const role = auth.user.role === "ORGANISER" ? "organizer" : (auth.user.role.toLowerCase() as Role);
        const account = {
          id: auth.user.id,
          name: auth.user.username,
          email: "",
          role,
        };
        const roleEvents = await fetchBackendRoleEvents(auth.user.role).catch(() => []);
        if (roleEvents.length) {
          setEvents(roleEvents);
          setEventsSource("backend");
        }
        setUser(account);
        return account;
      },
      logout: () => {
        void backendLogout();
        setUser(null);
      },
      events,
      eventsSource,
      bookings,
      exchange,
      posts,
      fraud,
      organizers,
      assistanceRequests,
      book: (eventId, seats, total, promo) => {
        const ref = "EE-" + Math.random().toString(36).slice(2, 8).toUpperCase();
        const bk: Booking = {
          id: "bk-" + Date.now(),
          ref,
          eventId,
          userId: user?.id ?? "u-cust",
          seats,
          total,
          purchasedAt: new Date().toISOString(),
          status: "confirmed",
          promo,
        };
        setBookings((b) => [bk, ...b]);
        setEvents((evs) =>
          evs.map((e) => {
            if (e.id !== eventId) return e;
            const tiers = e.tiers.map((t) => {
              const n = seats.filter((s) => s.tier === t.name).length;
              return n ? { ...t, sold: t.sold + n } : t;
            });
            return { ...e, tiers };
          }),
        );
        return bk;
      },
      cancelBooking: (id) => {
        void backendCancelBooking(id);
        setBookings((b) => b.map((x) => (x.id === id ? { ...x, status: "refunded" } : x)));
      },
      listForResale: (id, seat, ask) => {
        setBookings((b) => b.map((x) => (x.id === id ? { ...x, status: "listed" } : x)));
        const bk = bookings.find((x) => x.id === id);
        if (!bk) return;
        setExchange((ex) => [
          {
            id: "ex-" + Date.now(),
            bookingId: id,
            eventId: bk.eventId,
            sellerName: user?.name ?? "You",
            seat,
            tier: bk.seats.find((s) => s.seat === seat)?.tier ?? "Standard",
            askPrice: ask,
            verified: true,
          },
          ...ex,
        ]);
      },
      addPost: (p) =>
        setPosts((all) => [
          { ...p, id: "p-" + Date.now(), when: "now", likes: 0 },
          ...all,
        ]),
      createEvent: (e) => {
        void backendCreateEvent(e);
        setEvents((evs) => [{ ...e, status: "pending" }, ...evs]);
      },
      setEventStatus: (id, status) => {
        void backendSetEventStatus(id, status);
        setEvents((evs) => evs.map((e) => (e.id === id ? { ...e, status } : e)));
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
    events,
    eventsSource,
    bookings,
    exchange,
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

export const currency = (n: number) => "S$" + n.toLocaleString("en-SG");
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
