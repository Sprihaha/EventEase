import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptExchangeMatch,
  cancelExchangeMatch,
  exchangeErrorMessage,
  getExchangeMatch,
  rejectExchangeMatch,
  settleExchangeMatch,
} from "../../lib/exchangeApi";
import type {
  ExchangeMatch,
  ExchangeRequest,
  ExchangeTicket,
} from "../../lib/exchangeTypes";
import useExchangeResource from "../../lib/useExchangeResource";
import { Badge, Button, Card } from "../ui";

export type ExchangeMatchPanelProps = {
  matchId: string;
  myRequests: ExchangeRequest[];
  userId: string;
  onChanged: () => void;
};

export function ExchangeMatchPanel({
  matchId,
  myRequests,
  userId,
  onChanged,
}: ExchangeMatchPanelProps) {
  const load = useCallback(
    (signal: AbortSignal) => getExchangeMatch(matchId, signal),
    [matchId],
  );
  const resource = useExchangeResource(matchId, load);
  const [confirmed, setConfirmed] = useState<ExchangeMatch | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [failPayment, setFailPayment] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setConfirmed(null), [resource.data]);
  const match = confirmed ?? resource.data;
  const ownIds = new Set(
    myRequests
      .filter((request) => request.requesterUserId === userId)
      .map((request) => request.id),
  );
  const ownsA = !!match && ownIds.has(match.requestAId);
  const ownsB = !!match && ownIds.has(match.requestBId);
  const knownSide = ownsA !== ownsB;
  const expired = !!match && Date.parse(match.expiresAt) <= now;
  const myAccepted = !!match && (ownsA ? match.aAccepted : match.bAccepted);
  const theirAccepted = !!match && (ownsA ? match.bAccepted : match.aAccepted);
  const actionable =
    !!match && match.status === "PENDING" && !expired && knownSide && !pending;
  const myPrice = match && (ownsA ? match.ticketA.price : match.ticketB.price);
  const theirPrice = match && (ownsA ? match.ticketB.price : match.ticketA.price);
  const difference = myPrice != null && theirPrice != null ? Math.round((theirPrice - myPrice) * 100) : null;
  const canSettle = match?.status === "READY" && knownSide && !expired && !pending && difference !== null && difference >= 0;

  const settle = async () => {
    if (!canSettle || submitting.current) return;
    submitting.current = true;
    setPending("settle");
    setError(null);
    try {
      setConfirmed(await settleExchangeMatch(matchId, failPayment));
      resource.refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Settlement was not confirmed. Refresh to check.");
      resource.refresh();
      onChanged();
    } finally {
      submitting.current = false;
      setPending(null);
    }
  };

  const refresh = () => {
    setConfirmed(null);
    resource.reload();
    onChanged();
  };

  const act = async (action: "accept" | "reject" | "cancel") => {
    if (
      !(actionable || (action === "cancel" && match?.status === "READY" && knownSide && !expired && !pending)) ||
      submitting.current ||
      !match ||
      Date.parse(match.expiresAt) <= Date.now()
    )
      return;
    submitting.current = true;
    setPending(action);
    setError(null);
    try {
      const operation = {
        accept: acceptExchangeMatch,
        reject: rejectExchangeMatch,
        cancel: cancelExchangeMatch,
      }[action];
      const response = await operation(matchId);
      setConfirmed(response);
      resource.refresh();
      onChanged();
    } catch (cause) {
      setError(
        `${exchangeErrorMessage(cause)} The action was not confirmed. Refresh to check the current status.`,
      );
      resource.refresh();
      onChanged();
    } finally {
      submitting.current = false;
      setPending(null);
    }
  };

  return (
    <div className="space-y-5" aria-busy={!!pending}>
      <h3 className="font-brand text-2xl font-bold text-brand-deep">
        Match detail
      </h3>
      {resource.status === "loading" && !confirmed && (
        <p role="status" className="text-sm text-muted">
          Loading match details…
        </p>
      )}
      {resource.error && !confirmed && (
        <p role="alert" className="text-sm text-danger">
          {resource.error}
        </p>
      )}
      {match && (
        <>
          <Badge
            tone={
              match.status === "READY"
                ? "live"
                : match.status === "PENDING"
                  ? "accent"
                  : "neutral"
            }
          >
            {match.status}
          </Badge>
          {!knownSide && (
            <p role="status" className="text-sm text-muted">
              Your participant details are unavailable. Refresh My Exchanges to
              identify your ticket and enable available actions.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TicketDetails
              title={knownSide ? "Your current / offered ticket" : "Ticket A"}
              ticket={knownSide && ownsB ? match.ticketB : match.ticketA}
            />
            <TicketDetails
              title={knownSide ? "Ticket you receive" : "Ticket B"}
              ticket={knownSide && ownsB ? match.ticketA : match.ticketB}
            />
          </div>
          <p className="text-sm text-muted">
            Expires:{" "}
            <time dateTime={match.expiresAt}>
              {new Date(match.expiresAt).toLocaleString("en-SG")}
            </time>
          </p>
          {difference !== null && knownSide && (
            <p className="text-sm font-semibold">
              Price difference: S${(Math.abs(difference) / 100).toFixed(2)}
              {difference > 0
                ? " — you pay"
                : difference < 0
                  ? " — the other participant pays"
                  : " — no payment required"}
            </p>
          )}
          {match.status === "PENDING" && (
            <div
              className="rounded-2xl bg-brand-lilac/50 p-4 text-sm text-brand-deep"
              role="status"
            >
              <p>
                {knownSide ? "You" : "Participant A"}:{" "}
                {(knownSide ? myAccepted : match.aAccepted)
                  ? "Accepted"
                  : "Waiting for acceptance"}
              </p>
              <p className="mt-2">
                {knownSide ? "Other participant" : "Participant B"}:{" "}
                {(knownSide ? theirAccepted : match.bAccepted)
                  ? "Accepted"
                  : "Waiting for acceptance"}
              </p>
              {myAccepted && knownSide && !theirAccepted && (
                <p className="mt-2">
                  Waiting for the other participant. Refresh to check their
                  response.
                </p>
              )}
            </div>
          )}
          {match.status === "READY" && (
            <div className="space-y-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
              <p role="status" className="font-semibold">Both users accepted. Awaiting settlement.</p>
              {difference !== null && knownSide && (
                <p>
                  {difference < 0
                    ? `The other participant pays S$${(-difference / 100).toFixed(2)}.`
                    : `Your simulated payment: S$${(difference / 100).toFixed(2)}.`}
                </p>
              )}
              <p>Completing settlement swaps both individual tickets and replaces both QR codes.</p>
              {difference !== null && difference > 0 && (
                <label className="block">
                  Simulated settlement result
                  <select
                    className="ml-2 rounded border p-2"
                    value={failPayment ? "fail" : "success"}
                    onChange={(e) => setFailPayment(e.target.value === "fail")}
                  >
                    <option value="success">Success</option>
                    <option value="fail">Declined — test retry</option>
                  </select>
                </label>
              )}
              <Button
                variant="danger"
                disabled={!knownSide || expired || !!pending}
                onClick={() => void act("cancel")}
              >
                Cancel match
              </Button>
              <Button disabled={!canSettle} onClick={() => void settle()}>
                {pending === "settle"
                  ? "Settling…"
                  : difference === 0
                    ? "Complete equal-value swap"
                    : "Complete simulated settlement"}
              </Button>
            </div>
          )}
          {match.status === "EXPIRED" && (
            <p className="text-sm text-muted">
              This match has expired. No further match actions are available.
            </p>
          )}
          {match.status === "REJECTED" && (
            <p className="text-sm text-muted">This match was rejected.</p>
          )}
          {match.status === "CANCELLED" && (
            <p className="text-sm text-muted">This match was cancelled.</p>
          )}
          {match.status === "COMPLETED" && (
            <p className="text-sm text-muted">
              Exchange completed. Your received ticket and fresh QR code are now in My Tickets. {match.updatedAt && `Completed ${new Date(match.updatedAt).toLocaleString("en-SG")}.`}
            </p>
          )}
          {expired && match.status === "PENDING" && (
            <p role="status" className="text-sm text-muted">
              The expiry time has passed. Refresh to check the current status.
            </p>
          )}
          {match.status === "PENDING" && (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!actionable || myAccepted}
                onClick={() => void act("accept")}
              >
                {pending === "accept"
                  ? "Accepting…"
                  : myAccepted && knownSide
                    ? "Accepted"
                    : "Accept match"}
              </Button>
              <Button
                variant="outline"
                disabled={!actionable || myAccepted}
                onClick={() => void act("reject")}
              >
                {pending === "reject" ? "Rejecting…" : "Reject match"}
              </Button>
              <Button
                variant="danger"
                disabled={!actionable}
                onClick={() => void act("cancel")}
              >
                {pending === "cancel" ? "Cancelling…" : "Cancel match"}
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!!pending || resource.status === "loading"}
        onClick={refresh}
      >
        Refresh match
      </Button>
    </div>
  );
}

function TicketDetails({
  title,
  ticket,
}: {
  title: string;
  ticket: ExchangeTicket;
}) {
  return (
    <Card className="p-4">
      <h4 className="font-semibold text-brand-deep">{title}</h4>
      <dl className="mt-3 space-y-2 text-sm">
        {ticket.price != null && (
          <div>
            <dt className="text-muted">Value</dt>
            <dd>S${ticket.price.toFixed(2)}</dd>
          </div>
        )}
        {ticket.seatLabel && (
          <div>
            <dt className="text-muted">Seat</dt>
            <dd>{ticket.seatLabel}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted">Event</dt>
          <dd className="font-semibold text-brand-deep">{ticket.eventName}</dd>
        </div>
        <div>
          <dt className="text-muted">Category</dt>
          <dd>{ticket.categoryType}</dd>
        </div>
        <div>
          <dt className="text-muted">Seat section</dt>
          <dd>{ticket.seatSection}</dd>
        </div>
      </dl>
    </Card>
  );
}

export default ExchangeMatchPanel;
