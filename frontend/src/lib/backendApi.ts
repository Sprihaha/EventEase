import type { Category, EventItem, EventStatus } from "./data";

const API_ORIGIN =
  ((import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL) as string | undefined)?.replace(/\/$/, "") ??
  "https://eventease-backend-fbpd.onrender.com";
if ((import.meta.env.VITE_LOCAL_SANDBOX === "true" || import.meta.env.VITE_LOCAL_ONLY === "true") && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(API_ORIGIN).hostname)) {
  throw new Error("Local testing refuses a nonlocal API URL.");
}
const API_ROOT = `${API_ORIGIN}/api/v1`;
import { TOKEN_KEY, isTokenExpired, notifySessionExpired } from "./session";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "",
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type BackendRole = "CUSTOMER" | "ORGANISER" | "ADMIN";

export type BackendAuth = {
  accessToken: string;
  user: { id: string; username: string; role: BackendRole; passwordChangeable: boolean };
  redirectTo: string;
  mustChangePassword: boolean;
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

type Page<T> = { items: T[]; total: number; totalPages: number };
async function pages<T>(path: string, authenticated = false): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const response = await request<Page<T>>(`${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=100`, {}, authenticated);
    result.push(...response.items);
    if (page >= response.totalPages) return result;
  }
}

export async function request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (authenticated) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      if (isTokenExpired(token)) {
        notifySessionExpired();
        throw new ApiError("Session expired, please login again", 401, "TOKEN_EXPIRED");
      }
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { error?: { code?: string; message?: string; details?: Record<string, unknown> }; detail?: string }
      | null;
    if (
      response.status === 401 &&
      (authenticated || body?.error?.code === "TOKEN_EXPIRED") &&
      path !== "/auth/login"
    ) {
      notifySessionExpired();
    }
    throw new ApiError(
      body?.error?.message ?? body?.detail ?? `Backend request failed (${response.status})`,
      response.status,
      body?.error?.code,
      body?.error?.details,
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
      "/event-placeholder.svg",
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
    image:
      event.imageUrl ??
      "/event-placeholder.svg",
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

export async function fetchBackendEvents() {
  return (await pages<BackendEvent>("/events?sort=date")).filter(event => !event.isSample).map(mapEvent);
}

export async function fetchBackendRoleEvents(role: BackendRole, ownerId = "") {
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
  // Creates an unverified account; the backend emails a link to /verify-email/:token.
  return request<{ message: string; email: string; verificationRequired: boolean }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ ...account, role: "CUSTOMER" }),
  });
}

export async function backendVerifyEmail(token: string) {
  return request<{ message: string }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function backendForgotPassword(username: string, email: string) {
  // The email must be the account's verified address; errors are USER_NOT_FOUND / INVALID_EMAIL.
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ username, email }),
  });
}

export async function backendResetPassword(token: string, newPassword: string) {
  // A successful reset signs this browser in, like a login.
  const auth = await request<BackendAuth>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
  sessionStorage.setItem(TOKEN_KEY, auth.accessToken);
  return auth;
}

export async function backendResendVerification(identifier: string) {
  return request<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export function backendLogout() {
  const operation = request<void>("/auth/logout", { method: "POST" }, true).catch(() => undefined);
  sessionStorage.removeItem(TOKEN_KEY);
  return operation;
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
        initialCategories: event.tiers.map(t => ({ type: t.name.toUpperCase(), name: t.name,
          priceCents: Math.round(t.price * 100), quantity: t.total, seatSection: t.name })),
      }),
    },
    true,
  );
}

export function backendCancelBooking(id: string) {
  return request(`/me/bookings/${id}/cancel`, { method: "POST" }, true);
}

export type DemoResetTarget = {
  environment: string;
  databaseHost: string;
  databasePort: number | null;
  databaseName: string;
  databaseSchema: string;
  requiresProductionOverride: boolean;
  enabled: boolean;
  targetId: string;
};

export async function getDemoResetTarget(signal?: AbortSignal): Promise<DemoResetTarget> {
  const result = await request<DemoResetTarget>("/admin/reset-demo-data/target", { signal }, true);
  if (!result || typeof result.environment !== "string" || !result.environment ||
    typeof result.databaseHost !== "string" || !result.databaseHost ||
    typeof result.databaseName !== "string" || !result.databaseName ||
    typeof result.databaseSchema !== "string" || !result.databaseSchema ||
    !(result.databasePort === null || (Number.isInteger(result.databasePort) && result.databasePort! > 0 && result.databasePort! <= 65535)) ||
    typeof result.enabled !== "boolean" || typeof result.requiresProductionOverride !== "boolean" ||
    typeof result.targetId !== "string" || !/^[0-9a-f]{64}$/.test(result.targetId)) {
    throw new Error("Database target could not be verified. Reset is unavailable.");
  }
  return result;
}

export async function resetDemoData(input: { confirmation: string; username: string; password: string; acknowledged: boolean; targetId: string }) {
  const result = await request<{ deleted: Record<string, number>; message: string }>(
    "/admin/reset-demo-data",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
  if (!result || typeof result.message !== "string" || !result.deleted ||
    typeof result.deleted !== "object" || Array.isArray(result.deleted) ||
    !Object.values(result.deleted).every(value => Number.isInteger(value) && value >= 0)) {
    throw new Error("Reset result was not confirmed. Check the application state before retrying.");
  }
  return result;
}

export function backendMe() {
  return request<{
    id: string;
    username: string;
    role: BackendRole;
    email: string | null;
    mustChangePassword: boolean;
    passwordChangeable: boolean;
  }>("/auth/me", {}, true);
}

export async function backendChangePassword(currentPassword: string, newPassword: string) {
  // Other devices are signed out; this browser gets a fresh session.
  const auth = await request<BackendAuth>(
    "/auth/change-password",
    { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) },
    true,
  );
  sessionStorage.setItem(TOKEN_KEY, auth.accessToken);
  return auth;
}

export function hasBackendSession() { return !!sessionStorage.getItem(TOKEN_KEY); }

// ---------------------------------------------------------------------------
// Package E: EaseVoice narration (text + MP3 recording) and report downloads
// ---------------------------------------------------------------------------

export type BackendNarration = {
  pageKey: string;
  transcript: string;
  updatedAt: string;
  hasAudio: boolean;
  audioFilename: string | null;
  audioSizeBytes: number | null;
};

export const MAX_NARRATION_AUDIO_BYTES = 5 * 1024 * 1024;

/** Public narration for one page. Resolves to null when the admin has not written one yet. */
export async function fetchBackendNarration(pageKey: string) {
  try {
    return await request<BackendNarration>(`/narration/${pageKey}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Admin only: create or replace the narration text for a page. */
export function saveBackendNarration(pageKey: string, transcript: string) {
  return request<BackendNarration>(
    `/admin/narration/${pageKey}`,
    { method: "PUT", body: JSON.stringify({ transcript }) },
    true,
  );
}

/** Address of the admin-recorded MP3 for a page (public, so an <audio> tag can play it). */
export function narrationAudioUrl(pageKey: string) {
  return `${API_ROOT}/narration/${pageKey}/audio`;
}

/** Admin only: upload an MP3 for a page whose narration text is already saved. */
export function uploadBackendNarrationAudio(pageKey: string, file: File) {
  return request<BackendNarration>(
    `/admin/narration/${pageKey}/audio?filename=${encodeURIComponent(file.name)}`,
    { method: "PUT", body: file, headers: { "Content-Type": "audio/mpeg" } },
    true,
  );
}

/** Admin only: remove the MP3 for a page (the text narration stays). */
export function deleteBackendNarrationAudio(pageKey: string) {
  return request<void>(`/admin/narration/${pageKey}/audio`, { method: "DELETE" }, true);
}

/**
 * Downloads a PDF/Excel report from the backend with the logged-in user's token and
 * hands it to the browser as a normal file download. Resolves to the file name.
 */
export async function downloadBackendReport(path: string, fallbackName: string) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token || isTokenExpired(token)) {
    if (token) notifySessionExpired();
    throw new ApiError("Please log in to download reports.", 401);
  }
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired();
    }
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string }; detail?: string }
      | null;
    throw new ApiError(
      body?.error?.message ?? body?.detail ?? `Backend request failed (${response.status})`,
      response.status,
    );
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
