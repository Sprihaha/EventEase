export const TOKEN_KEY = "eventease-access-token";
export const EXPIRED_REDIRECT_KEY = "eventease-expired-redirect";
export const EXPIRED_RETURN_TO_KEY = "eventease-expired-return-to";
export const SESSION_EXPIRED_EVENT = "eventease:session-expired";

export function parseJwtPayload(token: string): { exp?: number; sub?: string; role?: string; [key: string]: unknown } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const decoded = atob(base64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function getTokenExpirationMs(token?: string | null): number | null {
  try {
    const jwt =
      token ??
      (typeof sessionStorage !== "undefined" && typeof sessionStorage?.getItem === "function"
        ? sessionStorage.getItem(TOKEN_KEY)
        : null);
    if (!jwt) return null;
    const payload = parseJwtPayload(jwt);
    if (!payload?.exp || typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export function isTokenExpired(token?: string | null): boolean {
  const expMs = getTokenExpirationMs(token);
  if (!expMs) return false;
  // Buffer of 2 seconds to avoid race conditions with requests in-flight
  return Date.now() >= expMs - 2000;
}

export function saveExpiredReturnTo(path: string): void {
  try {
    if (typeof sessionStorage !== "undefined" && typeof sessionStorage?.setItem === "function") {
      if (path && !path.startsWith("/login")) {
        sessionStorage.setItem(EXPIRED_RETURN_TO_KEY, path);
      }
    }
  } catch {
    // ignore
  }
}

export function getSavedExpiredReturnTo(): string | null {
  try {
    if (typeof sessionStorage !== "undefined" && typeof sessionStorage?.getItem === "function") {
      return sessionStorage.getItem(EXPIRED_RETURN_TO_KEY);
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearSavedExpiredReturnTo(): void {
  try {
    if (typeof sessionStorage !== "undefined" && typeof sessionStorage?.removeItem === "function") {
      sessionStorage.removeItem(EXPIRED_RETURN_TO_KEY);
    }
  } catch {
    // ignore
  }
}

export function resolveReturnUrl(role: string, returnTo?: string | null): string {
  const normalizedRole = role.toLowerCase();
  const defaultDashboard = `/dashboard/${normalizedRole}`;
  if (!returnTo || returnTo === "/" || returnTo.startsWith("/login")) {
    return defaultDashboard;
  }
  // Organisers cannot access customer/admin Discover and EaseComms pages
  if (
    normalizedRole === "organizer" &&
    (returnTo.startsWith("/events") ||
      returnTo.startsWith("/community") ||
      returnTo.startsWith("/exchange") ||
      returnTo.startsWith("/easexchange"))
  ) {
    return defaultDashboard;
  }
  // If navigating back to a role dashboard, ensure it matches the user's role
  if (returnTo.startsWith("/dashboard/")) {
    if (returnTo.toLowerCase() === defaultDashboard) {
      return returnTo;
    }
    return defaultDashboard;
  }
  return returnTo;
}

export function notifySessionExpired(): void {
  try {
    if (typeof window !== "undefined" && window.location) {
      const currentPath = window.location.pathname + window.location.search + window.location.hash;
      if (currentPath && !currentPath.startsWith("/login")) {
        saveExpiredReturnTo(currentPath);
      }
    }
  } catch {
    // ignore
  }

  try {
    if (typeof sessionStorage !== "undefined" && typeof sessionStorage?.setItem === "function") {
      sessionStorage.setItem(EXPIRED_REDIRECT_KEY, "1");
    }
    if (typeof sessionStorage !== "undefined" && typeof sessionStorage?.removeItem === "function") {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore in environments with restricted or mock storage
  }

  try {
    if (typeof window !== "undefined" && typeof window?.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
  } catch {
    // ignore in headless test environments
  }
}

export function hasExpiredRedirect(): boolean {
  try {
    if (typeof sessionStorage !== "undefined" && typeof sessionStorage?.getItem === "function") {
      return sessionStorage.getItem(EXPIRED_REDIRECT_KEY) === "1";
    }
  } catch {
    // ignore
  }
  return false;
}

export function clearExpiredRedirect(): void {
  try {
    if (typeof sessionStorage !== "undefined" && typeof sessionStorage?.removeItem === "function") {
      sessionStorage.removeItem(EXPIRED_REDIRECT_KEY);
    }
  } catch {
    // ignore
  }
}

export function onSessionExpired(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window?.addEventListener !== "function") return () => {};
  const handler = () => callback();
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => {
    if (typeof window !== "undefined" && typeof window?.removeEventListener === "function") {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
    }
  };
}
