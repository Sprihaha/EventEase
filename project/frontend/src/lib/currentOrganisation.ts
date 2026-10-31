// The organisation chosen for this browser session. Kept apart from organisation.ts so the
// request helpers can read it: they send it with signed-in calls as X-Organisation-Id, and
// the backend uses it to share a self-managed organisation's events with its members.

export const CURRENT_ORGANISATION_KEY = "eventease-organisation";

export function currentOrganisationId(): string | null {
  try {
    const raw = sessionStorage.getItem(CURRENT_ORGANISATION_KEY);
    return raw ? (JSON.parse(raw) as { id?: string }).id ?? null : null;
  } catch {
    return null;
  }
}
