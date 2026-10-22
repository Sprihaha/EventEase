import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, X } from "lucide-react";
import { useStore } from "../lib/store";
import type { AssistanceRequest, AssistanceStatus } from "../lib/data";
import { Badge, Button, Card, Field, Input, Select, cx } from "./ui";
import ReportDownload from "./ReportDownload";

const statuses: AssistanceStatus[] = [
  "Submitted",
  "Assigned",
  "In progress",
  "Completed",
  "Cancelled",
];

const statusTone: Record<
  AssistanceStatus,
  "neutral" | "accent" | "warn" | "live" | "danger"
> = {
  Submitted: "neutral",
  Assigned: "accent",
  "In progress": "warn",
  Completed: "live",
  Cancelled: "danger",
};

const nextSteps: Partial<Record<AssistanceStatus, AssistanceStatus[]>> = {
  Submitted: ["Assigned", "Cancelled"],
  Assigned: ["In progress", "Cancelled"],
  "In progress": ["Completed", "Cancelled"],
};

const pageSize = 5;

// The backend uses SUBMITTED, IN_PROGRESS, ... for the statuses shown here as "Submitted", "In progress", ...
const backendStatus = (status: AssistanceStatus) => status.toUpperCase().replace(/ /g, "_");

export default function AssistanceQueue() {
  const { assistanceRequests, events, updateAssistanceRequest } = useStore();
  const [filter, setFilter] = useState<AssistanceStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = assistanceRequests.find((request) => request.id === selectedId) ?? null;

  const filtered = useMemo(
    () =>
      assistanceRequests.filter((request) => filter === "All" || request.status === filter),
    [assistanceRequests, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [filter]);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line p-5">
          <div>
            <div className="flex items-center gap-2 font-brand text-xl font-bold text-brand-deep">
              <ClipboardList className="h-5 w-5 text-brand-orange" /> Assistance queue
            </div>
            <p className="mt-1 text-sm text-muted">
              Review EaseGuide requests and assign venue support staff.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-48">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Status filter
              </span>
              <Select
                value={filter}
                onChange={(event) => setFilter(event.target.value as AssistanceStatus | "All")}
                aria-label="Filter assistance queue by status"
              >
                <option value="All">All statuses</option>
                {statuses.map((status) => <option key={status}>{status}</option>)}
              </Select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Report from
              </span>
              <Input
                type="date"
                value={createdFrom}
                max={createdTo || undefined}
                onChange={(event) => setCreatedFrom(event.target.value)}
                aria-label="Audit report: first created date"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Report to
              </span>
              <Input
                type="date"
                value={createdTo}
                min={createdFrom || undefined}
                onChange={(event) => setCreatedTo(event.target.value)}
                aria-label="Audit report: last created date"
              />
            </label>
            <ReportDownload
              label="Download audit report"
              buildPath={(format) => {
                const query = new URLSearchParams({ format });
                if (filter !== "All") query.set("status", backendStatus(filter));
                if (createdFrom) query.set("createdFrom", createdFrom);
                if (createdTo) query.set("createdTo", createdTo);
                return `/admin/assistance-requests/export?${query.toString()}`;
              }}
              fallbackName={(format) => `assistance-audit-report.${format}`}
              validate={() =>
                createdFrom && createdTo && createdFrom > createdTo
                  ? "“Report from” must be on or before “Report to”."
                  : null
              }
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="border-b border-brand-purple/10 bg-brand-purple/5 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="p-4">Requester</th>
                <th className="p-4">Event</th>
                <th className="p-4">Support needs</th>
                <th className="p-4">Level</th>
                <th className="p-4">Assigned staff</th>
                <th className="p-4">Status</th>
                <th className="p-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((request) => {
                const event = events.find((item) => item.id === request.eventId);
                return (
                  <tr
                    key={request.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open assistance request from ${request.requesterUsername}`}
                    onClick={() => setSelectedId(request.id)}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                        keyEvent.preventDefault();
                        setSelectedId(request.id);
                      }
                    }}
                    className="cursor-pointer border-b border-line transition last:border-0 hover:bg-accent-soft/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-accent/20"
                  >
                    <td className="p-4 font-medium">{request.requesterUsername}</td>
                    <td className="p-4">{event?.title ?? "Event unavailable"}</td>
                    <td className="max-w-xs truncate p-4 text-muted">{request.supportNeeds}</td>
                    <td className="p-4">{request.level}</td>
                    <td className="p-4 text-muted">{request.assignedStaff ?? "Not assigned yet"}</td>
                    <td className="p-4"><Badge tone={statusTone[request.status]}>{request.status}</Badge></td>
                    <td className="p-4 text-muted">
                      {new Date(request.createdAt).toLocaleDateString("en-SG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line p-4">
          <span className="text-sm text-muted">
            {filtered.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
              aria-label="Previous assistance requests page"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="min-w-16 text-center text-sm font-medium">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Next assistance requests page"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {selected && (
        <RequestPanel
          request={selected}
          eventName={events.find((event) => event.id === selected.eventId)?.title ?? "Event unavailable"}
          onClose={() => setSelectedId(null)}
          onSave={(assignedStaff, status) => {
            updateAssistanceRequest(selected.id, { assignedStaff, status });
            setSelectedId(null);
          }}
        />
      )}
    </>
  );
}

function RequestPanel({
  request,
  eventName,
  onClose,
  onSave,
}: {
  request: AssistanceRequest;
  eventName: string;
  onClose: () => void;
  onSave: (staff: string | undefined, status: AssistanceStatus) => void;
}) {
  const options = nextSteps[request.status] ?? [];
  const readOnly = options.length === 0;
  const [staff, setStaff] = useState(request.assignedStaff ?? "");
  const [status, setStatus] = useState<AssistanceStatus | "">(options[0] ?? "");
  const [error, setError] = useState("");

  const save = () => {
    if (!status) return;
    if (status === "Assigned" && !staff.trim()) {
      setError("Enter a staff name before assigning this request.");
      return;
    }
    onSave(staff.trim() || request.assignedStaff, status);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-ink/35 backdrop-blur-sm" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="queue-panel-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto bg-paper p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone={statusTone[request.status]}>{request.status}</Badge>
            <h2 id="queue-panel-title" className="mt-3 font-brand text-3xl font-bold text-brand-deep">
              Assistance request
            </h2>
            <p className="mt-1 text-sm text-muted">{request.requesterUsername} · {eventName}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close assistance request panel"
            className="h-9 w-9 px-0 focus-visible:ring-4 focus-visible:ring-accent/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-7 space-y-5">
          <div className="rounded-2xl bg-mist/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Support needs</div>
            <p className="mt-2 text-sm leading-relaxed">{request.supportNeeds}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-muted">Assistance level</div><div className="mt-1 font-semibold">{request.level}</div></div>
            <div><div className="text-xs text-muted">Created</div><div className="mt-1 font-semibold">{new Date(request.createdAt).toLocaleDateString("en-SG")}</div></div>
          </div>

          <Field label="Staff name">
            <Input
              value={staff}
              disabled={readOnly}
              onChange={(event) => {
                setStaff(event.target.value);
                if (event.target.value.trim()) setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "staff-name-error" : undefined}
              placeholder="Enter assigned staff member"
            />
          </Field>
          {error && <p id="staff-name-error" role="alert" className="-mt-3 text-sm font-medium text-danger">{error}</p>}

          {readOnly ? (
            <div className="rounded-2xl border border-line p-4 text-sm text-muted">
              Completed and cancelled requests are read-only.
            </div>
          ) : (
            <Field label="Next status">
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as AssistanceStatus)}
                aria-label="Choose the next assistance request status"
              >
                {options.map((option) => <option key={option}>{option}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <div className="mt-auto flex gap-3 border-t border-line pt-6">
          {!readOnly && <Button onClick={save}>Save changes</Button>}
          <Button variant="outline" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
        </div>
      </aside>
    </div>
  );
}
