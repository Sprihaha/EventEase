export const exchangeRequestStatuses = [
  "OPEN",
  "MATCHED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const
export const exchangeMatchStatuses = [
  "PENDING",
  "READY",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
] as const

export type ExchangeRequestStatus = typeof exchangeRequestStatuses[number]
export type ExchangeMatchStatus = typeof exchangeMatchStatuses[number]
export type ExchangeRequestType = "PUBLIC" | "DIRECT"

/** Read-only ticket snapshot supplied by the backend; never derived from demo bookings. */
export interface ExchangeTicket {
  id: string
  eventId: string
  eventName: string
  categoryType: string
  seatSection: string
  price?: number
  seatLabel?: string
}

export interface EligibleTicket extends ExchangeTicket {
  status: string
  eligible: boolean
}

export interface ExchangeRequest {
  id: string
  requesterUserId: string
  offeredTicketId: string
  eventId: string
  eventName: string
  offeredCategoryType: string
  offeredSeatSection: string
  desiredCategoryType: string | null
  desiredSeatSection: string | null
  allowCrossTier: boolean
  requestType: ExchangeRequestType
  status: ExchangeRequestStatus
  expiresAt: string
  createdAt: string
}

export interface ExchangeListing {
  requestId: string
  eventId: string
  eventName: string
  offeredTicketId: string
  offeredCategoryType: string
  offeredSeatSection: string
  requesterDisplayName?: string
  desiredCategoryType: string | null
  desiredSeatSection: string | null
  allowCrossTier: boolean
  expiresAt: string
}

export interface ExchangeMatch {
  id: string
  requestAId: string
  requestBId: string
  ticketA: ExchangeTicket
  ticketB: ExchangeTicket
  aAccepted: boolean
  bAccepted: boolean
  /** READY confirms mutual acceptance only; it does not confirm settlement or ticket transfer. */
  status: ExchangeMatchStatus
  expiresAt: string
}

export interface MyExchanges {
  requests: ExchangeRequest[]
  matches: ExchangeMatch[]
}

/** The server derives the owner, event, ticket details, status, and expiry. */
export interface CreateExchangeRequestPayload {
  offeredTicketId: string
  desiredCategoryType: string | null
  desiredSeatSection: string | null
  allowCrossTier: boolean
  requestType: "PUBLIC" | "DIRECT"
  recipientUsername?: string
}
