import { useCallback, useEffect, useState } from "react";
import { CalendarX, Check, X } from "lucide-react";
import { Badge, Button, Card, Input, cx } from "./ui";
import { currency } from "../lib/store";
import {
  approveCancellation,
  fetchCancellationRequests,
  rejectCancellation,
  type CancellationRequest,
  type CancellationStatus,
} from "../lib/cancellationApi";

const FILTERS: { id: CancellationStatus | "ALL"; label: string }[] = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All" },
];
const TONE: Record<CancellationStatus, "warn" | "live" | "danger"> = { PENDING: "warn", APPROVED: "live", REJECTED: "danger" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Admin review of organiser requests to cancel an event. Approving cancels the event, refunds every
 * paid booking in full and emails the ticket holders; rejecting keeps the event and tells the organiser why.
 */
export default function EventCancellations({ onChanged }: { onChanged?: () => void }) {
  const [filter, setFilter] = useState<CancellationStatus | "ALL">("PENDING");
  const [items, setItems] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which card has its approve or reject form open, and the note typed so far.
  const [open, setOpen] = useState<{ id: string; action: "approve" | "reject"; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchCancellationRequests(filter === "ALL" ? undefined : filter));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load cancellation requests.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: CancellationRequest, action: "approve" | "reject", note: string) => {
    if (action === "reject" && note.trim().length < 3) {
      setError("Write a short note for the organiser explaining why (at least 3 characters).");
      return;
    }
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      if (action === "approve") {
        const result = await approveCancellation(item.id, note.trim());
        setNotice(
          result.failedRefunds
            ? `${item.eventTitle} is cancelled. ${result.refundedBookings} booking(s) refunded, but ${result.failedRefunds} refund(s) failed. Open the Approved list and press "Retry refunds".`
            : `${item.eventTitle} is cancelled. ${result.refundedBookings} booking(s) refunded (${currency(result.refundedCents / 100)}) and ticket holders have been emailed.`,
        );
      } else {
        await rejectCancellation(item.id, note.trim());
        setNotice(`The request to cancel ${item.eventTitle} was rejected. The organiser has been emailed.`);
      }
      setOpen(null);
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the decision.");
    } finally {
      setBusyId(null);
    }
  };

  // After approval, any paid booking left means a refund failed and can be retried.
  const retry = async (item: CancellationRequest) => decide(item, "approve", "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-brand text-2xl font-bold text-brand-deep">Event cancellations</h2>
          <p className="text-sm text-muted">Organisers ask to cancel an event here. Approving refunds every paid booking and emails ticket holders.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-brand-purple/15 bg-white p-1" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={cx("cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition",
                filter === f.id ? "bg-brand-deep text-white" : "text-muted hover:text-brand-deep")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-danger/10 p-3.5 text-sm font-medium text-danger">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-800">{notice}</div>}

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted">Loading cancellation requests…</Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {filter === "PENDING" ? "No cancellation requests are waiting for review." : "No cancellation requests here yet."}
        </Card>
      ) : (
        items.map((item) => {
          const busy = busyId === item.id;
          const form = open?.id === item.id ? open : null;
          return (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CalendarX className="h-5 w-5 text-brand-orange" />
                    <span className="font-brand text-lg font-bold text-brand-deep">{item.eventTitle}</span>
                    <Badge tone={TONE[item.status]}>{item.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-sm text-muted">{item.venueName} · {when(item.startAt)}</p>
                  <p className="text-sm text-brand-deep"><span className="font-semibold">Reason:</span> {item.reason}</p>
                  <p className="text-sm text-muted">
                    {item.status === "APPROVED"
                      ? `Refunded ${item.refundedBookings} booking(s), ${currency(item.refundedCents / 100)}`
                      : `${item.paidBookings} paid booking(s), ${item.ticketsSold} ticket(s) · ${currency(item.amountToRefundCents / 100)} to refund`}
                  </p>
                  <p className="text-xs text-muted">Requested by {item.requestedBy ?? "an organiser"} on {when(item.createdAt)}</p>
                  {item.decidedAt && (
                    <p className="text-xs text-muted">
                      {item.status === "APPROVED" ? "Approved" : "Rejected"} by {item.decidedBy ?? "an administrator"} on {when(item.decidedAt)}
                      {item.decisionNote ? ` — “${item.decisionNote}”` : ""}
                    </p>
                  )}
                  {item.status === "APPROVED" && item.paidBookings > 0 && (
                    <p className="text-sm font-semibold text-danger">{item.paidBookings} refund(s) did not go through.</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {item.status === "PENDING" && !form && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => setOpen({ id: item.id, action: "approve", note: "" })}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen({ id: item.id, action: "reject", note: "" })}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                  {item.status === "APPROVED" && item.paidBookings > 0 && (
                    <Button size="sm" disabled={busy} onClick={() => void retry(item)}>{busy ? "Retrying…" : "Retry refunds"}</Button>
                  )}
                  {form && (
                    <div className="w-80 max-w-full space-y-2">
                      <p className="text-sm text-brand-deep">
                        {form.action === "approve"
                          ? `Cancel this event and refund ${item.paidBookings} booking(s) (${currency(item.amountToRefundCents / 100)})? This cannot be undone.`
                          : "Keep the event. Tell the organiser why:"}
                      </p>
                      <Input
                        placeholder={form.action === "approve" ? "Note (optional)" : "Reason (emailed to the organiser)"}
                        value={form.note}
                        maxLength={1000}
                        aria-label={form.action === "approve" ? "Approval note" : "Rejection reason"}
                        onChange={(e) => setOpen({ ...form, note: e.target.value })}
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(null)}>Back</Button>
                        <Button size="sm" variant={form.action === "approve" ? "danger" : "primary"} disabled={busy}
                          onClick={() => void decide(item, form.action, form.note)}>
                          {busy ? "Saving…" : form.action === "approve" ? "Cancel event & refund" : "Confirm reject"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
