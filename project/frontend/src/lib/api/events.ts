import type { Category, EventItem, EventStatus } from "../data";
import type { BackendRole } from "./auth";
import { pages, request } from "./client";

export type BackendTicketCategory = {
  id: string;
  name: string;
  priceCents: number;
  quantityTotal: number;
  quantitySold: number;
  remaining: number;
};

export type BackendEvent = {
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

export type BackendManagedEvent = {
  id: string;
  title: string;
  category: string;
  status: string;
  organiserUsername?: string | null;
  organiserId?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  venueName: string;
  area?: string | null;
  startAt: string;
  imageUrl?: string | null;
  capacity?: number | null;
  rejectionReason?: string | null;
  ticketCategories?: BackendTicketCategory[];
};

export type NewEventTier = { name: string; type: string; priceCents: number; sectionIds: string[] };

export type NewEventInput = {
  title: string;
  category: string;
  description: string;
  venueId: string;
  startAt: string;
  endAt: string;
  imageUrl: string;
  tiers: NewEventTier[];
};

function category(value: string): Category {
  const normalized = value[0] + value.slice(1).toLowerCase();
  return (["Concert", "Theatre", "Sports", "Cultural"].includes(normalized)
    ? normalized
    : "Concert") as Category;
}

function mapEvent(event: BackendEvent, index: number): EventItem {
  return {
    id: event.id,
    title: event.title,
    category: category(event.category),
    date: event.startAt,
    doors: new Date(event.startAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }),
    venue: event.venueName,
    city: event.area ?? "Singapore",
    image: event.imageUrl ?? "/event-placeholder.svg",
    blurb: event.shortDescription ?? "An upcoming EventEase experience.",
    organizerId: "",
    organizerName: event.sourceName ?? "EventEase Organizer",
    status: "published",
    featured: index < 6,
    rows: 0,
    cols: 0,
    tiers: [],
    priceFrom: event.priceRange ? event.priceRange.minCents / 100 : undefined,
    purchasable: event.purchasable,
  };
}

function managedStatus(status: string): EventStatus {
  if (status === "APPROVED") return "published";
  if (status === "REJECTED") return "rejected";
  if (status === "REVIEW_IN_PROGRESS") return "pending";
  return "draft";
}

function mapManagedEvent(event: BackendManagedEvent, index: number, ownerId = ""): EventItem {
  const categories = event.ticketCategories ?? [];
  const tiers = categories.length
    ? categories.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.priceCents / 100,
        total: item.quantityTotal,
        sold: item.quantitySold,
      }))
    : [];
  return {
    id: event.id,
    title: event.title,
    category: category(event.category),
    date: event.startAt,
    doors: new Date(event.startAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }),
    venue: event.venueName,
    city: event.area ?? "Singapore",
    image: event.imageUrl ?? "/event-placeholder.svg",
    blurb: event.description ?? event.shortDescription ?? "An EventEase organizer event.",
    organizerId: event.organiserId ?? ownerId,
    organizerName: event.organiserUsername ?? "EventEase Organizer",
    status: managedStatus(event.status),
    rejectionReason: event.rejectionReason,
    featured: index < 6,
    rows: 0,
    cols: 0,
    tiers,
  };
}

export async function fetchBackendEvents(): Promise<EventItem[]> {
  return (await pages<BackendEvent>("/events?sort=date")).filter(event => !event.isSample).map(mapEvent);
}

export async function fetchBackendRoleEvents(role: BackendRole, ownerId = ""): Promise<EventItem[]> {
  if (role === "ORGANISER") {
    const events = await pages<BackendManagedEvent>("/organiser/events", true);
    return events.map((e, i) => mapManagedEvent(e, i, ownerId));
  }
  if (role === "ADMIN") {
    const events = await pages<BackendManagedEvent>("/admin/events", true);
    const detailed = await Promise.all(
      events.map((event) =>
        request<BackendManagedEvent>(`/admin/events/${event.id}`, {}, true).catch(() => event),
      ),
    );
    return detailed.map((e, i) => mapManagedEvent(e, i, ownerId));
  }
  return [];
}

export function backendSetEventStatus(id: string, status: EventStatus) {
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
  throw new Error("Unsupported event status change.");
}

export function backendCreateEvent(input: NewEventInput) {
  return request(
    "/organiser/events",
    {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        category: input.category,
        description: input.description || undefined,
        venueId: input.venueId,
        startAt: input.startAt,
        endAt: input.endAt,
        imageUrl: input.imageUrl || undefined,
        initialCategories: input.tiers,
      }),
    },
    true,
  );
}

export function backendEventCategories() {
  return request<string[]>("/events/categories");
}

export function backendTicketCategoryTypes() {
  return request<string[]>("/organiser/ticket-category-types", {}, true);
}

