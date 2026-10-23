import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound, LockKeyhole, ShieldAlert } from "lucide-react";
import { Button, Card, Field, Input } from "../components/ui";
import { ApiError, backendChangePassword } from "../lib/backendApi";
import { PASSWORD_RULES, isStrongPassword } from "../lib/passwordRules";
import { useStore } from "../lib/store";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, sessionLoading, startSession, logout } = useStore();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<"form" | "done" | "lockedOut">("form");

  if (sessionLoading) return null;
  if (!user && state !== "lockedOut") return <Navigate to="/login" replace />;

  const dashboard = user ? `/dashboard/${user.role}` : "/login";
  const forced = !!user?.mustChangePassword;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isStrongPassword(password) || password !== confirm) return;
    setSaving(true);
    setError("");
    try {
      await startSession(await backendChangePassword(current, password));
      setState("done");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "ACCOUNT_LOCKED") {
        // The backend has signed this account out everywhere.
        setState("lockedOut");
        logout();
        return;
      }
      if (err instanceof ApiError && err.code === "INVALID_CURRENT_PASSWORD") {
        const left = Number(err.details.attemptsRemaining);
        setError(`Current password is incorrect. ${left} ${left === 1 ? "attempt" : "attempts"} remaining.`);
      } else if (err instanceof ApiError && err.code === "PASSWORD_REUSED") {
        setError("New password must be different from your current one.");
      } else if (err instanceof ApiError && err.code === "ACCOUNT_PROTECTED") {
        setError("This account's password can't be changed.");
      } else {
        const msg = err instanceof Error ? err.message : "";
        setError(msg ? `${msg[0].toUpperCase()}${msg.slice(1)}.` : "Could not change your password. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg items-center px-5 py-16">
      <Card className="w-full p-8 sm:p-10">
        {state === "lockedOut" ? (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger ring-8 ring-danger/5">
              <LockKeyhole className="h-9 w-9" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Account locked</h1>
            <p className="mt-3 text-sm text-brand-ink/70">
              Too many wrong current passwords. For your security you've been signed out, and the account is locked
              for 15 minutes. You can also use "Forgot password?" on the sign-in page.
            </p>
            <Button className="mt-8 w-full" onClick={() => navigate("/login", { replace: true })}>Go to sign in</Button>
          </div>
        ) : state === "done" ? (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-live/10 text-live ring-8 ring-live/5">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Password changed</h1>
            <p className="mt-3 text-sm text-brand-ink/70">
              You're still signed in here, and you've been signed out on your other devices.
            </p>
            <Button className="mt-8 w-full" onClick={() => navigate(dashboard, { replace: true })}>Go to dashboard</Button>
          </div>
        ) : user?.canChangePassword === false ? (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-orange/10 text-brand-orange ring-8 ring-brand-orange/5">
              <ShieldAlert className="h-9 w-9" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Not available</h1>
            <p className="mt-3 text-sm text-brand-ink/70">This account's password can't be changed.</p>
            <Button className="mt-8 w-full" onClick={() => navigate(dashboard, { replace: true })}>Go to dashboard</Button>
          </div>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="mt-5 font-brand text-3xl font-bold tracking-tight text-brand-deep">
              {forced ? "Set a new password to continue" : "Change password"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {forced
                ? "Your account needs a new password before you can use EventEase."
                : "You'll stay signed in here and be signed out on your other devices."}
            </p>
            <form className="mt-7 space-y-5" onSubmit={submit}>
              <Field label="Current password">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </Field>
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
                    aria-label={showPassword ? "Hide passwords" : "Show passwords"}
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
              {mismatch && <p className="text-xs font-medium text-danger">The new passwords don't match.</p>}
              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-danger/10 p-3.5 text-sm font-medium text-danger">
                  {error}
                </div>
              )}
              <Button
                className="w-full"
                size="lg"
                type="submit"
                disabled={saving || !current || !isStrongPassword(password) || password !== confirm}
              >
                {saving ? "Changing password…" : "Change password"}
              </Button>
              {!forced && (
                <Button className="w-full" variant="ghost" type="button" onClick={() => navigate(dashboard)}>
                  Cancel
                </Button>
              )}
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
