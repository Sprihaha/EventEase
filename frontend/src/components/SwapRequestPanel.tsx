import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bell, Check, Repeat, X } from "lucide-react";
import type { ExchangeListing } from "../lib/data";
import { currency } from "../lib/store";
import { Badge, Button, Card, Field, Select, Textarea } from "./ui";

// Supply these from the signed-in user's eligible tickets when the database is connected.
export type EligibleSwapTicket = {
  id: string;
  eventId: string;
  tier: string;
  seat: string;
};

export type SwapRequestDraft = {
  targetListingId: string;
  eventId: string;
  offeredTicketId: string | null;
  message: string;
};

type Props = {
  listing: ExchangeListing;
  eventName: string;
  ownedTickets?: EligibleSwapTicket[];
  onBack: () => void;
  onClose: () => void;
};

export default function SwapRequestPanel({ listing, eventName, ownedTickets = [], onBack, onClose }: Props) {
  const [step, setStep] = useState<"details" | "review" | "created">("details");
  const [ticketId, setTicketId] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<SwapRequestDraft | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const eligibleTickets = ownedTickets.filter((ticket) => ticket.eventId === listing.eventId);
  const selectedTicket = eligibleTickets.find((ticket) => ticket.id === ticketId);

  useEffect(() => { heading.current?.focus(); }, [step]);

  const createPreview = () => {
    // Frontend-only draft. Replace this local preview with request creation and a
    // recipient notification through the backend once real ticket/user IDs exist.
    setPreview({
      targetListingId: listing.id,
      eventId: listing.eventId,
      offeredTicketId: selectedTicket?.id ?? null,
      message: message.trim(),
    });
    setStep("created");
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone="accent"><Repeat className="h-3 w-3" /> Swap tickets</Badge>
          <h2 ref={heading} tabIndex={-1} id="other-listings-title" className="mt-3 font-brand text-2xl font-bold">
            {step === "details" ? "Request a ticket swap" : step === "review" ? "Review your swap request" : "Swap request preview created"}
          </h2>
          <p id="other-listings-event" className="mt-2 text-sm text-muted">{eventName}</p>
        </div>
        <Button variant="ghost" size="sm" aria-label="Close swap request" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>
      <p className="mt-4 rounded-2xl bg-brand-lilac/60 p-4 text-sm text-brand-deep">
        Preview only. Requests and notifications are not sent or saved to a database yet.
      </p>
      {step !== "created" && (
        <Card className="mt-5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ticket you want</p>
          <p className="mt-2 font-brand font-bold">{listing.tier} · Seat {listing.seat}</p>
          <p className="mt-1 text-sm text-muted">Listed by {listing.sellerName} · Listed price {currency(listing.askPrice)}</p>
        </Card>
      )}
      {step === "details" && (
        <form className="mt-5 space-y-5" onSubmit={(event) => { event.preventDefault(); setStep("review"); }}>
          <Field label="Your ticket to offer">
            <Select value={ticketId} disabled={!eligibleTickets.length} required={eligibleTickets.length > 0} onChange={(event) => setTicketId(event.target.value)} aria-describedby="swap-ticket-help">
              <option value="">{eligibleTickets.length ? "Select an eligible ticket" : "Your eligible tickets will appear here"}</option>
              {eligibleTickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.tier} · Seat {ticket.seat}</option>)}
            </Select>
          </Field>
          <p id="swap-ticket-help" className="text-sm text-muted">
            {eligibleTickets.length ? "Choose a ticket you own for this same event." : "Owned tickets are not connected yet. You can preview the flow without offering a real ticket."}
          </p>
          <Field label={`Message to ${listing.sellerName} (optional)`}>
            <Textarea rows={3} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Let them know why you would like to swap…" />
          </Field>
          <div className="flex flex-wrap justify-between gap-3 border-t border-brand-purple/10 pt-5">
            <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back to listings</Button>
            <Button type="submit" disabled={eligibleTickets.length > 0 && !selectedTicket}>Preview request <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </form>
      )}
      {step === "review" && (
        <div className="mt-5 space-y-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Request to</dt><dd className="mt-1 font-semibold">{listing.sellerName}</dd></div>
            <div><dt className="text-muted">Your offered ticket</dt><dd className="mt-1 font-semibold">{selectedTicket ? `${selectedTicket.tier} · Seat ${selectedTicket.seat}` : "Not selected — preview only"}</dd></div>
          </dl>
          <p className="text-sm text-muted">The ticket owner would receive the notification below and could review your request. A real request will require an eligible owned ticket.</p>
          <Card className="bg-brand-lilac/30 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Bell className="h-4 w-4" /> Notification preview for {listing.sellerName}</h3>
            <p className="mt-3 text-sm">Someone is looking to swap tickets with you for {eventName} — {listing.tier}, seat {listing.seat}.</p>
            {message.trim() && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted">Message: {message.trim()}</p>}
          </Card>
          <div className="flex flex-wrap justify-between gap-3 border-t border-brand-purple/10 pt-5">
            <Button variant="outline" onClick={() => setStep("details")}><ArrowLeft className="h-4 w-4" /> Edit request</Button>
            <Button onClick={createPreview}><Check className="h-4 w-4" /> Create request preview</Button>
          </div>
        </div>
      )}
      {step === "created" && preview && (
        <div className="mt-5 space-y-5">
          <p role="status" className="rounded-2xl bg-live/10 p-4 text-sm text-live">Your swap request preview is ready. {listing.sellerName} has not been notified.</p>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-brand font-bold"><Bell className="h-4 w-4" /> Recipient notification preview</h3>
            <p className="mt-3 text-sm">To: {listing.sellerName}</p>
            <p className="mt-2 text-sm">Someone is looking to swap tickets with you for {eventName} — {listing.tier}, seat {listing.seat}.</p>
            {preview.message && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted">Message: {preview.message}</p>}
            <p className="mt-3 text-xs font-semibold text-muted">Not sent · Local preview only</p>
          </Card>
          <p className="text-sm text-muted">This preview will be cleared when you leave this request. No ticket ownership or payment has changed.</p>
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="outline" onClick={onBack}>Back to listings</Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </>
  );
}
