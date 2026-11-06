import { ApiError, request } from "./backendApi"
import {
  exchangeMatchStatuses,
  exchangeRequestStatuses,
  type CreateExchangeRequestPayload,
  type EligibleTicket,
  type ExchangeListing,
  type ExchangeMatch,
  type ExchangeRequest,
  type ExchangeTicket,
  type MyExchanges,
  type ExchangeCategoryOption,
  type ExchangeActivity,
} from "./exchangeTypes"

export class ExchangeContractError extends Error {
  constructor(field: string) {
    super(
      `The exchange service returned an invalid response (${field}). Please refresh or try again later.`,
    )
    this.name = "ExchangeContractError"
  }
}

type JsonObject = Record<string, unknown>
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ExchangeContractError("object expected")
  return value as JsonObject
}

// All wire casing is isolated here. Outgoing payloads use camelCase; incoming
// payloads may use camelCase or snake_case without changing UI components.
function field(value: JsonObject, key: string): unknown {
  return value[key] !== undefined
    ? value[key]
    : value[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]
}
function string(value: JsonObject, key: string): string {
  const result = field(value, key)
  if (typeof result !== "string" || !result.trim())
    throw new ExchangeContractError(key)
  return result
}
function nullableString(value: JsonObject, key: string): string | null {
  return field(value, key) === null ? null : string(value, key)
}
function boolean(value: JsonObject, key: string): boolean {
  const result = field(value, key)
  if (typeof result !== "boolean") throw new ExchangeContractError(key)
  return result
}
function timestamp(value: JsonObject, key: string): string {
  const result = string(value, key)
  if (
    !/(Z|[+-]\d{2}:\d{2})$/i.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new ExchangeContractError(key)
  return result
}
function enumeration<T extends string>(
  value: JsonObject,
  key: string,
  allowed: readonly T[],
): T {
  const result = string(value, key)
  if (!allowed.includes(result as T)) throw new ExchangeContractError(key)
  return result as T
}
function list<T>(value: unknown, map: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new ExchangeContractError("array expected")
  return value.map(map)
}
function ticket(value: unknown): ExchangeTicket {
  const item = object(value)
  const price = field(item, "price")
  if (
    price !== undefined &&
    (typeof price !== "number" || !Number.isFinite(price) || price < 0)
  )
    throw new ExchangeContractError("price")
  return {
    id: string(item, "id"),
    eventId: string(item, "eventId"),
    eventName: string(item, "eventName"),
    categoryType: string(item, "categoryType"),
    seatSection: string(item, "seatSection"),
    ...(typeof field(item, "seatLabel") === "string" ? { seatLabel: string(item, "seatLabel") } : {}),
    ...(price === undefined ? {} : { price: price as number }),
    ...(typeof field(item, "categoryId") === "string" ? { categoryId: string(item, "categoryId") } : {}),
  }
}
function eligibleTicket(value: unknown): EligibleTicket {
  const item = object(value)
  return {
    ...ticket(item),
    status: string(item, "status"),
    eligible: boolean(item, "eligible"),
  }
}
function preferences(item: JsonObject) {
  return {
    desiredCategoryType: nullableString(item, "desiredCategoryType"),
    desiredSeatSection: nullableString(item, "desiredSeatSection"),
    allowCrossTier: boolean(item, "allowCrossTier"),
  }
}
function exchangeRequest(value: unknown): ExchangeRequest {
  const item = object(value)
  return {
    id: string(item, "id"),
    requesterUserId: string(item, "requesterUserId"),
    offeredTicketId: string(item, "offeredTicketId"),
    eventId: string(item, "eventId"),
    eventName: string(item, "eventName"),
    offeredCategoryType: string(item, "offeredCategoryType"),
    offeredSeatSection: string(item, "offeredSeatSection"),
    ...preferences(item),
    requestType: enumeration(item, "requestType", ["PUBLIC", "DIRECT"]),
    status: enumeration(item, "status", exchangeRequestStatuses),
    expiresAt: timestamp(item, "expiresAt"),
    createdAt: timestamp(item, "createdAt"),
    ...(field(item, "desiredCategoryId") !== undefined ? { desiredCategoryId: nullableString(item, "desiredCategoryId") } : {}),
  }
}
function listing(value: unknown): ExchangeListing {
  const item = object(value)
  const displayName = field(item, "requesterDisplayName")
  if (
    displayName !== undefined &&
    displayName !== null &&
    typeof displayName !== "string"
  )
    throw new ExchangeContractError("requesterDisplayName")
  return {
    requestId: string(item, "requestId"),
    eventId: string(item, "eventId"),
    eventName: string(item, "eventName"),
    offeredTicketId: string(item, "offeredTicketId"),
    offeredCategoryType: string(item, "offeredCategoryType"),
    offeredSeatSection: string(item, "offeredSeatSection"),
    ...(typeof field(item, "offeredSeatLabel") === "string" ? { offeredSeatLabel: string(item, "offeredSeatLabel") } : {}),
    ...(typeof field(item, "offeredPrice") === "number" ? { offeredPrice: field(item, "offeredPrice") as number } : {}),
    ...preferences(item),
    ...(typeof displayName === "string"
      ? { requesterDisplayName: displayName }
      : {}),
    expiresAt: timestamp(item, "expiresAt"),
  }
}
function match(value: unknown): ExchangeMatch {
  const item = object(value)
  const result: ExchangeMatch = {
    id: string(item, "id"),
    requestAId: string(item, "requestAId"),
    requestBId: string(item, "requestBId"),
    ticketA: ticket(field(item, "ticketA")),
    ticketB: ticket(field(item, "ticketB")),
    aAccepted: boolean(item, "aAccepted"),
    bAccepted: boolean(item, "bAccepted"),
    status: enumeration(item, "status", exchangeMatchStatuses),
    expiresAt: timestamp(item, "expiresAt"),
  }
  if (result.status === "READY" && (!result.aAccepted || !result.bAccepted))
    throw new ExchangeContractError("READY acceptance")
  if (field(item, "updatedAt") !== undefined) result.updatedAt = timestamp(item, "updatedAt")
  if (field(item, "amountCents") !== undefined) {
    const amount = field(item, "amountCents")
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) throw new ExchangeContractError("amountCents")
    result.amountCents = amount
    result.isPayer = boolean(item, "isPayer")
    result.paymentStatus = enumeration(item, "paymentStatus", ["NOT_STARTED", "PENDING", "FAILED", "CANCELLED", "SUCCEEDED"] as const)
  }
  return result
}

const root = "/exchanges"
const idPath = (id: string) => `${root}/${encodeURIComponent(id)}`
const matchPath = (id: string) => `${root}/matches/${encodeURIComponent(id)}`

export async function searchExchangeRecipients(query: string, signal?: AbortSignal): Promise<string[]> {
  return list(await request<unknown>(`${root}/recipients?q=${encodeURIComponent(query.trim())}`, { signal }, true), value =>
    string(object(value), "username"))
}

export async function getRecipientEligibility(offeredTicketId: string, username: string, signal?: AbortSignal): Promise<boolean> {
  const response = await request<unknown>(`${root}/recipients/eligibility?offeredTicketId=${encodeURIComponent(offeredTicketId)}&username=${encodeURIComponent(username)}`, { signal }, true)
  return boolean(object(response), "eligible")
}

export async function rejectExchangeInvitation(requestId: string): Promise<ExchangeRequest> {
  return exchangeRequest(await request<unknown>(`${idPath(requestId)}/reject-invitation`, { method: "POST" }, true))
}

export async function getEligibleExchangeTickets(
  signal?: AbortSignal,
): Promise<EligibleTicket[]> {
  return list(
    await request<unknown>(`${root}/eligible-tickets`, { signal }, true),
    eligibleTicket,
  )
}
export async function getExchangeListings(
  signal?: AbortSignal,
): Promise<ExchangeListing[]> {
  return list(await request<unknown>(`${root}/listings`, { signal }), listing)
}
export async function getExchangeInvitations(signal?: AbortSignal): Promise<ExchangeListing[]> {
  return list(await request<unknown>(`${root}/invitations`, { signal }, true), listing)
}
export async function createExchangeRequest(
  payload: CreateExchangeRequestPayload,
): Promise<ExchangeRequest> {
  // Explicit allowlist prevents UI fields or caller-supplied owner/status/price from leaking into the write.
  return exchangeRequest(
    await request<unknown>(
      root,
      {
        method: "POST",
        body: JSON.stringify({
          offeredTicketId: payload.offeredTicketId,
          desiredCategoryType: payload.desiredCategoryType,
          desiredSeatSection: payload.desiredSeatSection,
          allowCrossTier: payload.allowCrossTier,
          requestType: payload.requestType,
          ...(payload.desiredCategoryId ? { desiredCategoryId: payload.desiredCategoryId } : {}),
          ...(payload.requestType === "DIRECT" ? { recipientUsername: payload.recipientUsername } : {}),
        }),
      },
      true,
    ),
  )
}
export async function getMyExchanges(
  signal?: AbortSignal,
): Promise<MyExchanges> {
  const result = object(
    await request<unknown>(`${root}/mine`, { signal }, true),
  )
  return {
    requests: list(result.requests, exchangeRequest),
    matches: list(result.matches, match),
  }
}
export async function getCompatibleMatches(
  requestId: string,
  signal?: AbortSignal,
): Promise<ExchangeListing[]> {
  return list(
    await request<unknown>(`${idPath(requestId)}/matches`, { signal }, true),
    listing,
  )
}
export async function expressInterest(
  requestId: string,
  targetRequestId: string,
): Promise<ExchangeMatch> {
  return match(
    await request<unknown>(
      `${idPath(requestId)}/interest`,
      {
        method: "POST",
        body: JSON.stringify({ targetRequestId }),
      },
      true,
    ),
  )
}
export async function getListingEligibleTickets(
  targetRequestId: string,
  signal?: AbortSignal,
): Promise<EligibleTicket[]> {
  return list(
    await request<unknown>(`${idPath(targetRequestId)}/eligible-tickets`, { signal }, true),
    eligibleTicket,
  )
}
export async function expressTicketInterest(
  targetRequestId: string,
  offeredTicketId: string,
): Promise<ExchangeMatch> {
  return match(await request<unknown>(`${idPath(targetRequestId)}/ticket-interest`, {
    method: "POST",
    body: JSON.stringify({ offeredTicketId }),
  }, true))
}
export async function getExchangeMatch(
  matchId: string,
  signal?: AbortSignal,
): Promise<ExchangeMatch> {
  return match(await request<unknown>(matchPath(matchId), { signal }, true))
}
export async function acceptExchangeMatch(
  matchId: string,
): Promise<ExchangeMatch> {
  return match(
    await request<unknown>(
      `${matchPath(matchId)}/accept`,
      { method: "POST" },
      true,
    ),
  )
}
export async function rejectExchangeMatch(
  matchId: string,
): Promise<ExchangeMatch> {
  return match(
    await request<unknown>(
      `${matchPath(matchId)}/reject`,
      { method: "POST" },
      true,
    ),
  )
}
export async function cancelExchangeMatch(
  matchId: string,
): Promise<ExchangeMatch> {
  return match(
    await request<unknown>(
      `${matchPath(matchId)}/cancel`,
      { method: "POST" },
      true,
    ),
  )
}

export type ExchangePaymentMethod = "mock_success" | "mock_fail" | "mock_pending" | "mock_cancel"
export async function settleExchangeMatch(matchId: string, outcome: boolean | ExchangePaymentMethod = false): Promise<ExchangeMatch> {
  return match(await request<unknown>(`${matchPath(matchId)}/settle`, {
    method: "POST", body: JSON.stringify({ paymentMethod: typeof outcome === "boolean" ? (outcome ? "mock_fail" : "mock_success") : outcome }),
  }, true))
}
export async function cancelExchangeRequest(
  requestId: string,
): Promise<ExchangeRequest> {
  return exchangeRequest(
    await request<unknown>(
      `${idPath(requestId)}/cancel`,
      { method: "POST" },
      true,
    ),
  )
}

export function exchangeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "RECIPIENT_INELIGIBLE") return "This user has no eligible tickets for this event."
    if (error.code === "TICKET_INELIGIBLE") return "This ticket is no longer eligible. Exchanges must complete before the final seven days of the event."
    if (error.code === "PAYER_REQUIRED") return "Only the participant receiving the higher-valued ticket can pay the difference."
    if (error.code === "EXCHANGE_PAYMENT_FAILED") return "Simulated payment declined. Your tickets are unchanged; you can retry."
    if (error.code === "INVALID_RECIPIENT") return "Choose another active customer username from the suggestions."
    if (error.code === "ACCEPTANCE_FINAL") return "Your acceptance cannot be withdrawn."
    if (error.status === 401)
      return "Your session is unavailable or has expired. Please sign in again."
    if (error.status === 403)
      return "You do not have permission to use this exchange action."
    if ([404, 405, 501, 502, 503, 504].includes(error.status))
      return "The exchange service is currently unavailable. Please try again later."
    if (error.status === 409)
      return "This exchange has changed or is no longer available. Refresh to see its current state."
    if (error.status === 422)
      return "The exchange service could not validate this request. Check your selection and try again."
    return "The exchange service could not complete the request. Please try again."
  }
  if (error instanceof ExchangeContractError) return error.message
  return "Could not reach the exchange service. Check your connection and try again."
}

export async function getExchangeOptions(ticketId: string, signal?: AbortSignal): Promise<ExchangeCategoryOption[]> {
  return list(await request<unknown>(`${root}/eligible-tickets/${encodeURIComponent(ticketId)}/options`, { signal }, true), value => {
    const item = object(value)
    return { id: string(item, "id"), type: string(item, "type"), name: string(item, "name"),
      sections: list(field(item, "sections"), section => {
        if (typeof section !== "string" || !section.trim()) throw new ExchangeContractError("section")
        return section
      }) }
  })
}

export async function getExchangeActivity(signal?: AbortSignal): Promise<ExchangeActivity[]> {
  return list(await request<unknown>(`${root}/activity`, { signal }, true), value => {
    const item = object(value)
    return { id: string(item, "id"), action: string(item, "action"), eventName: string(item, "eventName"),
      createdAt: timestamp(item, "createdAt"), ownAction: boolean(item, "ownAction"),
      matchId: nullableString(item, "matchId"), requestId: nullableString(item, "requestId") }
  })
}

export type { ExchangeActivity } from './exchangeTypes';
