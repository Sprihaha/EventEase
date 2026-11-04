import { request } from "./backendApi";

export interface PromoCode {
  id: string; eventId: string; eventTitle: string; code: string; percentOff: number;
  maxRedemptions: number | null; startsAt: string | null; endsAt: string | null; active: boolean;
  redemptions: number; discountGivenCents: number; createdAt: string;
}
export interface NewPromoCode {
  eventId: string; code: string; percentOff: number;
  maxRedemptions?: number | null; startsAt?: string | null; endsAt?: string | null;
}

export const fetchPromoCodes = (signal?: AbortSignal) =>
  request<PromoCode[]>("/organiser/promo-codes", { signal }, true);
export const createPromoCode = (body: NewPromoCode) =>
  request<PromoCode>("/organiser/promo-codes", { method: "POST", body: JSON.stringify(body) }, true);
export const setPromoActive = (id: string, active: boolean) =>
  request<PromoCode>(`/organiser/promo-codes/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ active }) }, true);

/** Checkout: is this code valid for the event right now? Rejects with the reason if not. */
export const checkPromoCode = (eventId: string, code: string) =>
  request<{ code: string; percentOff: number }>(
    `/events/${encodeURIComponent(eventId)}/promo-codes/${encodeURIComponent(code.trim())}`, {}, true);

/** Same rounding as the server: the discount comes off each ticket, to the nearest cent. */
export const discountedCents = (unitCents: number, percentOff: number) =>
  unitCents - Math.round((unitCents * percentOff) / 100);
