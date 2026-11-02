import { request } from "./client";

// EaseAnalytics (Package E): read-only, confirmed bookings only, SGD cents, Singapore days.
// The downloadable report (/organiser/analytics/export) uses the same backend queries.

export type AnalyticsEventSales = {
  eventId: string;
  title: string;
  confirmedBookings: number;
  ticketsSold: number;
  revenueCents: number;
};

export type AnalyticsSales = {
  currency: string;
  confirmedBookings: number;
  totalTicketsSold: number;
  totalRevenueCents: number;
  events: AnalyticsEventSales[];
};

export type AnalyticsRevenuePoint = {
  day: string;
  ticketsSold: number;
  revenueCents: number;
  cumulativeRevenueCents: number;
};

export type AnalyticsRevenueVelocity = {
  currency: string;
  days: number;
  totalRevenueCents: number;
  averageDailyRevenueCents: number;
  points: AnalyticsRevenuePoint[];
};

export type AnalyticsTierDemand = {
  currency: string;
  totalTicketsSold: number;
  tiers: { type: string; ticketsSold: number; revenueCents: number; sharePercent: number }[];
};

const eventQuery = (eventId?: string) => (eventId ? `eventId=${encodeURIComponent(eventId)}` : "");

export function fetchAnalyticsSales(eventId?: string) {
  const query = eventQuery(eventId);
  return request<AnalyticsSales>(`/organiser/analytics/sales${query ? `?${query}` : ""}`, {}, true);
}

export function fetchAnalyticsRevenueVelocity(days: number, eventId?: string) {
  const query = [`days=${days}`, eventQuery(eventId)].filter(Boolean).join("&");
  return request<AnalyticsRevenueVelocity>(`/organiser/analytics/revenue-velocity?${query}`, {}, true);
}

export function fetchAnalyticsTierDemand(eventId?: string) {
  const query = eventQuery(eventId);
  return request<AnalyticsTierDemand>(`/organiser/analytics/tier-demand${query ? `?${query}` : ""}`, {}, true);
}
