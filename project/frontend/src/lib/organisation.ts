import { request } from "./backendApi";
import { CURRENT_ORGANISATION_KEY as CURRENT_KEY } from "./currentOrganisation";

// Organisations an organiser works for. After signing in an organiser picks one; it is shown
// in the header and can be switched. A self-managed organisation (EventEase) shares its events
// with its members; its manager creates the member accounts.

export type Organisation = { id: string; name: string };

export type MembershipStatus = "PENDING" | "APPROVED" | "REJECTED";

export type Membership = {
  id: string;
  organisationId: string | null;
  organisationName: string;
  organisationEmail: string;
  status: MembershipStatus;
  source: "SIGNUP" | "REQUEST" | "ADMIN";
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  isManager: boolean;
  selfManaged: boolean;
};

export type OrganisationMember = {
  userId: string;
  username: string;
  emailMasked: string | null;
  isManager: boolean;
  status: string;
  mustChangePassword: boolean;
  addedAt: string;
};

export type OrganisationMembers = {
  organisationId: string;
  organisationName: string;
  items: OrganisationMember[];
};

export type AdminOrganisationRequest = {
  id: string;
  userId: string;
  username: string;
  emailMasked: string | null;
  organisationName: string;
  newOrganisation: boolean;
  organisationEmail: string;
  status: MembershipStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

// The dropdown's free-text choice for an organisation that isn't listed yet.
export const OTHERS = "__others__";

export const fetchOrganisations = () => request<Organisation[]>("/organisations");

// The organiser sign-in dropdown also lists organisations hidden from sign-up (EventEase).
export const fetchSignInOrganisations = () => request<Organisation[]>("/organisations?purpose=signin");

export const fetchMyOrganisations = () => request<Membership[]>("/me/organisations", {}, true);

export const requestOrganisation = (organisationName: string, organisationEmail: string) =>
  request<Membership>("/me/organisations", {
    method: "POST",
    body: JSON.stringify({ organisationName, organisationEmail }),
  }, true);

export const fetchOrganisationMembers = () => request<OrganisationMembers>("/me/organisation/members", {}, true);

export const createOrganisationMember = (username: string, email: string, password: string) =>
  request<OrganisationMember>("/me/organisation/members", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  }, true);

export async function fetchOrganisationRequests(status?: MembershipStatus) {
  const all: AdminOrganisationRequest[] = [];
  for (let page = 1; ; page++) {
    const query = `?page=${page}&pageSize=100${status ? `&status=${status}` : ""}`;
    const response = await request<{ items: AdminOrganisationRequest[]; totalPages: number }>(
      `/admin/organisation-requests${query}`, {}, true);
    all.push(...response.items);
    if (page >= response.totalPages) return all;
  }
}

export async function countPendingOrganisationRequests() {
  const page = await request<{ total: number }>("/admin/organisation-requests?status=PENDING&pageSize=1", {}, true);
  return page.total;
}

export const decideOrganisationRequest = (id: string, approve: boolean, reason?: string) =>
  request<AdminOrganisationRequest>(`/admin/organisation-requests/${id}/${approve ? "approve" : "reject"}`,
    { method: "POST", ...(approve ? {} : { body: JSON.stringify({ reason: reason || null }) }) }, true);

// ---------------------------------------------------------------------------
// The organisation chosen for this browser session.

export function getCurrentOrganisation(): Organisation | null {
  try {
    const raw = sessionStorage.getItem(CURRENT_KEY);
    return raw ? (JSON.parse(raw) as Organisation) : null;
  } catch {
    return null;
  }
}

export function setCurrentOrganisation(organisation: Organisation) {
  sessionStorage.setItem(CURRENT_KEY, JSON.stringify(organisation));
}

export function clearCurrentOrganisation() {
  try {
    sessionStorage.removeItem(CURRENT_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
