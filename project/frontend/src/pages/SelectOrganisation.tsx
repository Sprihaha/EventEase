import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Building2, CheckCircle2, Clock3, Plus } from "lucide-react";
import { Badge, Button, Card, Field, Input, Select } from "../components/ui";
import { useStore } from "../lib/store";
import {
  OTHERS,
  fetchMyOrganisations,
  fetchOrganisations,
  getCurrentOrganisation,
  requestOrganisation,
  setCurrentOrganisation,
  type Membership,
  type Organisation,
} from "../lib/organisation";

// After an organiser signs in (or clicks their organisation in the header): pick an approved
// organisation, or ask to add another one, which an administrator must approve.
export default function SelectOrganisation() {
  const { user, sessionLoading } = useStore();
  const current = getCurrentOrganisation();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [listed, setListed] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  const [otherName, setOtherName] = useState("");
  const [organisationEmail, setOrganisationEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, all] = await Promise.all([fetchMyOrganisations(), fetchOrganisations()]);
      setMemberships(mine);
      setListed(all);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your organisations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "organizer") void load();
  }, [user?.role, load]);

  if (sessionLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "organizer") return <Navigate to={`/dashboard/${user.role}`} replace />;

  const approved = memberships.filter((m) => m.status === "APPROVED" && m.organisationId);
  const pending = memberships.filter((m) => m.status === "PENDING");
  const chosenOrganisation = listed.find((o) => o.id === choice) ?? null;
  const chosenMembership = chosenOrganisation
    ? memberships.find((m) => m.organisationId === chosenOrganisation.id && m.status !== "REJECTED")
    : undefined;

  const select = (organisation: Organisation) => {
    setCurrentOrganisation(organisation);
    // A full load: the dashboard's events depend on the chosen organisation.
    window.location.replace("/dashboard/organizer");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = choice === OTHERS ? otherName.trim() : chosenOrganisation?.name ?? "";
    setSubmitting(true);
    setError("");
    try {
      await requestOrganisation(name, organisationEmail.trim());
      setSubmitted(name);
      setChoice("");
      setOtherName("");
      setOrganisationEmail("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center px-5 py-16">
      <Card className="w-full p-8 sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-brand text-3xl font-bold tracking-tight text-brand-deep">
          {current ? "Switch organisation" : "Select your organisation"}
        </h1>
        <p className="mt-2 text-sm text-muted">Choose the organisation you're working for in this session.</p>

        {loading ? (
          <p className="mt-8 text-sm text-muted" role="status">Loading your organisations…</p>
        ) : (
          <>
            {approved.length ? (
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {approved.map((m) => {
                  const organisation = { id: m.organisationId as string, name: m.organisationName };
                  const isCurrent = current?.id === organisation.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => select(organisation)}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition hover:border-brand-orange focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30 ${
                        isCurrent ? "border-brand-orange bg-brand-orange/5" : "border-brand-purple/15"
                      }`}
                    >
                      <span className="font-semibold text-brand-deep">{m.organisationName}</span>
                      {isCurrent && <Badge tone="live">Current</Badge>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div role="alert" className="mt-7 rounded-xl border border-brand-orange/30 bg-brand-orange/10 p-4 text-sm text-brand-deep">
                {pending.length
                  ? "Your organisation is waiting for admin approval. You can use the organiser dashboard once it's approved."
                  : "Which organisation do you work for? Choose it below. You can use the organiser dashboard once an administrator approves it."}
              </div>
            )}

            {pending.length > 0 && (
              <ul className="mt-5 space-y-2 text-sm">
                {pending.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-muted">
                    <Clock3 className="h-4 w-4 text-warn" />
                    <span><strong className="text-brand-deep">{m.organisationName}</strong> is waiting for admin approval.</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-8 border-t border-brand-purple/10 pt-6">
              <h2 className="flex items-center gap-2 font-brand text-lg font-bold text-brand-deep">
                <Plus className="h-4 w-4 text-brand-orange" /> {approved.length ? "Select another organisation" : "Your organisation"}
              </h2>
              <div className="mt-3">
                <Select
                  value={choice}
                  onChange={(e) => { setChoice(e.target.value); setSubmitted(null); setError(""); }}
                  placeholder="Choose an organisation"
                >
                  <option value="" disabled>Choose an organisation</option>
                  {listed.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  <option value={OTHERS}>Others</option>
                </Select>
              </div>

              {submitted && (
                <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-live/10 p-3 text-sm font-medium text-brand-deep">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-live" />
                  Your request has been submitted. An administrator will review adding {submitted}, and we'll e-mail you once it's decided.
                </p>
              )}

              {chosenMembership?.status === "APPROVED" && chosenOrganisation && (
                <Button className="mt-4" onClick={() => select(chosenOrganisation)}>Continue with {chosenOrganisation.name}</Button>
              )}
              {chosenMembership?.status === "PENDING" && (
                <p className="mt-4 text-sm text-muted">Your request for {chosenOrganisation?.name} is already waiting for approval.</p>
              )}

              {(choice === OTHERS || (chosenOrganisation && !chosenMembership)) && (
                <form className="mt-5 space-y-4 rounded-2xl border border-brand-purple/15 p-5" onSubmit={submit}>
                  <p className="font-semibold text-brand-deep">Add this as your organisation</p>
                  {choice === OTHERS && (
                    <Field label="Organisation name">
                      <Input value={otherName} onChange={(e) => setOtherName(e.target.value)} minLength={2} maxLength={200} required />
                    </Field>
                  )}
                  <Field label="Organisation email">
                    <Input type="email" value={organisationEmail} onChange={(e) => setOrganisationEmail(e.target.value)} required />
                  </Field>
                  <p className="text-xs text-muted">An administrator approves new organisations on your account.</p>
                  <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit request"}</Button>
                </form>
              )}
            </div>
          </>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">{error}</p>}
      </Card>
    </div>
  );
}
