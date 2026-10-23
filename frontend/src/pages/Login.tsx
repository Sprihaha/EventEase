import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Ticket,
  UserPlus,
} from "lucide-react";
import { useStore } from "../lib/store";
import { ApiError, backendForgotPassword, backendResendVerification, backendSignup } from "../lib/backendApi";
import { Badge, Button, Card, Field, Input } from "../components/ui";

type SignUp = {
  userId: string;
  password: string;
  email: string;
  phone: string;
  billingAddress: string;
};

const emptySignUp: SignUp = {
  userId: "",
  password: "",
  email: "",
  phone: "",
  billingAddress: "",
};

// Messages for the forgot-password errors returned by the backend.
const FORGOT_ERRORS: Record<string, string> = {
  USER_NOT_FOUND: "User not found.",
  INVALID_EMAIL: "Invalid email address.",
  TOO_MANY_RESET_REQUESTS: "Too many attempts, please try again tomorrow.",
  RESET_NOT_AVAILABLE: "Password reset by email isn't available for this account.",
  ACCOUNT_SUSPENDED: "This account is suspended.",
};

export default function Login() {
  const { authenticate, user, sessionLoading } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { returnTo?: string; mode?: "forgot" } | null;
  const returnTo = navState?.returnTo;
  const [mode, setMode] = useState<"signin" | "signup" | "sent" | "forgot" | "forgotSent">(
    navState?.mode === "forgot" ? "forgot" : "signin",
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [mode]);

  // Signed-in users never see this page (e.g. pressing Back after a password reset):
  // send them to their dashboard and drop this page from history.
  useEffect(() => {
    if (!sessionLoading && user) {
      navigate(user.role === "customer" && returnTo ? returnTo : `/dashboard/${user.role}`, { replace: true });
    }
  }, [sessionLoading, user, returnTo, navigate]);

  // The old preview sign-up kept plain-text passwords in localStorage, and an older
  // per-tab attempt counter lived in sessionStorage; remove any leftovers.
  useEffect(() => {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("eventease-pending-") || key.startsWith("eventease-user-"))
        .forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem("eventease-login-attempts");
      sessionStorage.removeItem("eventease-login-locked");
    } catch {
      // Storage unavailable (private mode); nothing to clean up.
    }
  }, []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signUp, setSignUp] = useState<SignUp>(emptySignUp);
  const [signingUp, setSigningUp] = useState(false);
  const [signUpError, setSignUpError] = useState("");
  // Set when the account exists but its email has not been verified yet.
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  // Set when sign-in used a username or email that has no account.
  const [signUpPrompt, setSignUpPrompt] = useState<{ username?: string; email?: string } | null>(null);
  const [fromUnknownLogin, setFromUnknownLogin] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  const openForgot = () => {
    setForgotUsername(username);
    setError("");
    setMode("forgot");
  };

  const handleForgot = async (event: FormEvent) => {
    event.preventDefault();
    setForgotSending(true);
    setError("");
    try {
      await backendForgotPassword(forgotUsername.trim(), forgotEmail.trim());
      setMode("forgotSent");
    } catch (err: unknown) {
      if (err instanceof ApiError && FORGOT_ERRORS[err.code]) {
        setError(FORGOT_ERRORS[err.code]);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not send the reset link. Please try again.");
    } finally {
      setForgotSending(false);
    }
  };

  const resendLink = async (identifier: string) => {
    setResendState("sending");
    try {
      await backendResendVerification(identifier);
    } finally {
      setResendState("sent");
    }
  };

  const passwordHint = useMemo(() => {
    if (!signUp.password) return "";
    return signUp.password.length >= 8 ? "Password strength: ready" : "Use at least 8 characters";
  }, [signUp.password]);

  const goToSignUp = (prefill: { username?: string; email?: string }) => {
    setSignUp((current) => ({
      ...current,
      userId: prefill.username ?? current.userId,
      email: prefill.email ?? current.email,
    }));
    setSignUpPrompt(null);
    setFromUnknownLogin(true);
    setError("");
    setMode("signup");
  };

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setSignUpPrompt(null);
    setError("");
    setSigningIn(true);
    try {
      const account = await authenticate(username, password);
      setSigningIn(false);
      if (account) {
        navigate(account.role === "customer" && returnTo ? returnTo : `/dashboard/${account.role}`, { replace: true });
        return;
      }
    } catch (err: unknown) {
      setSigningIn(false);
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        // The password was right, so this is not a failed attempt.
        setUnverified(true);
        setResendState("idle");
        setError(`Please verify your email before signing in. Open the link we sent to ${err.details.email ?? "your email"}.`);
        return;
      }
      setUnverified(false);
      if (err instanceof ApiError && err.code === "SIGNUP_REQUIRED") {
        // Unknown username or email: not a sign-in attempt, so nothing is counted.
        setError("");
        setSignUpPrompt((err.details.prefill as { username?: string; email?: string } | undefined) ?? {});
        return;
      }
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed") ||
        msg.includes("404")
      ) {
        setError("Cannot reach the backend service. Ensure the FastAPI backend is running at http://localhost:8000.");
        return;
      }
      const lockedMessage =
        "This account is locked after 5 unsuccessful attempts. Try again in 15 minutes, or use Forgot password? to reset it.";
      if (err instanceof ApiError && err.code === "ACCOUNT_LOCKED") {
        setError(lockedMessage);
        return;
      }
      // Attempts left are shown only after a wrong password for a registered account,
      // and come from that account's own counter on the backend.
      if (err instanceof ApiError && err.code === "INVALID_CREDENTIALS") {
        const left = Number(err.details.attemptsRemaining);
        setError(left > 0
          ? `Username or password doesn't match. ${left} ${left === 1 ? "attempt" : "attempts"} remaining.`
          : lockedMessage);
        return;
      }
      setError(msg ? `${msg[0].toUpperCase()}${msg.slice(1)}.` : "Sign-in failed. Please try again.");
    }
  };

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();
    setSigningUp(true);
    setSignUpError("");
    try {
      await backendSignup({
        username: signUp.userId,
        password: signUp.password,
        email: signUp.email,
        phone: signUp.phone,
      });
      setSignUp((current) => ({ ...current, password: "" }));
      setResendState("idle");
      setMode("sent");
    } catch (err: unknown) {
      setSignUpError(err instanceof Error ? err.message : "Sign-up failed. Please try again.");
    } finally {
      setSigningUp(false);
    }
  };

  const update = (key: keyof SignUp, value: string) =>
    setSignUp((current) => ({ ...current, [key]: value }));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-brand-warm px-5 py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2.5rem] border border-brand-purple/20 bg-white shadow-[0_30px_100px_-50px_rgba(50,19,79,0.35)] lg:grid-cols-[0.85fr_1.15fr]">
        <div className="relative hidden overflow-hidden bg-brand-deep p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-orange/25 blur-3xl" />
          <div className="absolute -left-20 bottom-10 h-64 w-64 rounded-full bg-brand-magenta/20 blur-3xl" />
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-orange shadow-[0_2px_10px_rgba(255,101,0,0.4)]">
              <Ticket className="h-5 w-5 text-white" />
            </div>
            <p className="mt-8 font-brand text-4xl font-bold leading-tight text-white">
              Your next great night starts here.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Sign in to choose seats, join EaseComms, and keep every verified ticket in one place.
            </p>
          </div>
          <div className="relative space-y-3 text-sm font-medium text-white/80">
            <p className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-brand-orange" /> Secure sign-in and verified tickets
            </p>
            <p className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-brand-orange" /> Transparent prices, always
            </p>
          </div>
        </div>

        <Card className="border-0 bg-white p-7 sm:p-12 shadow-none">
          {mode === "signin" && (
            <>
              <Badge tone="accent">
                <LockKeyhole className="h-3 w-3" /> Secure account access
              </Badge>
              <h1 className="mt-4 font-brand text-4xl font-bold tracking-tight text-brand-deep">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-muted">Enter your EventEase username and password.</p>

              <form className="mt-8 space-y-5" onSubmit={handleSignIn}>
                <Field label="Username">
                  <Input
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="e.g. Janice, John, or Jay"
                    required
                  />
                </Field>
                <Field label="Password">
                  <div className="relative">
                    <Input
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="pr-12"
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
                  <div className="mt-1.5 text-right">
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-semibold text-brand-purple underline-offset-2 hover:underline"
                      onClick={openForgot}
                    >
                      Forgot password?
                    </button>
                  </div>
                </Field>
                {error && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-danger/10 p-3.5 text-sm font-medium text-danger">
                    {error}
                    {unverified && (
                      <div className="mt-2">
                        {resendState === "sent" ? (
                          <span className="font-normal">A new verification link is on its way. Check your inbox and spam folder.</span>
                        ) : (
                          <button
                            type="button"
                            className="cursor-pointer font-semibold underline underline-offset-2"
                            disabled={resendState === "sending"}
                            onClick={() => void resendLink(username)}
                          >
                            {resendState === "sending" ? "Sending…" : "Resend verification link"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {signUpPrompt && (
                  <div role="alert" className="rounded-xl border border-brand-orange/30 bg-brand-orange/10 p-3.5 text-sm font-medium text-brand-deep">
                    <p>Sign up as new user.</p>
                    <p className="mt-0.5 font-normal text-muted">We couldn't find an EventEase account for that username or email.</p>
                    <Button className="mt-3" size="sm" type="button" onClick={() => goToSignUp(signUpPrompt)}>
                      <UserPlus className="h-4 w-4" /> Sign up
                    </Button>
                  </div>
                )}
                <Button className="w-full" size="lg" type="submit" disabled={signingIn}>
                  {signingIn ? "Connecting…" : "Sign in"} {!signingIn && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>

              <div className="mt-8 border-t border-brand-purple/10 pt-6 text-center">
                <p className="text-sm text-muted">New to EventEase?</p>
                <Button className="mt-3" variant="outline" onClick={() => { setMode("signup"); setError(""); }}>
                  <UserPlus className="h-4 w-4" /> Sign up as a new user
                </Button>
              </div>
            </>
          )}

          {mode === "signup" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setMode("signin"); setFromUnknownLogin(false); }} className="-ml-3">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Button>
              {fromUnknownLogin && (
                <p className="mt-4 font-brand text-lg font-bold text-brand-orange">New to EventEase? Sign up now</p>
              )}
              <h1 className="mt-4 font-brand text-4xl font-bold tracking-tight text-brand-deep">
                Create your account
              </h1>
              <p className="mt-2 text-sm text-muted">Join as a customer. Verify your email to finish.</p>
              <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={handleSignUp}>
                <Field label="User ID">
                  <Input value={signUp.userId} onChange={(e) => update("userId", e.target.value)} minLength={3} required />
                </Field>
                <Field label="Phone number">
                  <Input type="tel" value={signUp.phone} onChange={(e) => update("phone", e.target.value)} required />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Email address">
                    <Input type="email" value={signUp.email} onChange={(e) => update("email", e.target.value)} required />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Password">
                    <Input type="password" value={signUp.password} onChange={(e) => update("password", e.target.value)} minLength={8} required />
                  </Field>
                  {passwordHint && <p className="mt-1.5 text-xs text-muted">{passwordHint}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Field label="Billing address">
                    <Input value={signUp.billingAddress} onChange={(e) => update("billingAddress", e.target.value)} required />
                  </Field>
                </div>
                {signUpError && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-danger/10 p-3.5 text-sm font-medium text-danger sm:col-span-2">
                    {signUpError}
                  </div>
                )}
                <Button className="mt-2 w-full sm:col-span-2" size="lg" type="submit" disabled={signingUp}>
                  {signingUp ? "Creating your account…" : "Send verification link"} {!signingUp && <Mail className="h-4 w-4" />}
                </Button>
              </form>
            </>
          )}

          {mode === "forgot" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setMode("signin"); setError(""); }} className="-ml-3">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Button>
              <h1 className="mt-4 font-brand text-4xl font-bold tracking-tight text-brand-deep">
                Reset your password
              </h1>
              <p className="mt-2 text-sm text-muted">
                Enter your username and the verified email address on your account. We'll email you a link to
                choose a new password.
              </p>
              <form className="mt-8 space-y-5" onSubmit={handleForgot}>
                <Field label="Username">
                  <Input
                    autoComplete="username"
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Verified email address">
                  <Input
                    type="email"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </Field>
                {error && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-danger/10 p-3.5 text-sm font-medium text-danger">
                    {error}
                  </div>
                )}
                <Button className="w-full" size="lg" type="submit" disabled={forgotSending}>
                  {forgotSending ? "Sending…" : "Send reset link"} {!forgotSending && <Mail className="h-4 w-4" />}
                </Button>
              </form>
            </>
          )}

          {mode === "forgotSent" && (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                <Mail className="h-6 w-6" />
              </div>
              <h1 className="mt-5 font-brand text-4xl font-bold tracking-tight text-brand-deep">
                Check your inbox
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                We've sent a password reset link to <strong className="text-brand-deep">{forgotEmail.trim()}</strong>.
                The link works once and expires in 30 minutes.
              </p>
              <p className="mx-auto mt-3 max-w-sm text-xs text-muted">No email? Check your spam folder.</p>
              <Button className="mt-7" size="lg" onClick={() => { setMode("signin"); setError(""); }}>
                Back to sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {mode === "sent" && (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                <Mail className="h-6 w-6" />
              </div>
              <h1 className="mt-5 font-brand text-4xl font-bold tracking-tight text-brand-deep">
                Check your inbox
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                We've sent a verification link to <strong className="text-brand-deep">{signUp.email}</strong>.
                Open it within 24 hours to activate your account, then sign in.
              </p>
              <p className="mx-auto mt-3 max-w-sm text-xs text-muted">
                Can't find it? Check your spam folder.{" "}
                {resendState === "sent" ? (
                  <span className="font-semibold text-brand-deep">A new link is on its way.</span>
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer font-semibold text-brand-deep underline underline-offset-2"
                    disabled={resendState === "sending"}
                    onClick={() => void resendLink(signUp.email)}
                  >
                    {resendState === "sending" ? "Sending…" : "Resend link"}
                  </button>
                )}
              </p>
              <Button className="mt-7" size="lg" onClick={() => { setMode("signin"); setError(""); setUnverified(false); }}>
                Back to sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
