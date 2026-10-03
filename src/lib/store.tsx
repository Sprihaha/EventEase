import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadOrSeedState, saveCollection, type EventEaseState } from "./api";
import {
  seedEvents,
  seedBookings,
  seedExchange,
  seedPosts,
  seedFraud,
  seedOrganizers,
  type Role,
  type EventItem,
  type Booking,
  type ExchangeListing,
  type CommunityPost,
  type FraudAlert,
  type OrganizerAccount,
  type SeatBooking,
} from "./data";

export type User = { id: string; name: string; email: string; role: Role };

const demoUsers: Record<Role, User> = {
  customer: { id: "u-cust", name: "Alex Chen", email: "alex@eventease.io", role: "customer" },
  organizer: { id: "org-livenation", name: "Live Nation Asia", email: "ops@livenation.asia", role: "organizer" },
  admin: { id: "u-admin", name: "Sam Rivera", email: "sam@eventease.io", role: "admin" },
};

type Store = {
  user: User | null;
  isLoading: boolean;
  syncError: string | null;
  login: (role: Role) => void;
  logout: () => void;

  events: EventItem[];
  bookings: Booking[];
  exchange: ExchangeListing[];
  posts: CommunityPost[];
  fraud: FraudAlert[];
  organizers: OrganizerAccount[];

  book: (eventId: string, seats: SeatBooking[], total: number, promo?: string) => Booking;
  cancelBooking: (id: string) => void;
  listForResale: (id: string, seat: string, ask: number) => void;
  addPost: (p: Omit<CommunityPost, "id" | "when" | "likes">) => void;
  createEvent: (e: EventItem) => void;
  setEventStatus: (id: string, status: EventItem["status"]) => void;
  setOrganizerStatus: (id: string, status: OrganizerAccount["status"]) => void;
  resolveFraud: (id: string) => void;
};

const Ctx = createContext<Store | null>(null);

const seedState: EventEaseState = {
  events: seedEvents,
  bookings: seedBookings,
  exchange: seedExchange,
  posts: seedPosts,
  fraud: seedFraud,
  organizers: seedOrganizers,
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<EventItem[]>(seedEvents);
  const [bookings, setBookings] = useState<Booking[]>(seedBookings);
  const [exchange, setExchange] = useState<ExchangeListing[]>(seedExchange);
  const [posts, setPosts] = useState<CommunityPost[]>(seedPosts);
  const [fraud, setFraud] = useState<FraudAlert[]>(seedFraud);
  const [organizers, setOrganizers] = useState<OrganizerAccount[]>(seedOrganizers);
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    loadOrSeedState(seedState)
      .then((state) => {
        if (!active) return;
        setEvents(state.events);
        setBookings(state.bookings);
        setExchange(state.exchange);
        setPosts(state.posts);
        setFraud(state.fraud);
        setOrganizers(state.organizers);
        setSyncError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSyncError(error instanceof Error ? error.message : "Could not sync with Supabase");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const persist = <K extends keyof EventEaseState>(collection: K, value: EventEaseState[K]) => {
    void saveCollection(collection, value).catch((error: unknown) => {
      setSyncError(error instanceof Error ? error.message : "Could not sync with Supabase");
    });
  };

  const value = useMemo<Store>(() => {
    return {
      user,
      isLoading,
      syncError,
      login: (role) => setUser(demoUsers[role]),
      logout: () => setUser(null),
      events,
      bookings,
      exchange,
      posts,
      fraud,
      organizers,
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
        setBookings((current) => {
          const next = [bk, ...current];
          persist("bookings", next);
          return next;
        });
        setEvents((current) => {
          const next = current.map((e) => {
            if (e.id !== eventId) return e;
            const tiers = e.tiers.map((t) => {
              const n = seats.filter((s) => s.tier === t.name).length;
              return n ? { ...t, sold: t.sold + n } : t;
            });
            return { ...e, tiers };
          });
          persist("events", next);
          return next;
        });
        return bk;
      },
      cancelBooking: (id) =>
        setBookings((current) => {
          const next = current.map((x) =>
            x.id === id ? { ...x, status: "refunded" as const } : x,
          );
          persist("bookings", next);
          return next;
        }),
      listForResale: (id, seat, ask) => {
        setBookings((current) => {
          const next = current.map((x) =>
            x.id === id ? { ...x, status: "listed" as const } : x,
          );
          persist("bookings", next);
          return next;
        });
        const bk = bookings.find((x) => x.id === id);
        if (!bk) return;
        setExchange((current) => {
          const next = [{
            id: "ex-" + Date.now(),
            bookingId: id,
            eventId: bk.eventId,
            sellerName: user?.name ?? "You",
            seat,
            tier: bk.seats.find((s) => s.seat === seat)?.tier ?? "Standard",
            askPrice: ask,
            verified: true,
          }, ...current];
          persist("exchange", next);
          return next;
        });
      },
      addPost: (p) =>
        setPosts((current) => {
          const next = [{ ...p, id: "p-" + Date.now(), when: "now", likes: 0 }, ...current];
          persist("posts", next);
          return next;
        }),
      createEvent: (e) =>
        setEvents((current) => {
          const next = [{ ...e, status: "pending" as const }, ...current];
          persist("events", next);
          return next;
        }),
      setEventStatus: (id, status) =>
        setEvents((current) => {
          const next = current.map((e) => (e.id === id ? { ...e, status } : e));
          persist("events", next);
          return next;
        }),
      setOrganizerStatus: (id, status) =>
        setOrganizers((current) => {
          const next = current.map((x) => (x.id === id ? { ...x, status } : x));
          persist("organizers", next);
          return next;
        }),
      resolveFraud: (id) =>
        setFraud((current) => {
          const next = current.map((x) => (x.id === id ? { ...x, resolved: true } : x));
          persist("fraud", next);
          return next;
        }),
    };
  }, [user, isLoading, syncError, events, bookings, exchange, posts, fraud, organizers]);

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
