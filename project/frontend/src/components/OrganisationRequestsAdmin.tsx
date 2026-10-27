import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Mail, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, Input, cx } from "./ui";
import { fmtDate } from "../lib/store";
import {
  decideOrganisationRequest,
  fetchOrganisationRequests,
  type AdminOrganisationRequest,
  type MembershipStatus,
} from "../lib/organisation";

const FILTERS: { id: MembershipStatus | "ALL"; label: string }[] = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All" },
];

const TONE: Record<MembershipStatus, "warn" | "live" | "danger"> = { PENDING: "warn", APPROVED: "live", REJECTED: "danger" };

// Admin review of organisers asking to add an organisation to their account.
// (Organisations chosen at sign-up are reviewed with the organiser request instead.)
export default function OrganisationRequestsAdmin({ onChanged }: { onChanged?: () => void }) {
  const [filter, setFilter] = useState<MembershipStatus | "ALL">("PENDING");
  const [requests, setRequests] = useState<AdminOrganisationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRequests(await fetchOrganisationRequests(filter === "ALL" ? undefined : filter));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load organisation requests.");
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
      await decideOrganisationRequest(id, approve, reason);
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
          <h2 className="font-brand text-2xl font-bold text-brand-deep">Organisation requests</h2>
          <p className="text-sm text-muted">Organisers asking to add an organisation to their account. New organisations are added to the list when approved.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-brand-purple/15 bg-white p-1" role="tablist">
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
        <Card className="p-8 text-center text-sm text-muted">Loading organisation requests…</Card>
      ) : requests.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {filter === "PENDING" ? "No organisation requests are waiting for review." : "No organisation requests here yet."}
        </Card>
      ) : (
        requests.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 font-brand text-lg font-bold text-brand-deep">
                    <Building2 className="h-4 w-4 text-brand-purple" /> {r.organisationName}
                  </span>
                  <Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge>
                  {r.newOrganisation && (
                    <Badge tone="accent"><Sparkles className="h-3 w-3" /> new organisation</Badge>
                  )}
                </div>
                <p className="text-sm text-muted">Organisation email: <span className="text-brand-deep">{r.organisationEmail}</span></p>
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <Mail className="h-3.5 w-3.5" /> {r.username} · {r.emailMasked ?? "—"}
                </p>
                <p className="text-xs text-muted">Submitted {fmtDate(r.submittedAt)}</p>
                {r.reviewedAt && (
                  <p className="text-xs text-muted">
                    {r.status === "APPROVED" ? "Approved" : "Rejected"} by {r.reviewedBy ?? "an administrator"} on{" "}
                    {fmtDate(r.reviewedAt)}
                    {r.reviewNote ? ` — “${r.reviewNote}”` : ""}
                  </p>
                )}
              </div>

              {r.status === "PENDING" && (
                <div className="flex flex-col items-end gap-2">
                  {rejecting?.id === r.id ? (
                    <div className="w-72 space-y-2">
                      <Input
                        placeholder="Reason (optional, emailed to the organiser)"
                        value={rejecting.reason}
                        maxLength={1000}
                        onChange={(e) => setRejecting({ id: r.id, reason: e.target.value })}
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(null)} disabled={busyId === r.id}>
                          Cancel
                        </Button>
                        <Button size="sm" variant="danger" disabled={busyId === r.id}
                          onClick={() => void decide(r.id, false, rejecting.reason.trim())}>
                          Confirm reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busyId === r.id} onClick={() => void decide(r.id, true)}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === r.id}
                        onClick={() => setRejecting({ id: r.id, reason: "" })}>
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
