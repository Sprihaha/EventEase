import { useEffect, useReducer, useRef, useState } from "react";
import { getDemoResetTarget, resetDemoData, type DemoResetTarget } from "../../lib/backendApi";
import { canConfirmReset, emptyResetConfirmation, resetConfirmationReducer, RESET_CONFIRMATION } from "../../lib/resetConfirmation";
import { useStore } from "../../lib/store";
import { Button, Card, Field, Input } from "../ui";

export default function ResetDemoData() {
  const { user } = useStore();
  // Unmount every sensitive field when authentication or identity changes.
  return user?.role === "admin" ? <AdminResetControls key={user.id} username={user.name} /> : null;
}

function AdminResetControls({ username }: { username: string }) {
  const [opened, setOpened] = useState(false);
  const [form, dispatch] = useReducer(resetConfirmationReducer, undefined, emptyResetConfirmation);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [target, setTarget] = useState<DemoResetTarget | null>(null);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setTarget(null); setLoadingTarget(true); setError("");
    getDemoResetTarget(controller.signal).then(result => {
      if (!controller.signal.aborted) setTarget(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not verify database target.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingTarget(false);
    });
    return () => controller.abort();
  }, [opened, revision]);

  const valid = canConfirmReset(form, username, !!target?.enabled && !loadingTarget);
  const close = () => {
    setOpened(false); dispatch({ type: "clear" }); setTarget(null); setError("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !target || submitting.current) return;
    submitting.current = true;
    setPending(true); setError("");
    try {
      await resetDemoData({ confirmation: form.phrase, username: form.username, password: form.password,
        acknowledged: form.acknowledged, targetId: target.targetId });
      setDone(true); close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reset failed. No success was confirmed.");
    } finally {
      submitting.current = false;
      setPending(false); dispatch({ type: "clear" });
    }
  };

  return <Card className="p-6">
    <h2 className="font-brand text-xl font-bold">Reset Demo Data</h2>
    <p className="mt-2 text-sm text-muted">
      Permanently clear all events, bookings, payments, tickets, exchanges, assistance requests,
      event sources, fraud signals and application audit logs on the connected backend.
      User accounts, credentials, roles, user IDs, authentication records, narration and accessibility preferences are preserved.
      This cannot be undone.
    </p>
    <p className="mt-2 text-sm text-muted">Disabled by default. Production and other nonlocal database targets require a second explicit backend override.</p>
    {done ? <div role="status" className="mt-4">
      <p>Application data cleared. User accounts were preserved. Reload to refresh dashboard data.</p>
      <Button className="mt-3" onClick={() => window.location.reload()}>Reload dashboard</Button>
    </div> : <Button className="mt-4" variant="danger" onClick={() => setOpened(true)}>Reset Demo Data…</Button>}
    {opened && <form onSubmit={event => void submit(event)} className="mt-5 space-y-4 border-t border-line pt-5" aria-label="Confirm demo data reset">
      <h3 className="font-semibold">Configured database target</h3>
      {loadingTarget && <p role="status">Verifying database target…</p>}
      {target && <>
        <dl className="grid gap-2 text-sm">
          <div><dt>Environment</dt><dd>{target.environment}</dd></div>
          <div><dt>Database host</dt><dd>{target.databaseHost}{target.databasePort ? `:${target.databasePort}` : ""}</dd></div>
          <div><dt>Database name</dt><dd>{target.databaseName}</dd></div>
          <div><dt>Schema</dt><dd>{target.databaseSchema}</dd></div>
        </dl>
        {target.requiresProductionOverride && <p role="alert" className="rounded-xl border border-danger bg-danger/10 p-4 font-bold text-danger">
          WARNING: This will permanently clear application data from the configured {target.environment === "production" ? "production" : "nonlocal"} database.
        </p>}
        {!target.enabled && <p role="status" className="text-danger">Reset is disabled by the backend safety gates.</p>}
      </>}
      {!loadingTarget && !target && <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Retry target verification</Button>}
      <p className="font-semibold text-danger">Confirm permanent deletion of all application data.</p>
      <Field label={`Type ${RESET_CONFIRMATION}`}>
        <Input value={form.phrase} onChange={event => dispatch({ type: "edit", field: "phrase", value: event.target.value })} disabled={pending || !target?.enabled} autoComplete="off" required />
      </Field>
      <Field label="Your administrator username">
        <Input value={form.username} onChange={event => dispatch({ type: "edit", field: "username", value: event.target.value })} disabled={pending || !target?.enabled} autoComplete="username" required />
      </Field>
      <Field label="Confirm your current administrator password">
        <Input type="password" value={form.password} onChange={event => dispatch({ type: "edit", field: "password", value: event.target.value })} disabled={pending || !target?.enabled} autoComplete="current-password" required />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={form.acknowledged} onChange={event => dispatch({ type: "acknowledge", value: event.target.checked })} disabled={pending || !target?.enabled} required />
        I understand this permanently deletes application data from the database shown above, including data created by other users.
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={close} disabled={pending}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={!valid || pending}>{pending ? "Resetting…" : "Permanently delete application data"}</Button>
      </div>
    </form>}
  </Card>;
}
