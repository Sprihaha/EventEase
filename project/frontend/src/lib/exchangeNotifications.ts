import type { ExchangeActivity } from "./exchangeTypes";

export const EXCHANGE_ACTIVITY_CHANGED = "eventease:exchange-activity-changed";

const messages: Record<string, string> = {
  EXCHANGE_OPEN: "You received a direct exchange invitation",
  EXCHANGE_MATCHED: "Exchange proposal received — review both tickets",
  EXCHANGE_PENDING: "Exchange proposal received — review both tickets",
  EXCHANGE_ACCEPTED: "The other participant accepted your exchange",
  EXCHANGE_READY: "Both accepted — review settlement to complete your exchange",
  EXCHANGE_SETTLEMENT_FAILED: "Simulated settlement failed — tickets are unchanged",
  EXCHANGE_COMPLETED: "Exchange completed — your received ticket is in My Tickets",
  EXCHANGE_REJECTED: "Your exchange proposal was rejected",
  EXCHANGE_CANCELLED: "Your exchange was cancelled",
  EXCHANGE_EXPIRED: "Your exchange expired",
};

export function exchangeNotifications(activity: ExchangeActivity[]) {
  const seen = new Set<string>();
  return [...activity]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
    .filter(item => {
      if (!messages[item.action]) return false;
      if (item.ownAction && !["EXCHANGE_READY", "EXCHANGE_COMPLETED", "EXCHANGE_SETTLEMENT_FAILED", "EXCHANGE_EXPIRED"].includes(item.action)) return false;
      const action = item.action === "EXCHANGE_MATCHED" ? "EXCHANGE_PENDING" : item.action;
      const key = item.matchId ? `${item.matchId}:${action}` : item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // READY is sufficient guidance once the second acceptance has happened.
    .filter((item, _, items) => item.action !== "EXCHANGE_ACCEPTED" || !items.some(
      other => other.matchId === item.matchId && other.action === "EXCHANGE_READY" && Date.parse(other.createdAt) >= Date.parse(item.createdAt),
    ));
}

export function notificationMessage(item: ExchangeActivity) {
  return messages[item.action] ?? "Exchange updated";
}

export function notificationLink(item: ExchangeActivity) {
  if (item.matchId) return `/community?tab=exchange&view=mine&match=${encodeURIComponent(item.matchId)}`;
  return `/community?tab=exchange&view=${item.action === "EXCHANGE_OPEN" && !item.ownAction ? "invitations" : "mine"}`;
}

export function notificationReadKey(userId: string) {
  return `eventease:exchange-notifications:read:${userId}`;
}

export function parseReadNotifications(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))].slice(-500) : [];
  } catch {
    return [];
  }
}
