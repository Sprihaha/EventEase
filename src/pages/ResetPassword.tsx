import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound, XCircle } from "lucide-react";
import { Button, Card, Field, Input } from "../components/ui";
import { ApiError, backendResetPassword } from "../lib/backendApi";
import { PASSWORD_RULES, isStrongPassword } from "../lib/passwordRules";
import { useStore } from "../lib/store";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Kept in state so it can be removed from the address bar and browser history.
  const [token] = useState(() => params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<"form" | "invalid">(token ? "form" : "invalid");
  const { startSession, user, sessionLoading } = useStore();

  useEffect(() => {
    if (params.has("token")) navigate("/reset-password", { replace: true });
  }, [params, navigate]);

  // Once signed in (including straight after a successful reset) this page is never shown
  // again: Back or a reopened link goes to the dashboard and this entry leaves history.
  useEffect(() => {
    if (!sessionLoading && user) navigate(`/dashboard/${user.role}`, { replace: true });
  }, [sessionLoading, user, navigate]);

  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isStrongPassword(password) || password !== confirm) return;
    setSaving(true);
    setError("");
    try {
      const account = await startSession(await backendResetPassword(token, password));
      // Replace this page in history so Back never returns to the now-used link.
      navigate(`/dashboard/${account.role}`, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "RESET_TOKEN_INVALID") {
        setState("invalid");
      } else {
        setError(err instanceof Error ? err.message : "Could not update your password. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const requestNewLink = () => navigate("/login", { state: { mode: "forgot" } });

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg items-center px-5 py-16">
      <Card className="w-full p-8 sm:p-10">
        {state === "invalid" ? (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger ring-8 ring-danger/5">
              <XCircle className="h-10 w-10" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Link unavailable</h1>
            <p className="mt-3 text-sm text-brand-ink/70">
              This reset link is invalid, has already been used, or has expired. Links last 30 minutes.
            </p>
            <Button className="mt-8 w-full" onClick={requestNewLink}>Request a new link</Button>
            <Button className="mt-3 w-full" variant="outline" onClick={() => navigate("/login")}>Return to sign in</Button>
          </div>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="mt-5 font-brand text-3xl font-bold tracking-tight text-brand-deep">Choose a new password</h1>
            <p className="mt-2 text-sm text-muted">
              You'll be signed in here and signed out on every other device.
            </p>
            <form className="mt-7 space-y-5" onSubmit={submit}>
              <Field label="New password">
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-12"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="absolute right-1 top-1 h-9 w-9 px-0 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </Field>
              <ul className="grid gap-1.5 text-xs sm:grid-cols-2" aria-label="Password requirements">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(password);
                  return (
                    <li key={rule.label} className={`flex items-center gap-1.5 ${met ? "text-live" : "text-muted"}`}>
                      {met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
              <Field label="Confirm new password">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </Field>
              {mismatch && <p className="text-xs font-medium text-danger">The passwords don't match.</p>}
              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-danger/10 p-3.5 text-sm font-medium text-danger">
                  {error}
                </div>
              )}
              <Button
                className="w-full"
                size="lg"
                type="submit"
                disabled={saving || !isStrongPassword(password) || password !== confirm}
              >
                {saving ? "Updating and signing you in…" : "Update password"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
