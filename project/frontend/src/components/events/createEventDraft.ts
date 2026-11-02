// Unsaved Create event drafts (heuristic finding 3.1). The organiser dashboard unmounts a tab when
// you leave it, so the form keeps its work in sessionStorage: it survives switching tabs and
// refreshing, and is cleared on submit, on "Discard draft", or when the browser tab is closed.

export type TierDraft = { key: number; name: string; type: string; price: string };

export const emptyDetails = { title: "", category: "", startAt: "", endAt: "", imageUrl: "", description: "" };
export type DraftDetails = typeof emptyDetails;

export type CreateEventDraft = {
  details: DraftDetails;
  venueId: string;
  tiers: TierDraft[];
  nextKey: number;
  // section id -> tier key ("" = not on sale)
  assignment: Record<string, number | "">;
  savedAt: string;
};

const VERSION = 1;

/** One draft per signed-in organiser and organisation, so shared computers don't mix them up. */
export function draftKey(userId: string | undefined, organisationId: string | null): string {
  return `eventease:create-event-draft:v${VERSION}:${userId ?? "anonymous"}:${organisationId ?? "personal"}`;
}

export function hasContent(draft: Pick<CreateEventDraft, "details" | "venueId" | "tiers">): boolean {
  return Object.values(draft.details).some((value) => value.trim() !== "") || draft.venueId !== "" || draft.tiers.length > 0;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // blocked storage (some private modes): the form still works, just without drafts
  }
}

export function readDraft(key: string): CreateEventDraft | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CreateEventDraft>;
    if (!value.details || !Array.isArray(value.tiers) || typeof value.venueId !== "string") return null;
    const draft: CreateEventDraft = {
      details: { ...emptyDetails, ...value.details },
      venueId: value.venueId,
      tiers: value.tiers,
      nextKey: Math.max(value.nextKey ?? 1, ...value.tiers.map((t) => t.key + 1)),
      assignment: value.assignment ?? {},
      savedAt: value.savedAt ?? new Date().toISOString(),
    };
    return hasContent(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: Omit<CreateEventDraft, "savedAt">): void {
  try {
    if (hasContent(draft)) storage()?.setItem(key, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    else storage()?.removeItem(key);
  } catch {
    // storage full or blocked: keep working without a saved draft
  }
}

export function clearDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}
