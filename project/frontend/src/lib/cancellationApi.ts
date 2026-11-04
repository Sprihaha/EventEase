import { request } from "./backendApi";

export type CancellationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CancellationRequest {
  id: string; status: CancellationStatus; reason: string; decisionNote: string | null;
  createdAt: string; decidedAt: string | null; requestedBy: string | null; decidedBy: string | null;
  eventId: string; eventTitle: string; eventStatus: string; venueName: string; startAt: string;
  paidBookings: number; ticketsSold: number; amountToRefundCents: number;
  refundedBookings: number; refundedCents: number; failedRefunds: number;
}

/** The organiser's latest request for one event, as returned with the event on My events. */
export interface CancellationBrief {
  id: string; status: CancellationStatus; reason: string; decisionNote: string | null;
  createdAt: string; decidedAt: string | null;
}

// ----- administrator
export const fetchCancellationRequests = (status?: CancellationStatus) =>
  request<CancellationRequest[]>(`/admin/event-cancellations${status ? `?status=${status}` : ""}`, {}, true);
export const countPendingCancellations = async () => (await fetchCancellationRequests("PENDING")).length;
export const approveCancellation = (id: string, note?: string) =>
  request<CancellationRequest>(`/admin/event-cancellations/${encodeURIComponent(id)}/approve`,
    { method: "POST", body: JSON.stringify({ note: note || null }) }, true);
export const rejectCancellation = (id: string, note: string) =>
  request<CancellationRequest>(`/admin/event-cancellations/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: JSON.stringify({ note }) }, true);

// ----- organiser
export const requestEventCancellation = (eventId: string, reason: string) =>
  request(`/organiser/events/${encodeURIComponent(eventId)}/cancellation-request`,
    { method: "POST", body: JSON.stringify({ reason }) }, true);
