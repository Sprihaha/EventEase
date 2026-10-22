import { useRef, useState } from "react"
import { Repeat } from "lucide-react"
import {
  createExchangeRequest,
  exchangeErrorMessage,
  getEligibleExchangeTickets,
} from "../lib/exchangeApi"
import type { ExchangeRequest } from "../lib/exchangeTypes"
import useExchangeResource from "../lib/useExchangeResource"
import { Badge, Button, Card, Field, Input, Select } from "./ui"

type Props = { onCreated: (request: ExchangeRequest) => void }

export default function SwapRequestPanel({ onCreated }: Props) {
  const tickets = useExchangeResource(
    "eligible-tickets",
    getEligibleExchangeTickets,
  )
  const [ticketId, setTicketId] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ticket") ?? "" : "")
  const [desiredCategory, setDesiredCategory] = useState("")
  const [desiredSection, setDesiredSection] = useState("")
  const [allowCrossTier, setAllowCrossTier] = useState(false)
  const [requestType, setRequestType] = useState<"PUBLIC" | "DIRECT">("PUBLIC")
  const [recipientUsername, setRecipientUsername] = useState("")
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const eligibleTickets =
    tickets.data?.filter((ticket) => ticket.eligible) ?? []
  const selected = eligibleTickets.find((ticket) => ticket.id === ticketId)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || tickets.status !== "success" || submitting.current) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await createExchangeRequest({
        offeredTicketId: selected.id,
        desiredCategoryType: desiredCategory.trim() || null,
        desiredSeatSection: desiredSection.trim() || null,
        allowCrossTier,
        requestType,
        ...(requestType === "DIRECT" ? { recipientUsername: recipientUsername.trim() } : {}),
      })
      onCreated(result)
    } catch (cause) {
      setError(
        `${exchangeErrorMessage(cause)} Creation was not confirmed. Check My Exchanges before submitting again.`,
      )
      tickets.reload()
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <Badge tone="accent">
        <Repeat className="h-3 w-3" /> EaseXchange
      </Badge>
      <h2 className="mt-3 font-brand text-2xl font-bold text-brand-deep">
        Create exchange request
      </h2>
      <p className="mt-2 text-sm text-muted">
        Offer one eligible ticket. The exchange service validates ownership and
        availability.
      </p>
      {tickets.status === "loading" && (
        <p role="status" className="mt-5 text-sm text-muted">
          Loading eligible tickets…
        </p>
      )}
      {tickets.error && (
        <div
          role="alert"
          className="mt-5 space-y-3 rounded-2xl bg-brand-lilac/60 p-4 text-sm"
        >
          <p>{tickets.error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={tickets.reload}
          >
            Retry eligible tickets
          </Button>
        </div>
      )}
      {tickets.status === "success" && !eligibleTickets.length && (
        <p
          role="status"
          className="mt-5 rounded-2xl bg-brand-lilac/60 p-4 text-sm text-muted"
        >
          No eligible tickets available.
        </p>
      )}
      <form className="mt-5 space-y-5" onSubmit={submit} aria-busy={pending}>
        <fieldset
          disabled={
            pending || tickets.status !== "success" || !eligibleTickets.length
          }
          className="space-y-5 disabled:opacity-60"
        >
          <Field label="Your ticket to offer">
            <Select
              required
              value={selected?.id ?? ""}
              onChange={(event) => setTicketId(event.target.value)}
            >
              <option value="">Select an eligible owned ticket</option>
              {eligibleTickets.map((ticket) => (
                <option key={ticket.id} value={ticket.id}>
                  {ticket.eventName} · {ticket.categoryType} · Section{" "}
                  {ticket.seatSection}
                  {ticket.seatLabel ? ` · Seat ${ticket.seatLabel}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {selected && (
            <p className="text-sm text-muted">
              Ticket status: {selected.status}
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Desired category (optional)">
              <Input
                maxLength={100}
                value={desiredCategory}
                onChange={(event) => setDesiredCategory(event.target.value)}
                placeholder="Any category"
              />
            </Field>
            <Field label="Desired seat section (optional)">
              <Input
                maxLength={100}
                value={desiredSection}
                onChange={(event) => setDesiredSection(event.target.value)}
                placeholder="Any section"
              />
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm text-brand-deep">
            <input
              type="checkbox"
              checked={allowCrossTier}
              onChange={(event) => setAllowCrossTier(event.target.checked)}
              className="h-4 w-4 accent-brand-purple"
            />{" "}
            Allow cross-tier suggestions
          </label>
          <Field label="Request type">
            <Select value={requestType} onChange={e => setRequestType(e.target.value as "PUBLIC" | "DIRECT")}>
              <option value="PUBLIC">Public</option>
              <option value="DIRECT">Direct</option>
            </Select>
          </Field>
          {requestType === "DIRECT" && <Field label="Recipient customer username">
            <Input required maxLength={100} value={recipientUsername} onChange={e => setRecipientUsername(e.target.value)} />
            <p className="mt-2 text-xs text-muted">Only this recipient can see your invitation and offer a compatible ticket.</p>
          </Field>}
          <p className="text-sm text-muted">
            Compatible matches are selected by the exchange service. After mutual
            acceptance, complete simulated settlement from the match details.
          </p>
          <Button type="submit" disabled={!selected || pending}>
            {pending ? "Creating request…" : "Create request"}
          </Button>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 p-4 text-sm text-danger"
          >
            {error}
          </p>
        )}
      </form>
    </Card>
  )
}
