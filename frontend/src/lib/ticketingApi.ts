import { request } from "./backendApi";
import type { Booking } from "./data";

export interface LiveSeat {
  id: string; label: string; row: string; number: number;
  ticketCategoryId: string; categoryType: string; categoryName: string;
  seatSection: string; priceCents: number;
  status: "AVAILABLE" | "HELD" | "SOLD" | "UNAVAILABLE";
  isAccessible?: boolean;
}
export interface TicketCategory {
  id: string; type: string; name: string; seatSection: string | null;
  priceCents: number; remaining: number; onSale: boolean;
}
export interface TicketingEvent {
  id: string; title: string; description: string | null; startAt: string; endAt: string;
  venueName: string; imageUrl: string | null; purchasable: boolean; externalUrl: string | null;
  purchaseLimitPerEvent: number; ticketCategories: TicketCategory[];
}
export interface IssuedTicket {
  id: string; code: string; status: string; ticketCategoryId: string;
  seatLabel: string | null; checkedInAt: string | null;
}
export interface BackendBooking {
  id: string; status: "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "REFUNDED";
  event: { id: string; title: string; startAt: string; endAt: string; venueName: string; imageUrl: string | null };
  items: { ticketCategoryId: string; name: string; quantity: number; unitPriceCents: number }[];
  tickets: IssuedTicket[]; totalCents: number; currency: string; holdExpiresAt: string | null;
  createdAt: string; cancellable: boolean;
}
export interface OwnedTicket {
  id: string; code: string; status: string; bookingId: string; bookingStatus: string;
  event: BackendBooking["event"]; categoryType: string; categoryName: string;
  unitPriceCents: number; seatLabel: string | null; seatSection: string | null; checkedInAt: string | null;
}
export interface Verification {
  valid: boolean; status: string; eventTitle: string; seatLabel: string | null;
  checkedInAt: string | null; message: string;
}

export const fetchTicketingEvent = (id: string, signal?: AbortSignal) =>
  request<TicketingEvent>(`/events/${encodeURIComponent(id)}`, { signal }, true);
export const fetchSeats = (id: string, signal?: AbortSignal) =>
  request<LiveSeat[]>(`/events/${encodeURIComponent(id)}/seats`, { signal });
export async function holdSeats(eventId: string, seats: LiveSeat[], key: string) {
  const counts = new Map<string, number>();
  for (const seat of seats) counts.set(seat.ticketCategoryId, (counts.get(seat.ticketCategoryId) ?? 0) + 1);
  return request<BackendBooking>("/bookings", { method: "POST", headers: { "Idempotency-Key": key },
    body: JSON.stringify({ eventId, seatIds: seats.map(s => s.id),
      items: [...counts].map(([ticketCategoryId, quantity]) => ({ ticketCategoryId, quantity })) }) }, true);
}
export const payBooking = (id: string, fail = false) => request<BackendBooking>(`/bookings/${encodeURIComponent(id)}/pay`,
  { method: "POST", body: JSON.stringify({ paymentMethod: fail ? "mock_fail" : "mock_success" }) }, true);
export const cancelHeldBooking = (id: string) => request<BackendBooking>(`/me/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" }, true);
export async function fetchBookings(signal?: AbortSignal) {
  const all: BackendBooking[] = [];
  for (let page = 1; ; page++) {
    const response = await request<{ items: BackendBooking[]; totalPages: number }>(`/me/bookings?page=${page}&pageSize=100`, { signal }, true);
    all.push(...response.items);
    if (page >= response.totalPages) return all;
  }
}
export const fetchOwnedTickets = (signal?: AbortSignal) => request<OwnedTicket[]>("/me/tickets/history", { signal }, true);
export const verifyTicket = (code: string, signal?: AbortSignal) => request<Verification>(`/tickets/${encodeURIComponent(code)}/verify`, { signal });
export const checkInTicket = (code: string) => request<{ success: boolean; result: string; message: string }>(`/tickets/${encodeURIComponent(code)}/checkin`,
  { method: "POST", body: JSON.stringify({ gate: "Gate 1" }) }, true);

export function bookingForStore(b: BackendBooking, userId: string): Booking {
  return { id: b.id, ref: b.id, eventId: b.event.id, userId, total: b.totalCents / 100,
    purchasedAt: b.createdAt, status: b.status.toLowerCase() as Booking["status"], cancellable: b.cancellable,
    seats: b.tickets.length ? b.tickets.map(t => ({ seat: t.seatLabel ?? "General Admission",
      tier: b.items.find(i => i.ticketCategoryId === t.ticketCategoryId)?.name ?? "Ticket" })) :
      b.items.flatMap(i => Array.from({ length: i.quantity }, () => ({ seat: "Pending issue", tier: i.name }))),
    tickets: b.tickets, event: { title: b.event.title, date: b.event.startAt, venue: b.event.venueName, image: b.event.imageUrl ?? "/event-placeholder.svg" } };
}

export const holdCategories = (eventId: string, items: { ticketCategoryId: string; quantity: number }[], key: string) =>
  request<BackendBooking>("/bookings", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ eventId, items }) }, true);
