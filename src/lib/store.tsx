import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<EventItem[]>(seedEvents);
  const [bookings, setBookings] = useState<Booking[]>(seedBookings);
  const [exchange, setExchange] = useState<ExchangeListing[]>(seedExchange);
  const [posts, setPosts] = useState<CommunityPost[]>(seedPosts);
  const [fraud, setFraud] = useState<FraudAlert[]>(seedFraud);
  const [organizers, setOrganizers] = useState<OrganizerAccount[]>(seedOrganizers);

  const value = useMemo<Store>(() => {
    return {
      user,
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
      cancelBooking: (id) =>
        setBookings((b) => b.map((x) => (x.id === id ? { ...x, status: "refunded" } : x))),
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
      createEvent: (e) => setEvents((evs) => [{ ...e, status: "pending" }, ...evs]),
      setEventStatus: (id, status) =>
        setEvents((evs) => evs.map((e) => (e.id === id ? { ...e, status } : e))),
      setOrganizerStatus: (id, status) =>
        setOrganizers((o) => o.map((x) => (x.id === id ? { ...x, status } : x))),
      resolveFraud: (id) =>
        setFraud((f) => f.map((x) => (x.id === id ? { ...x, resolved: true } : x))),
    };
  }, [user, events, bookings, exchange, posts, fraud, organizers]);

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
