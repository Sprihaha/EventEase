import { TOKEN_KEY } from "../session";
import { ApiError, request } from "./client";

export { ApiError };

export type BackendRole = "CUSTOMER" | "ORGANISER" | "ADMIN";

export type BackendAuth = {
  accessToken: string;
  user: { id: string; username: string; role: BackendRole; passwordChangeable: boolean };
  redirectTo: string;
  mustChangePassword: boolean;
  organisation?: { id: string; name: string } | null;
};

export type LoginPortal = "CUSTOMER" | "ORGANISER" | "ADMIN";

export async function backendLogin(
  identifier: string,
  password: string,
  portal?: LoginPortal,
  organisation?: string,
): Promise<BackendAuth> {
  const auth = await request<BackendAuth>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password, portal, organisation }),
  });
  sessionStorage.setItem(TOKEN_KEY, auth.accessToken);
  return auth;
}

export async function backendSignup(account: {
  username: string;
  password: string;
  email: string;
  phone: string;
  role: "CUSTOMER" | "ORGANISER";
  organisationName?: string;
  organisationEmail?: string;
}) {
  // Creates an unverified account; the backend emails a link to /verify-email/:token.
  // Organisers also wait for an administrator to approve their request.
  return request<{ message: string; email: string; verificationRequired: boolean; approvalRequired: boolean }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(account),
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

export async function backendRefresh(): Promise<BackendAuth> {
  const auth = await request<BackendAuth>(
    "/auth/refresh",
    {
      method: "POST",
      credentials: "include",
    },
    false,
  );
  sessionStorage.setItem(TOKEN_KEY, auth.accessToken);
  return auth;
}

export type UserProfile = {
  id: string;
  username: string;
  role: BackendRole;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  emailVerified: boolean;
  passwordChangeable: boolean;
  createdAt: string;
};

export function backendMe() {
  return request<UserProfile>("/auth/me", {}, true);
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

export function hasBackendSession() {
  return !!sessionStorage.getItem(TOKEN_KEY);
}
