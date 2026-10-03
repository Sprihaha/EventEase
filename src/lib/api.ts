import type {
  Booking,
  CommunityPost,
  EventItem,
  ExchangeListing,
  FraudAlert,
  OrganizerAccount,
} from "./data";

export type EventEaseState = {
  events: EventItem[];
  bookings: Booking[];
  exchange: ExchangeListing[];
  posts: CommunityPost[];
  fraud: FraudAlert[];
  organizers: OrganizerAccount[];
};

export type StateCollection = keyof EventEaseState;

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const defaultApiUrl = "https://eventease-backend-fbpd.onrender.com";
const apiUrl = (configuredApiUrl || defaultApiUrl).replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function loadOrSeedState(seed: EventEaseState) {
  return request<EventEaseState>("/state/bootstrap", {
    method: "POST",
    body: JSON.stringify(seed),
  });
}

export function saveCollection<K extends StateCollection>(collection: K, value: EventEaseState[K]) {
  return request<{ ok: true }>(`/state/${collection}`, {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

export function verifyTicket(ref: string) {
  return request<{ booking: Booking; event: EventItem | null } | null>(
    `/tickets/${encodeURIComponent(ref)}`,
  );
}
