import { pages, request } from "./client";

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

export async function resetDemoData(input: {
  confirmation: string;
  username: string;
  password: string;
  acknowledged: boolean;
  targetId: string;
}) {
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

export type OrganiserRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type OrganiserRequest = {
  id: string;
  userId: string;
  username: string;
  emailMasked: string | null;
  emailVerified: boolean;
  phoneMasked: string | null;
  organisationName: string;
  organisationEmail: string;
  sameOrganisationRequests: number;
  status: OrganiserRequestStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

export async function fetchOrganiserRequests(status?: OrganiserRequestStatus): Promise<OrganiserRequest[]> {
  return pages<OrganiserRequest>(`/admin/organiser-requests${status ? `?status=${status}` : ""}`, true);
}

export async function countPendingOrganiserRequests(): Promise<number> {
  const page = await request<{ total: number }>("/admin/organiser-requests?status=PENDING&pageSize=1", {}, true);
  return page.total;
}

export async function decideOrganiserRequest(id: string, approve: boolean, reason?: string): Promise<OrganiserRequest> {
  return request<OrganiserRequest>(
    `/admin/organiser-requests/${id}/${approve ? "approve" : "reject"}`,
    { method: "POST", ...(approve ? {} : { body: JSON.stringify({ reason: reason || null }) }) },
    true,
  );
}

