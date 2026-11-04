import { useState } from "react";
import { requestEventCancellation } from "../../lib/cancellationApi";
import type { EventItem } from "../../lib/data";
import { useStore } from "../../lib/store";
import { Button, Field, Textarea } from "../ui";

/** Ask an administrator to cancel an event. Nothing changes for ticket holders until it is approved. */
export default function CancelEventPanel({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const { refreshManagedEvents } = useStore();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const sold = event.tiers.reduce((sum, t) => sum + t.sold, 0);

  const send = async () => {
    if (reason.trim().length < 5) return setError("Tell the administrator why (at least 5 characters).");
    setSending(true);
    setError("");
    try {
      await requestEventCancellation(event.id, reason.trim());
      await refreshManagedEvents();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the cancellation request.");
      setSending(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-danger/25 bg-rose-50/60 p-5">
      <h4 className="font-brand text-lg font-bold text-brand-deep">Cancel this event?</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-deep">
        <li>An administrator must approve the cancellation first.</li>
        <li>While you wait, ticket sales are paused and the event cannot be edited.</li>
        <li>If approved, {sold ? `all ${sold} ticket(s) sold are refunded in full` : "any tickets sold are refunded in full"} and every buyer is emailed.</li>
      </ul>
      <div className="mt-4">
        <Field label="Reason (shown to the administrator and to ticket holders)">
          <Textarea rows={3} maxLength={1000} value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} />
        </Field>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button type="button" variant="danger" disabled={sending} onClick={() => void send()}>
          {sending ? "Sending…" : "Send cancellation request"}
        </Button>
        <Button type="button" variant="outline" disabled={sending} onClick={onClose}>Keep event</Button>
      </div>
    </div>
  );
}
