import type { Category, EventItem, EventStatus } from "./data";

const API_ORIGIN =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://eventease-backend-qkbl.onrender.com";
const API_ROOT = `${API_ORIGIN}/api/v1`;
const TOKEN_KEY = "eventease-access-token";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type BackendRole = "CUSTOMER" | "ORGANISER" | "ADMIN";

export type BackendAuth = {
  accessToken: string;
  user: { id: string; username: string; role: BackendRole };
  redirectTo: string;
};

type BackendEvent = {
  id: string;
  title: string;
  category: string;
  shortDescription: string | null;
  venueName: string;
  area: string | null;
  startAt: string;
  endAt: string;
  priceRange: { minCents: number; maxCents: number } | null;
  imageUrl: string | null;
  sourceName: string | null;
  purchasable: boolean;
  isSample: boolean;
};

type BackendTicketCategory = {
  id: string;
  name: string;
  priceCents: number;
  quantityTotal: number;
  quantitySold: number;
  remaining: number;
};

type BackendManagedEvent = {
  id: string;
  title: string;
  category: string;
  status: string;
  organiserUsername?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  venueName: string;
  area?: string | null;
  startAt: string;
  imageUrl?: string | null;
  capacity?: number | null;
  ticketCategories?: BackendTicketCategory[];
};

type Page<T> = { items: T[]; total: number };

async function request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (authenticated) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { error?: { message?: string }; detail?: string }
      | null;
    throw new ApiError(
      body?.error?.message ?? body?.detail ?? `Backend request failed (${response.status})`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function category(value: string): Category {
  const normalized = value[0] + value.slice(1).toLowerCase();
  return (["Concert", "Theatre", "Sports", "Cultural"].includes(normalized)
    ? normalized
    : "Concert") as Category;
}

function mapEvent(event: BackendEvent, index: number): EventItem {
  const min = Math.max(20, Math.round((event.priceRange?.minCents ?? 6800) / 100));
  const max = Math.max(min, Math.round((event.priceRange?.maxCents ?? min * 180) / 100));
  return {
    id: event.id,
    title: event.title,
    category: category(event.category),
    date: event.startAt,
    doors: new Date(event.startAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }),
    venue: event.venueName,
    city: event.area ?? "Singapore",
    image:
      event.imageUrl ??
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80",
    blurb: event.shortDescription ?? "An upcoming EventEase experience.",
    organizerId: "org-livenation",
    organizerName: event.sourceName ?? "EventEase Organizer",
    status: "published",
    featured: index < 6,
    rows: 8,
    cols: 12,
    tiers: [
      { id: `${event.id}-vip`, name: "VIP", price: max, total: 24, sold: 0 },
      { id: `${event.id}-standard`, name: "Standard", price: min, total: 56, sold: 0 },
      { id: `${event.id}-concession`, name: "Concession", price: Math.round(min * 0.75), total: 16, sold: 0 },
    ],
  };
}

function managedStatus(status: string): EventStatus {
  if (status === "APPROVED") return "published";
  if (status === "REJECTED") return "rejected";
  if (status === "REVIEW_IN_PROGRESS") return "pending";
  return "draft";
}

function mapManagedEvent(event: BackendManagedEvent, index: number): EventItem {
  const categories = event.ticketCategories ?? [];
  const capacity =
    event.capacity ?? (categories.reduce((sum, item) => sum + item.quantityTotal, 0) || 96);
  const fallbackTotal = Math.max(1, Math.round(capacity / 3));
  const tiers = categories.length
    ? categories.map((item) => ({
        id: item.id,
        name: item.name,
        price: Math.round(item.priceCents / 100),
        total: item.quantityTotal,
        sold: item.quantitySold,
      }))
    : [
        { id: `${event.id}-vip`, name: "VIP", price: 180, total: fallbackTotal, sold: 0 },
        { id: `${event.id}-standard`, name: "Standard", price: 88, total: fallbackTotal, sold: 0 },
        { id: `${event.id}-concession`, name: "Concession", price: 48, total: fallbackTotal, sold: 0 },
      ];
  return {
    id: event.id,
    title: event.title,
    category: category(event.category),
    date: event.startAt,
    doors: new Date(event.startAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }),
    venue: event.venueName,
    city: event.area ?? "Singapore",
    image:
      event.imageUrl ??
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80",
    blurb: event.description ?? event.shortDescription ?? "An EventEase organizer event.",
    organizerId: "org-livenation",
    organizerName: event.organiserUsername ?? "Event 01",
    status: managedStatus(event.status),
    featured: index < 6,
    rows: 8,
    cols: 12,
    tiers,
  };
}

export async function fetchBackendEvents() {
  const page = await request<Page<BackendEvent>>("/events?page=1&pageSize=100&sort=date");
  return page.items.map(mapEvent);
}

export async function fetchBackendRoleEvents(role: BackendRole) {
  if (role === "ORGANISER") {
    const page = await request<Page<BackendManagedEvent>>(
      "/organiser/events?page=1&pageSize=100",
      {},
      true,
    );
    return page.items.map(mapManagedEvent);
  }
  if (role === "ADMIN") {
    const page = await request<Page<BackendManagedEvent>>(
      "/admin/events?page=1&pageSize=100",
      {},
      true,
    );
    const detailed = await Promise.all(
      page.items.map((event) =>
        request<BackendManagedEvent>(`/admin/events/${event.id}`, {}, true).catch(() => event),
      ),
    );
    return detailed.map(mapManagedEvent);
  }
  return [];
}

export async function backendLogin(identifier: string, password: string) {
  const auth = await request<BackendAuth>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  sessionStorage.setItem(TOKEN_KEY, auth.accessToken);
  return auth;
}

export async function backendSignup(account: {
  username: string;
  password: string;
  email: string;
  phone: string;
}) {
  return request<BackendAuth>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ ...account, role: "CUSTOMER" }),
  });
}

export function backendLogout() {
  const operation = request<void>("/auth/logout", { method: "POST" }, true).catch(() => undefined);
  sessionStorage.removeItem(TOKEN_KEY);
  return operation;
}

export function backendSetEventStatus(id: string, status: EventStatus) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve();
  if (status === "published") {
    return request(`/admin/events/${id}/approve`, { method: "POST" }, true);
  }
  if (status === "rejected") {
    return request(
      `/admin/events/${id}/reject`,
      { method: "POST", body: JSON.stringify({ reason: "Not approved by administrator" }) },
      true,
    );
  }
  return Promise.resolve();
}

export function backendCreateEvent(event: EventItem) {
  const capacity = event.tiers.reduce((sum, tier) => sum + tier.total, 0);
  return request(
    "/organiser/events",
    {
      method: "POST",
      body: JSON.stringify({
        title: event.title,
        category: event.category.toUpperCase(),
        shortDescription: event.blurb.slice(0, 300),
        description: event.blurb,
        venueName: event.venue,
        area: event.city,
        startAt: event.date,
        endAt: new Date(new Date(event.date).getTime() + 3 * 60 * 60 * 1000).toISOString(),
        imageUrl: event.image,
        capacity,
      }),
    },
    true,
  );
}

export function backendCancelBooking(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve();
  return request(`/me/bookings/${id}/cancel`, { method: "POST" }, true);
}
