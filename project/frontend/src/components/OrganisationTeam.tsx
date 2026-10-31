import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "./ui";
import { fmtDate } from "../lib/store";
import {
  createOrganisationMember,
  fetchOrganisationMembers,
  type OrganisationMembers,
} from "../lib/organisation";

// The organisation manager creates member accounts here. They are approved at once, with no
// request to an administrator, and each member must set their own password at first sign-in.
export default function OrganisationTeam() {
  const [team, setTeam] = useState<OrganisationMembers | null>(null);
  const [loadError, setLoadError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTeam(await fetchOrganisationMembers());
      setLoadError("");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load your team.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setCreated(null);
    try {
      const member = await createOrganisationMember(username.trim(), email.trim(), password);
      setCreated(member.username);
      setUsername("");
      setEmail("");
      setPassword("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="p-5">
        <h2 className="font-brand text-xl font-bold text-brand-deep">{team?.organisationName ?? "Your"} team</h2>
        <p className="mt-1 text-sm text-muted">Everyone here manages this organisation's events.</p>
        {loadError && <p role="alert" className="mt-4 text-sm text-danger">{loadError}</p>}
        {!team && !loadError && <p role="status" className="mt-4 text-sm text-muted">Loading your team…</p>}
        <ul className="mt-4 divide-y divide-line">
          {team?.items.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <div className="font-semibold text-brand-deep">{member.username}</div>
                <div className="text-xs text-muted">{member.emailMasked} · added {fmtDate(member.addedAt)}</div>
              </div>
              <div className="flex gap-2">
                {member.isManager && <Badge tone="accent">Manager</Badge>}
                {member.mustChangePassword && <Badge tone="warn">Temporary password</Badge>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-brand text-xl font-bold text-brand-deep">
          <UserPlus className="h-5 w-5 text-brand-orange" /> Create an account
        </h2>
        <p className="mt-1 text-sm text-muted">
          No administrator approval is needed. Give the person their temporary password; they will be
          asked to set their own at first sign-in.
        </p>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={15} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Temporary password">
            <Input type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <p className="text-xs text-muted">
            At least 8 characters, with upper and lower case, a digit and a symbol.
          </p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {created && <p role="status" className="text-sm font-medium text-live">{created}'s account is ready.</p>}
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create account"}</Button>
        </form>
      </Card>
    </div>
  );
}
