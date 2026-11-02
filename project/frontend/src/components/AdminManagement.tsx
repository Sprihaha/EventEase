import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Shield, ShieldAlert, ShieldCheck, UserPlus } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "./ui";
import { useStore, fmtDate } from "../lib/store";
import {
  fetchAdministrators,
  createAdministrator,
  type AdminAccount,
} from "../lib/backendApi";

export default function AdminManagement() {
  const { user } = useStore();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  const isSystemAdmin = user?.name?.toLowerCase() === "system_admin";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAdministrators();
      setAdmins(data);
      setLoadError("");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load administrator accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!isSystemAdmin) {
      setError("Only the default system administrator (system_admin) can create administrator accounts.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess(null);
    try {
      const created = await createAdministrator({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
      });
      setSuccess(`Administrator account "${created.username}" created successfully.`);
      setUsername("");
      setEmail("");
      setPassword("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create administrator account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* Admin List */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-brand-teal" />
          <h2 className="font-brand text-xl font-bold text-brand-deep">Administrator Accounts</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          All accounts with full platform management and administrative privileges.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {loadError}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-muted">Loading administrators...</p>
        ) : (
          <div className="mt-6 divide-y divide-border">
            {admins.map((adm) => {
              const isDefault = adm.username.toLowerCase() === "system_admin";
              return (
                <div key={adm.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-sand font-bold text-brand-deep text-xs">
                      {adm.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-brand-deep">{adm.username}</span>
                        {isDefault && (
                          <Badge tone="live">
                            Default Superadmin
                          </Badge>
                        )}
                        <Badge>{adm.status}</Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {adm.emailMasked ?? "No email"} &middot; Created {fmtDate(adm.createdAt)}
                      </p>
                    </div>
                  </div>
                  {isDefault && (
                    <span className="text-xs font-medium text-brand-teal flex items-center gap-1">
                      <ShieldCheck className="h-4 w-4" /> Root Authority
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Admin Creation Form or Permission Notice */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-brand-teal" />
          <h2 className="font-brand text-xl font-bold text-brand-deep">Create Administrator</h2>
        </div>

        {isSystemAdmin ? (
          <>
            <p className="mt-1 text-sm text-muted">
              As <strong className="text-brand-deep">system_admin</strong>, you have exclusive permissions to provision new administrator accounts.
            </p>

            {success && (
              <div className="mt-4 rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                {success}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <Field label="Username">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. ops_lead"
                  required
                  maxLength={15}
                  pattern="[A-Za-z0-8_]+"
                  title="Letters, digits 0-8 and underscores (max 15 chars)"
                />
              </Field>

              <Field label="Email address (optional)">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@eventease.com"
                />
              </Field>

              <Field label="Temporary Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 chars with upper, lower, digit & symbol"
                  required
                />
              </Field>

              <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                {submitting ? "Creating..." : "Create Administrator"}
              </Button>
            </form>
          </>
        ) : (
          <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Creation Restricted</p>
                <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                  Only the default root account (<strong className="font-mono">system_admin</strong>) has permissions to provision new administrator accounts.
                </p>
                <p className="mt-2 text-xs text-muted">
                  Logged in as: <span className="font-semibold text-brand-deep">{user?.name ?? "Unknown"}</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
