import type { ExchangeMatchStatus, ExchangeRequest, ExchangeRequestStatus } from "./exchangeTypes"

export const exchangeStatusLabels: Record<ExchangeRequestStatus, string> = {
  OPEN: "Open",
  MATCHED: "Matched",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
}

export const exchangeStatusClasses: Record<ExchangeRequestStatus, string> = {
  OPEN: "bg-pink-50 text-pink-800 border border-pink-200",
  MATCHED: "bg-amber-50 text-amber-800 border border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  CANCELLED: "bg-red-50 text-red-800 border border-red-200",
  EXPIRED: "bg-purple-50 text-purple-800 border border-purple-200",
}

/** Number the complete owned history, before filtering/pagination. New requests append.
 * Creation time and UUID tie-breaking make API order, refreshes and reopening irrelevant.
 */
export function requestNumbers(requests: readonly ExchangeRequest[]): Map<string, number> {
  const ordered = [...requests].sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return new Map(ordered.map((request, index) => [request.id, index + 1]))
}

export function matchDisplayStatus(status: ExchangeMatchStatus): ExchangeRequestStatus {
  if (status === "PENDING" || status === "READY") return "MATCHED"
  if (status === "REJECTED") return "CANCELLED"
  return status
}
