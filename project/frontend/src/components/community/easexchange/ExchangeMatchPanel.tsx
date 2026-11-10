import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import useExchangeConfirmation from "./useExchangeConfirmation";
import {
  acceptExchangeMatch,
  exchangeErrorMessage,
  getExchangeMatch,
  rejectExchangeMatch,
  settleExchangeMatch,
  type ExchangePaymentMethod,
} from "../../../lib/exchangeApi";
import type {
  ExchangeMatch,
  ExchangeRequest,
  ExchangeTicket,
} from "../../../lib/exchangeTypes";
import useExchangeResource from "../../../lib/useExchangeResource";
import { matchDisplayStatus, requestNumbers } from "../../../lib/exchangePresentation";
import ExchangeStatusBadge from "./ExchangeStatusBadge";
import { Button, Card } from "../../ui";
import {
  awardCompletedExchangePointsOnce,
  calculateExchangeDiscount,
  deductEasePoints,
  getUserEasePoints,
  EASEPOINTS_RULES,
} from "../../../lib/easePoints";
import { Sparkles } from "lucide-react";

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
  const { confirm, confirmation } = useExchangeConfirmation();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<ExchangePaymentMethod>("mock_success");
  const sawActive = useRef(false);
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
  const [userPoints, setUserPoints] = useState<number>(() => (userId ? getUserEasePoints(userId) : 0));
  const [applyDiscount, setApplyDiscount] = useState(false);

  useEffect(() => {
    if (userId) setUserPoints(getUserEasePoints(userId));
    const onPointsChanged = () => {
      if (userId) setUserPoints(getUserEasePoints(userId));
    };
    window.addEventListener("eventease:easepoints-updated", onPointsChanged);
    return () => window.removeEventListener("eventease:easepoints-updated", onPointsChanged);
  }, [userId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setConfirmed(null), [resource.data]);
  const match = confirmed ?? resource.data;
  useEffect(() => {
    if (match?.status === "PENDING" || match?.status === "READY") sawActive.current = true;
    if (match?.status !== "COMPLETED" || !sawActive.current) return;
    if (userId && matchId) {
      awardCompletedExchangePointsOnce(userId, matchId);
    }
    const timer = window.setTimeout(() => navigate("/dashboard/customer?exchange=completed"), 1500);
    return () => window.clearTimeout(timer);
  }, [match?.status, matchId, userId, navigate]);
  const numbers = requestNumbers(myRequests);
  const ownRequest = match && myRequests.find(request =>
    request.requesterUserId === userId &&
    (request.id === match.requestAId || request.id === match.requestBId));
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
  const refresh = () => {
    setConfirmed(null);
    resource.reload();
    onChanged();
  };

  const act = async (action: "accept" | "reject") => {
    if (
      !actionable || myAccepted ||
      submitting.current ||
      !match ||
      Date.parse(match.expiresAt) <= Date.now()
    )
      return;
    if (!await confirm(action === "accept" ? {
      title: "Accept exchange match?",
      message: "Your acceptance cannot be withdrawn. Equal-value tickets will exchange automatically once both participants accept. Any price difference must be paid before tickets transfer.",
      confirmLabel: "Confirm acceptance",
    } : {
      title: "Reject exchange match?",
      message: "This rejects the current proposal and cannot be undone. No tickets will be exchanged. The original request may reopen for another offer.",
      confirmLabel: "Confirm rejection", destructive: true,
    })) return;
    if (submitting.current || Date.parse(match.expiresAt) <= Date.now()) return;
    submitting.current = true;
    setPending(action);
    setError(null);
    try {
      const operation = {
        accept: acceptExchangeMatch,
        reject: rejectExchangeMatch,
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

  const discount = calculateExchangeDiscount(userPoints, match?.amountCents ?? 0, applyDiscount);

  const pay = async () => {
    if (!match || match.status !== "READY" || !match.isPayer || !match.amountCents || expired || pending || submitting.current) return;
    const payableStr = (discount.finalDifferenceCents / 100).toFixed(2);
    const discountMsg = discount.discountCents > 0
      ? ` 100 EasePoints will be redeemed for a 10% discount (saving S$${(discount.discountCents / 100).toFixed(2)}).`
      : "";
    if (!await confirm({
      title: "Confirm simulated payment",
      message: `Pay S$${payableStr} using simulated payment?${discountMsg} Successful payment automatically completes the exchange and cannot be undone.`,
      confirmLabel: `Confirm payment (S$${payableStr})`,
    })) return;
    if (submitting.current || Date.parse(match.expiresAt) <= Date.now()) return;
    submitting.current = true; setPending("pay"); setError(null);
    try {
      const result = await settleExchangeMatch(matchId, paymentMethod);
      if (result.status === "COMPLETED") {
        if (discount.pointsToDeduct > 0 && userId) {
          deductEasePoints(userId, discount.pointsToDeduct);
        }
        if (userId) {
          awardCompletedExchangePointsOnce(userId, matchId);
        }
      }
      setConfirmed(result);
      resource.refresh(); onChanged();
    } catch (cause) {
      setError(exchangeErrorMessage(cause)); resource.refresh(); onChanged();
    } finally { submitting.current = false; setPending(null); }
  };

  return (
    <div className="space-y-5" aria-busy={!!pending}>
      {confirmation}
      <h3 className="font-brand text-2xl font-bold text-brand-deep">
        {ownRequest ? `Request ${numbers.get(ownRequest.id)} · Match detail` : "Match detail"}
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
          <ExchangeStatusBadge status={matchDisplayStatus(match.status)} />
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
          <p className="w-fit rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
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
                  Your acceptance cannot be withdrawn. Waiting for the other participant. Refresh to check their
                  response.
                </p>
              )}
            </div>
          )}
          {match.status === "READY" && (
            <div role="status" className="space-y-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Both users accepted.</p>
              {match.amountCents != null && match.amountCents > 0 ? (
                <>
                  <p>
                    Original price difference: S${(match.amountCents / 100).toFixed(2)} · Payment status: {match.paymentStatus ?? "PENDING"}
                  </p>
                  <p>
                    {match.isPayer
                      ? "You receive the higher-valued ticket and must pay the difference."
                      : "Waiting for the other participant to pay the difference."}{" "}
                    Tickets will transfer automatically only after successful payment.
                  </p>
                  {match.isPayer && !expired && (
                    <div className="space-y-3 pt-1">
                      {/* EasePoints Discount Card */}
                      {discount.isEligible ? (
                        <div className="rounded-xl border border-brand-purple/20 bg-white p-3.5 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-brand-deep flex items-center gap-1.5">
                              <Sparkles className="h-4 w-4 text-brand-orange" /> EasePoints Balance: {userPoints} pts
                            </span>
                            <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-[11px] font-bold text-brand-deep">
                              10% discount available
                            </span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer font-medium text-brand-deep pt-1">
                            <input
                              type="checkbox"
                              checked={applyDiscount}
                              onChange={(e) => setApplyDiscount(e.target.checked)}
                              disabled={!!pending}
                              className="h-4 w-4 rounded border-brand-purple/30 text-brand-purple focus:ring-brand-purple/30"
                            />
                            <span>Redeem 100 EasePoints for a 10% discount (-S${(discount.discountCents / 100).toFixed(2)})</span>
                          </label>
                          {applyDiscount && (
                            <div className="pt-2 border-t border-brand-purple/10 space-y-1 text-muted">
                              <div className="flex justify-between">
                                <span>Original difference:</span>
                                <span>S${((match.amountCents ?? 0) / 100).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-brand-orange font-semibold">
                                <span>EasePoints 10% discount:</span>
                                <span>-S${(discount.discountCents / 100).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-brand-deep text-sm pt-0.5">
                                <span>Final payable difference:</span>
                                <span>S${(discount.finalDifferenceCents / 100).toFixed(2)}</span>
                              </div>
                              <p className="text-[11px] text-muted pt-0.5">
                                Balance after swap: {discount.remainingPoints} pts (+{EASEPOINTS_RULES.POINTS_PER_COMPLETED_EXCHANGE} pts earned on completion).
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-brand-purple/15 bg-white/70 p-3 text-xs text-muted flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <span className="flex items-center gap-1.5 font-medium text-brand-deep">
                            <Sparkles className="h-4 w-4 text-brand-orange" /> EasePoints: {userPoints} pts
                          </span>
                          <span className="text-[11px]">
                            Earn {100 - userPoints} more pts to unlock 10% off ticket swap difference
                          </span>
                        </div>
                      )}

                      <label className="block text-xs">
                        Simulated payment result
                        <select
                          className="ml-2 rounded-lg border bg-white p-2 text-xs"
                          disabled={!!pending}
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value as ExchangePaymentMethod)}
                        >
                          <option value="mock_success">Success</option>
                          <option value="mock_fail">Declined</option>
                          <option value="mock_pending">Pending</option>
                          <option value="mock_cancel">Cancelled</option>
                        </select>
                      </label>
                      <Button disabled={!!pending} onClick={() => void pay()}>
                        {pending === "pay"
                          ? "Processing payment…"
                          : `Pay S$${(discount.finalDifferenceCents / 100).toFixed(2)} difference`}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p>Awaiting exchange completion. Refresh to check the latest status.</p>
              )}
              {expired && <p>The exchange deadline has passed. Payment is no longer available.</p>}
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
            <div className="space-y-1.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-brand-orange" />
                Exchange completed! +{EASEPOINTS_RULES.POINTS_PER_COMPLETED_EXCHANGE} EasePoints awarded ✨
              </p>
              <p className="text-xs text-emerald-800">
                Your received ticket is now in My Tickets. {match.updatedAt && `Completed ${new Date(match.updatedAt).toLocaleString("en-SG")}.`}
              </p>
            </div>
          )}
          {match.status === "COMPLETED" && <Link className="font-semibold text-brand-purple underline" to="/dashboard/customer?exchange=completed">Open My Tickets</Link>}
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
