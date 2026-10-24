import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Mail, X } from "lucide-react";
import { Badge, Button, Card, Input, cx } from "./ui";
import {
  decideOrganiserRequest,
  fetchOrganiserRequests,
  type OrganiserRequest,
  type OrganiserRequestStatus,
} from "../lib/backendApi";

const FILTERS: { id: OrganiserRequestStatus | "ALL"; label: string }[] = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All" },
];

const STATUS_TONE: Record<OrganiserRequestStatus, "warn" | "live" | "danger"> = {
  PENDING: "warn",
  APPROVED: "live",
  REJECTED: "danger",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Admin review of organiser sign-up requests. `onChanged` lets the dashboard refresh its pending badge.
export default function OrganiserRequests({ onChanged }: { onChanged?: () => void }) {
  const [filter, setFilter] = useState<OrganiserRequestStatus | "ALL">("PENDING");
  const [requests, setRequests] = useState<OrganiserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRequests(await fetchOrganiserRequests(filter === "ALL" ? undefined : filter));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load organiser requests.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, approve: boolean, reason?: string) => {
    setBusyId(id);
    setError("");
    try {
      await decideOrganiserRequest(id, approve, reason);
      setRejecting(null);
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the decision.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-brand text-2xl font-bold text-brand-deep">Organiser requests</h2>
          <p className="text-sm text-muted">New organisers can sign in only after you approve them.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-brand-purple/15 bg-white p-1" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx(
                "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition",
                filter === f.id ? "bg-brand-deep text-white" : "text-muted hover:text-brand-deep",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-danger/10 p-3.5 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted">Loading organiser requests…</Card>
      ) : requests.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {filter === "PENDING" ? "No organiser requests are waiting for review." : "No organiser requests here yet."}
        </Card>
      ) : (
        requests.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-brand text-lg font-bold text-brand-deep">{r.username}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status.toLowerCase()}</Badge>
                  <Badge tone={r.emailVerified ? "live" : "warn"}>
                    {r.emailVerified ? "email verified" : "email not verified"}
                  </Badge>
                </div>
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <Mail className="h-3.5 w-3.5" /> {r.emailMasked ?? "—"} · {r.phoneMasked ?? "—"}
                </p>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-deep">
                  <Building2 className="h-4 w-4 text-brand-purple" /> {r.organisationName}
                  <span className="font-normal text-muted">· {r.organisationEmail}</span>
                </p>
                {r.sameOrganisationRequests > 0 && (
                  <p className="text-xs text-muted">
                    {r.sameOrganisationRequests} other {r.sameOrganisationRequests === 1 ? "request" : "requests"} under
                    this organisation.
                  </p>
                )}
                <p className="text-xs text-muted">Submitted {formatDate(r.submittedAt)}</p>
                {r.reviewedAt && (
                  <p className="text-xs text-muted">
                    {r.status === "APPROVED" ? "Approved" : "Rejected"} by {r.reviewedBy ?? "an administrator"} on{" "}
                    {formatDate(r.reviewedAt)}
                    {r.reviewNote ? ` — “${r.reviewNote}”` : ""}
                  </p>
                )}
              </div>

              {r.status === "PENDING" && (
                <div className="flex flex-col items-end gap-2">
                  {rejecting?.id === r.id ? (
                    <div className="w-72 space-y-2">
                      <Input
                        placeholder="Reason (optional, emailed to the applicant)"
                        value={rejecting.reason}
                        maxLength={1000}
                        onChange={(e) => setRejecting({ id: r.id, reason: e.target.value })}
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(null)} disabled={busyId === r.id}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === r.id}
                          onClick={() => void decide(r.id, false, rejecting.reason.trim())}
                        >
                          Confirm reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busyId === r.id} onClick={() => void decide(r.id, true)}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => setRejecting({ id: r.id, reason: "" })}
                      >
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
