import { TOKEN_KEY, isTokenExpired, notifySessionExpired } from "../session";
import { API_ROOT, ApiError, request } from "./client";

export function backendCancelBooking(id: string) {
  return request(`/me/bookings/${id}/cancel`, { method: "POST" }, true);
}

/**
 * Downloads a PDF/Excel report from the backend with the logged-in user's token and
 * hands it to the browser as a normal file download. Resolves to the file name.
 */
export async function downloadBackendReport(path: string, fallbackName: string): Promise<string> {
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

