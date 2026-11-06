import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Link, useSearchParams } from "react-router"
import { Repeat, X } from "lucide-react"
import {
  cancelExchangeRequest,
  exchangeErrorMessage,
  expressInterest,
  expressTicketInterest,
  getListingEligibleTickets,
  getExchangeListings,
  getExchangeInvitations,
  getMyExchanges,
  rejectExchangeInvitation,
} from "../../../lib/exchangeApi"
import {
  exchangeRequestStatuses,
  type ExchangeListing,
  type ExchangeRequest,
  type ExchangeRequestStatus,
} from "../../../lib/exchangeTypes"
import { exchangeStatusLabels, requestNumbers } from "../../../lib/exchangePresentation"
import ExchangeStatusBadge from "./ExchangeStatusBadge"
import { useStore } from "../../../lib/store"
import useExchangeResource from "../../../lib/useExchangeResource"
import { EXCHANGE_ACTIVITY_CHANGED } from "../../../lib/exchangeNotifications"
import useExchangeConfirmation from "./useExchangeConfirmation"
import ExchangeMatchPanel from "./ExchangeMatchPanel"
import SwapRequestPanel from "./SwapRequestPanel"
import ExchangeActivityPanel from "./ExchangeActivityPanel"
import Select from "./ExchangeSelect"
import { Badge, Button, Card, Field, cx } from "../../ui"

const views = [
  { id: "mine", label: "My Exchanges" },
  { id: "listings", label: "Public listings" },
  { id: "invitations", label: "Direct invitations" },
  { id: "activity", label: "Exchange activity" },
] as const
type DialogState = { type: "create" } | {
  type: "interest"
  listing: ExchangeListing
  sourceId?: string
  useTicket: boolean
} | {
  type: "match"
  matchId: string
}

const PAGE_SIZE = 10

function Pagination({
  currentPage,
  totalItems,
  pageSize = PAGE_SIZE,
  onPageChange,
}: {
  currentPage: number
  totalItems: number
  pageSize?: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.ceil(totalItems / pageSize)
  if (totalPages <= 1) return null

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-brand-line/60 text-xs text-muted">
      <span>
        Showing <strong className="text-brand-deep">{startItem}–{endItem}</strong> of{" "}
        <strong className="text-brand-deep">{totalItems}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className="cursor-pointer px-3 py-1.5 rounded-lg border border-brand-purple/20 bg-white font-medium text-brand-deep transition hover:bg-brand-lilac/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={cx(
              "cursor-pointer min-w-8 h-8 px-2 rounded-lg font-bold transition text-xs flex items-center justify-center",
              currentPage === p
                ? "bg-brand-purple text-white shadow-sm"
                : "border border-brand-purple/20 bg-white text-brand-deep hover:bg-brand-lilac/40",
            )}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className="cursor-pointer px-3 py-1.5 rounded-lg border border-brand-purple/20 bg-white font-medium text-brand-deep transition hover:bg-brand-lilac/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default function SecureExchange() {
  const { confirm, confirmation } = useExchangeConfirmation()
  const { user } = useStore()
  const [params, setParams] = useSearchParams()
  const view =
    views.find((item) => item.id === params.get("view"))?.id ?? (user ? "mine" : "listings")
  const listings = useExchangeResource("listings", getExchangeListings)
  const mine = useExchangeResource(
    user ? `mine:${user.id}` : null,
    getMyExchanges,
  )
  const invitations = useExchangeResource(user ? `invitations:${user.id}` : null, getExchangeInvitations)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const linkedMatch = params.get("match")
  useEffect(() => {
    if (linkedMatch && user) setDialog({ type: "match", matchId: linkedMatch })
    else if (params.get("view") === "create" && user) setDialog({ type: "create" })
  }, [linkedMatch, params.get("view"), user?.id])
  const previousUser = useRef(user?.id)
  useEffect(() => {
    if (previousUser.current && previousUser.current !== user?.id) { setDialog(null); setNotice(null); setActionError(null); setCreating(false) }
    previousUser.current = user?.id
  }, [user?.id])
  const [creating, setCreating] = useState(false)
  const closeDialog = () => {
    if (creating) return
    setDialog(null)
    setParams(current => {
      const next = new URLSearchParams(current)
      next.delete("match")
      if (next.get("view") === "create") next.set("view", "listings")
      return next
    })
  }
  const statusParam = params.get("status")
  const filter = exchangeRequestStatuses.includes(statusParam as ExchangeRequestStatus)
    ? statusParam as ExchangeRequestStatus : "ALL"
  const [listingsPage, setListingsPage] = useState(1)
  const [invitationsPage, setInvitationsPage] = useState(1)
  const [myRequestsPage, setMyRequestsPage] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const submitting = useRef(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const ownRequests =
    mine.data?.requests.filter(
      (request) => request.requesterUserId === user?.id,
    ) ?? []
  const numbers = requestNumbers(ownRequests)
  const filteredRequests = ownRequests.filter(
    (request) => filter === "ALL" || request.status === filter,
  )
  const requestPage = Math.min(myRequestsPage, Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE)))
  const openRequests = ownRequests.filter(
    (request) =>
      request.status === "OPEN" && Date.parse(request.expiresAt) > now,
  )
  const setView = (nextView: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set("view", nextView)
      return next
    })
  const refresh = () => {
    window.dispatchEvent(new Event(EXCHANGE_ACTIVITY_CHANGED))
    listings.refresh()
    mine.refresh()
    invitations.refresh()
  }
  const cancelRequest = async (request: ExchangeRequest) => {
    if (
      request.status !== "OPEN" ||
      Date.parse(request.expiresAt) <= Date.now() ||
      submitting.current
    )
      return
    if (!await confirm({ title: "Cancel exchange request?", message: "This cancels your open request and cannot be undone. No tickets will be exchanged.", confirmLabel: "Confirm cancellation", destructive: true })) return
    if (submitting.current || Date.parse(request.expiresAt) <= Date.now()) return
    submitting.current = true
    setPendingId(request.id)
    setNotice(null)
    setActionError(null)
    try {
      const result = await cancelExchangeRequest(request.id)
      setNotice(
        result.status === "CANCELLED"
          ? `Request ${numbers.get(request.id)} cancelled`
          : `Request ${numbers.get(request.id)} updated. Status: ${exchangeStatusLabels[result.status]}.`,
      )
    } catch (error) {
      setActionError(
        `${exchangeErrorMessage(error)} Cancellation was not confirmed. Refresh before retrying.`,
      )
    } finally {
      submitting.current = false
      setPendingId(null)
      refresh()
    }
  }
  const rejectInvitation = async (listing: ExchangeListing) => {
    if (submitting.current || Date.parse(listing.expiresAt) <= Date.now()) return;
    if (!await confirm({ title: "Reject exchange invitation?", message: "This rejects the invitation and cannot be undone. No tickets will be exchanged.", confirmLabel: "Confirm rejection", destructive: true })) return;
    if (submitting.current || Date.parse(listing.expiresAt) <= Date.now()) return;
    submitting.current = true; setPendingId(listing.requestId); setActionError(null); setNotice(null);
    try { await rejectExchangeInvitation(listing.requestId); setNotice("Invitation rejected"); }
    catch (cause) { setActionError(exchangeErrorMessage(cause)); }
    finally { submitting.current = false; setPendingId(null); refresh(); }
  }
  const openInterest = (listing: ExchangeListing, sourceId?: string) => {
    setNotice(null)
    setActionError(null)
    setDialog({ type: "interest", listing, sourceId, useTicket: !sourceId })
  }

  return (
    <section aria-label="EaseXchange" className="space-y-5">
      <div id="exchange-controls" className="flex flex-wrap items-center justify-between gap-3 scroll-mt-48">
      <nav aria-label="Exchange views" className="flex flex-wrap gap-2">
        {views.map((item) => (
          <Button
            key={item.id}
            variant={view === item.id ? "dark" : "outline"}
            size="sm"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => {
              setNotice(null)
              setActionError(null)
              setView(item.id)
            }}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <button
        type="button"
        id="create-request-btn"
        onClick={() => setDialog({ type: "create" })}
        className="scroll-mt-48 cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
      >
        Request EaseXchange
      </button>
      </div>
      <div className="rounded-2xl border border-brand-purple/20 bg-brand-lilac/60 p-4 text-sm text-brand-deep">
        <p className="flex items-center gap-2 font-semibold">
          <Repeat className="h-5 w-5 shrink-0" /> <span className="font-feature italic font-black text-brand-purple">EaseXchange</span> · Secure ticket
          exchange
        </p>
        <p className="mt-2">
          Offer an eligible owned ticket, explore compatible requests, and
          review and accept a match. Acceptance cannot be withdrawn.
          Equal-value tickets exchange automatically when both participants accept. Any price difference must be paid before tickets transfer. Exchanges close seven days before the event.
        </p>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="rounded-2xl bg-danger/10 p-4 text-sm text-danger"
        >
          {actionError}
        </p>
      )}
      {view === "listings" && (
        <>
          <div id="public-listings" className="flex items-center justify-between gap-3 scroll-mt-24">
            <h2 className="font-brand text-2xl font-bold text-brand-deep">
              Public listings
            </h2>
            <Button
              size="sm"
              variant="outline"
              disabled={listings.status === "loading"}
              onClick={listings.reload}
            >
              Refresh listings
            </Button>
          </div>
          <LoadState
            status={listings.status}
            error={listings.error}
            empty={listings.data?.length === 0}
            emptyText="No public exchange listings available."
            onRetry={listings.reload}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {(listings.data ?? [])
              .slice((listingsPage - 1) * PAGE_SIZE, listingsPage * PAGE_SIZE)
              .map((listing) => {
              const own = ownRequests.some(
                (request) => request.id === listing.requestId,
              )
              const expired = Date.parse(listing.expiresAt) <= now
              return (
                <ListingCard key={listing.requestId} listing={listing}>
                  {own ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setView("mine")}
                    >
                      View my request
                    </Button>
                  ) : user ? (
                    <Button
                      size="sm"
                      disabled={expired}
                      onClick={() => openInterest(listing)}
                    >
                      {expired ? "Expiry time passed" : "Express interest"}
                    </Button>
                  ) : (
                    <SignInLink>Sign in to express interest</SignInLink>
                  )}
                </ListingCard>
              )
            })}
          </div>
          <Pagination
            currentPage={listingsPage}
            totalItems={listings.data?.length ?? 0}
            onPageChange={setListingsPage}
          />
        </>
      )}
      {view !== "listings" && !user && (
        <Card className="space-y-4 p-6">
          <h2 className="font-brand text-xl font-bold text-brand-deep">
            Sign in to use EaseXchange
          </h2>
          <p className="text-sm text-muted">
            Your eligible tickets, requests, and matches are available after
            signing in.
          </p>
          <SignInLink>Sign in</SignInLink>
        </Card>
      )}
      {view === "invitations" && user && <>
        <div className="flex justify-between"><h2 className="font-brand text-2xl font-bold">Direct invitations</h2><Button variant="outline" onClick={invitations.reload}>Refresh invitations</Button></div>
        <LoadState status={invitations.status} error={invitations.error} empty={invitations.data?.length === 0} emptyText="No direct invitations available." onRetry={invitations.reload} />
        <div className="space-y-4">
          {(invitations.data ?? [])
            .slice((invitationsPage - 1) * PAGE_SIZE, invitationsPage * PAGE_SIZE)
            .map(listing => <ListingCard key={listing.requestId} listing={listing} direct><div className="flex flex-wrap gap-3"><Button disabled={!!pendingId || Date.parse(listing.expiresAt) <= now} onClick={() => openInterest(listing)}>{Date.parse(listing.expiresAt) <= now ? "Invitation expired" : "Accept invitation"}</Button><Button variant="outline" disabled={!!pendingId || Date.parse(listing.expiresAt) <= now} onClick={() => void rejectInvitation(listing)}>Reject invitation</Button></div></ListingCard>)}
        </div>
        <Pagination
          currentPage={invitationsPage}
          totalItems={invitations.data?.length ?? 0}
          onPageChange={setInvitationsPage}
        />
        <p className="text-sm text-muted">Review the invitation and select an eligible owned ticket for the same event. Both users must review the match before accepting.</p>
      </>}
      {view === "mine" && user && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-brand text-2xl font-bold text-brand-deep">
              My Exchanges
            </h2>
            <Button
              variant="outline"
              size="sm"
              disabled={mine.status === "loading" || !!pendingId}
              onClick={mine.reload}
            >
              Refresh My Exchanges
            </Button>
          </div>
          <LoadState
            status={mine.status}
            error={mine.error}
            empty={
              mine.data?.requests.length === 0 && mine.data.matches.length === 0
            }
            emptyText="You have no exchange requests or matches yet."
            onRetry={mine.reload}
          />
          {mine.data && (
            <>
              <Field label="Exchange status">
                <Select
                  value={filter}
                  onChange={(event) => {
                    const status = event.target.value
                    setParams(current => {
                      const next = new URLSearchParams(current)
                      if (status === "ALL") next.delete("status")
                      else next.set("status", status)
                      return next
                    })
                    setMyRequestsPage(1)
                  }}
                >
                  <option value="ALL">All statuses</option>
                  {exchangeRequestStatuses.map((status) => (
                    <option key={status} value={status}>
                      {exchangeStatusLabels[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="space-y-4">
                {filteredRequests
                  .slice((requestPage - 1) * PAGE_SIZE, requestPage * PAGE_SIZE)
                  .map((request) => (
                    <Card key={request.id} className="p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-brand-deep">Request {numbers.get(request.id)}</span>
                          <ExchangeStatusBadge status={request.status} />
                          <Badge>{request.requestType}</Badge>
                        </div>
                        {request.status === "OPEN" && (
                          <Button
                            size="sm"
                            variant="danger"
                            className="shrink-0"
                            disabled={!!pendingId || Date.parse(request.expiresAt) <= now}
                            onClick={() => void cancelRequest(request)}
                          >
                            {pendingId === request.id ? "Cancelling…" : "Cancel request"}
                          </Button>
                        )}
                      </div>
                      <h3 className="mt-3 font-brand text-xl font-bold text-brand-deep">
                        {request.eventName}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        Offering {request.offeredCategoryType} · Section{" "}
                        {request.offeredSeatSection}
                      </p>
                      <Preferences request={request} />
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="inline-flex flex-wrap items-center gap-x-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800">
                          <span>Created</span>
                          <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
                        </span>
                        <span className="inline-flex flex-wrap items-center gap-x-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                          <span>Expires</span>
                          <time dateTime={request.expiresAt}>{formatDate(request.expiresAt)}</time>
                        </span>
                      </div>
                      {request.status === "EXPIRED" && (
                        <p className="mt-2 text-sm text-muted">
                          This request has expired.
                        </p>
                      )}
                      {request.status === "OPEN" &&
                        Date.parse(request.expiresAt) <= now && (
                          <p className="mt-2 text-sm text-muted">
                            The expiry time has passed. Refresh to retrieve the
                            backend status.
                          </p>
                        )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        {mine.data?.matches
                          .filter(match => match.requestAId === request.id || match.requestBId === request.id)
                          .map(match => (
                            <Button
                              key={match.id}
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ type: "match", matchId: match.id })}
                            >
                              {match.status === "COMPLETED" ? "View Exchange Details" : "View Match"}
                            </Button>
                          ))}
                      </div>
                    </Card>
                  ))}
              </div>
              <Pagination
                currentPage={requestPage}
                totalItems={filteredRequests.length}
                onPageChange={setMyRequestsPage}
              />
              {ownRequests.length > 0 && filteredRequests.length === 0 && (
                <p role="status" className="text-sm text-muted">No requests with this status.</p>
              )}
            </>
          )}
        </>
      )}
      {view === "activity" && user && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-brand text-2xl font-bold text-brand-deep">
              Exchange activity
            </h2>
          </div>
          <ExchangeActivityPanel key={user.id} />
        </div>
      )}
      {dialog && (
        <ExchangeDialog onClose={closeDialog} busy={creating}>
          {dialog.type === "create" && (user ? <SwapRequestPanel key={user.id}
            onCancel={closeDialog} onPendingChange={setCreating}
            onCreated={request => {
              setDialog(null)
              const history = [...ownRequests.filter(item => item.id !== request.id), request]
              setNotice(`Request ${requestNumbers(history).get(request.id)} created`)
              refresh()
              setView("mine")
            }} /> : <div><p>Sign in to use EaseXchange</p><SignInLink>Sign in</SignInLink></div>)}
          {dialog.type === "interest" && dialog.useTicket && user && (
            <TicketInterestPanel
              key={`${user.id}:${dialog.listing.requestId}`}
              listing={dialog.listing}
              onCreated={(matchId) => {
                refresh()
                setDialog({ type: "match", matchId })
              }}
              onChanged={refresh}
            />
          )}
          {dialog.type === "interest" && !dialog.useTicket && (
            <InterestPanel
              key={`${dialog.listing.requestId}:${dialog.sourceId ?? ""}`}
              listing={dialog.listing}
              requests={openRequests}
              numbers={numbers}
              sourceId={dialog.sourceId}
              loading={mine.status === "loading"}
              error={mine.error}
              onRetry={mine.reload}
              onCreated={(matchId) => {
                refresh()
                setDialog({ type: "match", matchId })
              }}
              onChanged={refresh}
            />
          )}
          {dialog.type === "match" && user && (
            <ExchangeMatchPanel
              key={`${user.id}:${dialog.matchId}`}
              matchId={dialog.matchId}
              myRequests={ownRequests}
              userId={user.id}
              onChanged={refresh}
            />
          )}
        </ExchangeDialog>
      )}
      {confirmation}
    </section>
  )
}

function LoadState({
  status,
  error,
  empty,
  emptyText,
  onRetry,
}: {
  status: string
  error: string | null
  empty?: boolean
  emptyText: string
  onRetry: () => void
}) {
  if (status === "loading")
    return (
      <p
        role="status"
        className="rounded-2xl bg-brand-lilac/40 p-5 text-sm text-muted"
      >
        Loading exchange data…
      </p>
    )
  if (error)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-2xl border border-brand-purple/15 bg-white p-5 text-sm text-brand-deep"
      >
        <p>{error}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  if (empty)
    return (
      <p
        role="status"
        className="rounded-2xl border border-dashed border-brand-purple/20 bg-white p-6 text-sm text-muted"
      >
        {emptyText}
      </p>
    )
  return null
}
function Preferences({
  request,
}: {
  request: Pick<ExchangeRequest, "desiredCategoryType" | "desiredSeatSection" | "allowCrossTier">
}) {
  return (
    <p className="mt-2 text-sm text-muted">
      Looking for: {request.desiredCategoryType ?? "Any category"} ·{" "}
      {request.desiredSeatSection
        ? `Section ${request.desiredSeatSection}`
        : "Any section"}{" "}
      · {request.allowCrossTier ? "Cross-tier allowed" : "Same tier requested"}
    </p>
  )
}
function ListingCard({
  listing,
  children,
  direct = false,
}: {
  listing: ExchangeListing
  children?: ReactNode
  direct?: boolean
}) {
  return (
    <Card className="flex flex-col p-5">
      <Badge tone="accent" className="w-fit">
        {direct ? "Direct invitation" : "Public request"}
      </Badge>
      <h3 className="mt-3 font-brand text-xl font-bold text-brand-deep">
        {listing.eventName}
      </h3>
      <p className="mt-2 text-sm text-muted">
        Offering {listing.offeredCategoryType} · Section{" "}
        {listing.offeredSeatSection}
      </p>
      {listing.offeredSeatLabel && <p className="text-sm text-muted">Seat {listing.offeredSeatLabel}</p>}
      {listing.offeredPrice != null && <p className="text-sm text-muted">Value: S${listing.offeredPrice.toFixed(2)}</p>}
      {listing.requesterDisplayName && (
        <p className="mt-1 text-sm text-muted">
          Listed by {listing.requesterDisplayName}
        </p>
      )}
      <Preferences request={listing} />
      <p className="mt-3 w-fit rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
        Expires <time dateTime={listing.expiresAt}>{formatDate(listing.expiresAt)}</time>
      </p>
      {children && <div className="mt-auto pt-4">{children}</div>}
    </Card>
  )
}
export function TicketInterestPanel({ listing, onCreated, onChanged }: {
  listing: ExchangeListing
  onCreated: (matchId: string) => void
  onChanged: () => void
}) {
  const { confirm, confirmation } = useExchangeConfirmation()
  const { user } = useStore()
  const load = useCallback((signal: AbortSignal) => getListingEligibleTickets(listing.requestId, signal), [listing.requestId])
  const tickets = useExchangeResource(user ? `interest-tickets:${user.id}:${listing.requestId}` : null, load)
  const [ticketId, setTicketId] = useState("")
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const available = tickets.data?.filter(ticket => ticket.eligible && ticket.eventId === listing.eventId) ?? []
  const selected = available.find(ticket => ticket.id === ticketId)
  const expired = Date.parse(listing.expiresAt) <= Date.now()
  if (!user) return <SignInLink>Sign in to express interest</SignInLink>
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || tickets.status !== "success" || expired || submitting.current) return
    if (!await confirm({ title: "Confirm your ticket offer", message: "Proceeding registers your acceptance and cannot be withdrawn. The other participant can review and accept or reject your offered ticket.", confirmLabel: "Confirm offer" })) return
    if (submitting.current || Date.parse(listing.expiresAt) <= Date.now()) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const match = await expressTicketInterest(listing.requestId, selected.id)
      onCreated(match.id)
    } catch (cause) {
      setError(`${exchangeErrorMessage(cause)} Interest was not confirmed. Check My Exchanges before retrying.`)
      tickets.refresh()
      onChanged()
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  return <div className="space-y-5">
    {confirmation}
    <h3 className="font-brand text-2xl font-bold text-brand-deep">Express interest</h3>
    <ListingCard listing={listing} />
    <LoadState status={tickets.status} error={tickets.error}
      empty={tickets.status === "success" && !available.length}
      emptyText="You don't have any eligible tickets for this exchange."
      onRetry={tickets.reload} />
    <form onSubmit={(event) => void submit(event)} className="space-y-4" aria-busy={pending}>
      <Field label="Your eligible ticket">
        <Select required value={selected?.id ?? ""} onChange={event => setTicketId(event.target.value)}
          disabled={pending || tickets.status !== "success" || !available.length || expired}>
          <option value="">Select your eligible owned ticket</option>
          {available.map((ticket, index) => <option key={ticket.id} value={ticket.id}>
            Ticket {index + 1} · {ticket.eventName} · {ticket.categoryType} · Section {ticket.seatSection}{ticket.seatLabel ? ` · Seat ${ticket.seatLabel}` : ""}{ticket.price != null ? ` · S$${ticket.price.toFixed(2)}` : ""}
          </option>)}
        </Select>
      </Field>
      {selected && <Card className="space-y-2 p-4">
        <p className="font-semibold">Your current / offered ticket</p>
        <p className="text-sm">{selected.eventName} · {selected.categoryType} · Section {selected.seatSection} · Seat {selected.seatLabel ?? "Unassigned"}</p>
        {selected.price != null && <p className="text-sm">Value: S${selected.price.toFixed(2)}{listing.offeredPrice != null && ` · Price difference: S$${Math.abs(listing.offeredPrice - selected.price).toFixed(2)}${listing.offeredPrice > selected.price ? " — you pay" : listing.offeredPrice < selected.price ? " — the other participant pays" : " — no payment required"}`}</p>}
      </Card>}
      <p className="text-sm text-muted">Only your compatible eligible tickets for the same event are shown. No separate public request is needed. Confirming your offer registers your acceptance immediately. The other participant then accepts or rejects; your acceptance cannot be withdrawn.</p>
      {expired && <p className="text-sm text-muted">This listing's expiry time has passed. Refresh listings.</p>}
      <Button type="submit" disabled={!selected || pending || tickets.status !== "success" || expired}>
        {pending ? "Submitting interest…" : "Express interest"}
      </Button>
    </form>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>
}

function InterestPanel({
  listing,
  requests,
  numbers,
  sourceId,
  loading,
  error,
  onRetry,
  onCreated,
  onChanged,
}: {
  listing: ExchangeListing
  requests: ExchangeRequest[]
  numbers: Map<string, number>
  sourceId?: string
  loading: boolean
  error: string | null
  onRetry: () => void
  onCreated: (matchId: string) => void
  onChanged: () => void
}) {
  const { confirm, confirmation } = useExchangeConfirmation()
  const [requestId, setRequestId] = useState(sourceId ?? "")
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const available = requests.filter(
    (request) => request.id !== listing.requestId,
  )
  const selected = available.find((request) => request.id === requestId)
  const expired = Date.parse(listing.expiresAt) <= Date.now()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (
      !selected ||
      expired ||
      pending ||
      submitting.current ||
      Date.parse(selected.expiresAt) <= Date.now()
    )
      return
    if (!await confirm({ title: "Confirm your ticket offer", message: "Proceeding registers your acceptance and cannot be withdrawn. The other participant can review and accept or reject your offered ticket.", confirmLabel: "Confirm offer" })) return
    if (submitting.current || Date.parse(selected.expiresAt) <= Date.now() || Date.parse(listing.expiresAt) <= Date.now()) return
    submitting.current = true
    setPending(true)
    setActionError(null)
    try {
      const match = await expressInterest(selected.id, listing.requestId)
      onCreated(match.id)
    } catch (cause) {
      setActionError(
        `${exchangeErrorMessage(cause)} Interest was not confirmed. Refresh My Exchanges before retrying.`,
      )
      onChanged()
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  return (
    <div className="space-y-5">
      {confirmation}
      <h3 className="font-brand text-2xl font-bold text-brand-deep">
        Express interest
      </h3>
      <ListingCard listing={listing} />
      <LoadState
        status={loading ? "loading" : error ? "error" : "success"}
        error={error}
        empty={!loading && !error && available.length === 0}
        emptyText="No open exchange requests are available for this invitation or suggestion."
        onRetry={onRetry}
      />
      <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
        <Field label="Your open exchange request">
          <Select
            required
            value={selected?.id ?? ""}
            disabled={pending || loading || !!error || !available.length}
            onChange={(event) => setRequestId(event.target.value)}
          >
            <option value="">Select your request</option>
            {available.map((request) => (
              <option key={request.id} value={request.id}>
                Request {numbers.get(request.id)} · {request.eventName} · {request.offeredCategoryType} · Section{" "}
                {request.offeredSeatSection}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-muted">
          The exchange service checks compatibility and availability before creating a
          pending match.
        </p>
        {expired && (
          <p className="text-sm text-muted">
            This listing's expiry time has passed. Refresh listings.
          </p>
        )}
        <Button
          type="submit"
          disabled={!selected || expired || pending || loading || !!error}
        >
          {pending ? "Submitting interest…" : "Express interest"}
        </Button>
      </form>
      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}
    </div>
  )
}
function ExchangeDialog({
  children,
  onClose,
  busy = false,
}: {
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = "exchange-dialog-title"
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
      onClose={onClose}
      className={cx(
        "fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-brand-purple/15 bg-white p-5 text-brand-deep shadow-xl backdrop:bg-brand-deep/40 sm:p-7",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-semibold text-brand-deep">
          EaseXchange
        </h2>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Close exchange details"
          disabled={busy}
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      {children}
    </dialog>
  )
}
function SignInLink({ children }: { children: ReactNode }) {
  return (
    <Link
      to="/login"
      className="inline-flex rounded-full border border-brand-purple/20 px-4 py-2 text-sm font-semibold text-brand-purple hover:bg-brand-lilac/50"
    >
      {children}
    </Link>
  )
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("en-SG")
}
