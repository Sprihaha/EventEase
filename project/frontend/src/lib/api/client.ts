import { TOKEN_KEY, isTokenExpired, notifySessionExpired } from "../session";

// In the monolith deployment VITE_API_BASE_URL is intentionally left empty so
// that API calls go to the same origin as the page (Nginx proxies /api/* to
// Uvicorn internally). An explicit URL is still honoured when set (e.g. for
// local dev pointing at a separate backend or the two-service Render setup).
const _rawApiUrl = ((import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL) as string | undefined)?.trim().replace(/\/$/, "");
export const API_ORIGIN = _rawApiUrl || "";   // empty string → same-origin (relative)
export const API_ROOT   = API_ORIGIN ? `${API_ORIGIN}/api/v1` : "/api/v1";

if (
  (import.meta.env.VITE_LOCAL_SANDBOX === "true" || import.meta.env.VITE_LOCAL_ONLY === "true") &&
  API_ORIGIN &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(API_ORIGIN).hostname)
) {
  throw new Error("Local testing refuses a nonlocal API URL.");
}

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

export type Page<T> = { items: T[]; total: number; totalPages: number };

export async function pages<T>(path: string, authenticated = false): Promise<T[]> {
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
  // A session can only expire if one was sent; signed-out visitors never see the expiry prompt.
  let sentToken = false;
  if (authenticated) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      sentToken = true;
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
      (sentToken || body?.error?.code === "TOKEN_EXPIRED") &&
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

