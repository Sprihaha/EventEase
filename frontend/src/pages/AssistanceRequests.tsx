import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { Accessibility, Calendar, UserRound, X } from "lucide-react";
import { useStore, fmtDate } from "../lib/store";
import type { AssistanceRequest, AssistanceStatus } from "../lib/data";
import { Badge, Button, Card, Select } from "../components/ui";

const statuses: AssistanceStatus[] = [
  "Submitted",
  "Assigned",
  "In progress",
  "Completed",
  "Cancelled",
];

const tone: Record<AssistanceStatus, "neutral" | "accent" | "warn" | "live" | "danger"> = {
  Submitted: "neutral",
  Assigned: "accent",
  "In progress": "warn",
  Completed: "live",
  Cancelled: "danger",
};

export default function AssistanceRequests() {
  const { user, assistanceRequests, events, bookings, cancelAssistanceRequest } = useStore();
  const [filter, setFilter] = useState<AssistanceStatus | "All">("All");
  const [confirming, setConfirming] = useState<AssistanceRequest | null>(null);

  const requests = useMemo(
    () =>
      assistanceRequests.filter(
        (request) =>
          (!user || request.userId === user.id || request.userId === "u-cust") &&
          (filter === "All" || request.status === filter),
      ),
    [assistanceRequests, filter, user],
  );

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: "/assistance" }} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Badge tone="accent"><Accessibility className="h-3 w-3" /> EaseGuide</Badge>
          <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight">
            My assistance requests
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Track venue support for your upcoming EventEase bookings.
          </p>
        </div>
        <label className="min-w-48">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Status filter
          </span>
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value as AssistanceStatus | "All")}
            aria-label="Filter assistance requests by status"
          >
            <option value="All">All statuses</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </Select>
        </label>
      </div>

      <div className="mt-8 space-y-4">
        {requests.map((request) => {
          const event = events.find((item) => item.id === request.eventId);
          const booking = bookings.find((item) => item.id === request.bookingId);
          const cancellable = request.status === "Submitted" || request.status === "Assigned";
          return (
            <Card key={request.id} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-semibold">
                      {event?.title ?? "Event"}
                    </h2>
                    <Badge tone={tone[request.status]}>{request.status}</Badge>
                  </div>
                  {event && (
                    <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                      <Calendar className="h-4 w-4" /> {fmtDate(event.date)} · Ref {booking?.ref}
                    </p>
                  )}
                  <div className="mt-4 rounded-2xl bg-mist/60 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">Support needs</div>
                    <p className="mt-1.5 text-sm leading-relaxed">{request.supportNeeds}</p>
                  </div>
                </div>
                <div className="min-w-52 space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted">Assistance level</div>
                    <div className="mt-1 font-semibold">{request.level}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Assigned staff</div>
                    <div className="mt-1 flex items-center gap-1.5 font-semibold">
                      <UserRound className="h-4 w-4 text-accent" />
                      {request.assignedStaff ?? "Not assigned yet"}
                    </div>
                  </div>
                  {cancellable && (
                    <Button size="sm" variant="danger" onClick={() => setConfirming(request)}>
                      Cancel request
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {!requests.length && (
          <Card className="p-12 text-center">
            <Accessibility className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-muted">No assistance requests match this status.</p>
            <Link to="/dashboard/customer"><Button className="mt-5">View my tickets</Button></Link>
          </Card>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <Card
            className="relative w-full max-w-md p-6"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-request-title"
            aria-describedby="cancel-request-copy"
          >
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close cancellation dialog"
              onClick={() => setConfirming(null)}
              className="absolute right-3 top-3 h-9 w-9 px-0 focus-visible:ring-4 focus-visible:ring-accent/20"
            >
              <X className="h-4 w-4" />
            </Button>
            <h2 id="cancel-request-title" className="font-display text-2xl font-semibold">
              Cancel assistance request?
            </h2>
            <p id="cancel-request-copy" className="mt-3 text-sm leading-relaxed text-muted">
              The assigned support team will be notified. This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="danger" onClick={() => {
                cancelAssistanceRequest(confirming.id);
                setConfirming(null);
              }}>
                Yes, cancel request
              </Button>
              <Button variant="outline" onClick={() => setConfirming(null)}>Keep request</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
