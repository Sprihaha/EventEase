import { useMemo, useState, type FormEvent } from "react";
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

export default function Login() {
  const { authenticate } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const [mode, setMode] = useState<"signin" | "signup" | "sent">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(() =>
    Number(sessionStorage.getItem("eventease-login-attempts") ?? 0),
  );
  const [locked, setLocked] = useState(
    () => sessionStorage.getItem("eventease-login-locked") === "true",
  );
  const [signUp, setSignUp] = useState<SignUp>(emptySignUp);
  const [verificationCode, setVerificationCode] = useState("");
  const remaining = Math.max(0, 5 - attempts);

  const passwordHint = useMemo(() => {
    if (!signUp.password) return "";
    return signUp.password.length >= 8 ? "Password strength: ready" : "Use at least 8 characters";
  }, [signUp.password]);

  const handleSignIn = (event: FormEvent) => {
    event.preventDefault();
    if (locked) return;
    const account = authenticate(username, password);
    if (account) {
      sessionStorage.removeItem("eventease-login-attempts");
      sessionStorage.removeItem("eventease-login-locked");
      navigate(account.role === "customer" && returnTo ? returnTo : `/dashboard/${account.role}`);
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    sessionStorage.setItem("eventease-login-attempts", String(next));
    if (next >= 5) {
      setLocked(true);
      sessionStorage.setItem("eventease-login-locked", "true");
      setError("This account is locked after 5 unsuccessful attempts. Contact support to unlock it.");
    } else {
      setError(`Username or password doesn't match. ${5 - next} attempts remaining.`);
    }
  };

  const handleSignUp = (event: FormEvent) => {
    event.preventDefault();
    const code = crypto.randomUUID();
    localStorage.setItem(`eventease-pending-${code}`, JSON.stringify(signUp));
    setVerificationCode(code);
    setMode("sent");
  };

  const update = (key: keyof SignUp, value: string) =>
    setSignUp((current) => ({ ...current, [key]: value }));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-mist/50 px-5 py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2.5rem] border border-line bg-paper shadow-[0_30px_100px_-60px_rgba(11,11,15,0.5)] lg:grid-cols-[0.85fr_1.15fr]">
        <div className="relative hidden overflow-hidden bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/40 blur-3xl" />
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white">
              <Ticket className="h-5 w-5 text-ink" />
            </div>
            <p className="mt-8 font-display text-4xl leading-tight">
              Your next great night starts here.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              Sign in to choose seats, join EaseComms, and keep every verified ticket in one place.
            </p>
          </div>
          <div className="relative space-y-3 text-sm text-white/70">
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-white" /> Secure sign-in and verified tickets</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-white" /> Transparent prices, always</p>
          </div>
        </div>

        <Card className="border-0 p-7 sm:p-12">
          {mode === "signin" && (
            <>
              <Badge tone="accent"><LockKeyhole className="h-3 w-3" /> Secure account access</Badge>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">Welcome back</h1>
              <p className="mt-2 text-sm text-muted">Enter your EventEase username and password.</p>

              <form className="mt-8 space-y-5" onSubmit={handleSignIn}>
                <Field label="Username">
                  <Input
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="e.g. hcy001"
                    required
                    disabled={locked}
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
                      disabled={locked}
                      className="pr-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((shown) => !shown)}
                      className="absolute right-1 top-1 h-9 w-9 px-0"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>
                {error && (
                  <div role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                    {error}
                  </div>
                )}
                {!locked && attempts > 0 && (
                  <p className="text-xs text-muted">{remaining} sign-in attempts remaining.</p>
                )}
                <Button className="w-full" size="lg" type="submit" disabled={locked}>
                  Sign in <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              <div className="mt-6 border-t border-line pt-6 text-center">
                <p className="text-sm text-muted">New to EventEase?</p>
                <Button className="mt-3" variant="outline" onClick={() => { setMode("signup"); setError(""); }}>
                  <UserPlus className="h-4 w-4" /> Sign up as a new user
                </Button>
              </div>
            </>
          )}

          {mode === "signup" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setMode("signin")} className="-ml-3">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Button>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">Create your account</h1>
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
                <Button className="mt-2 w-full sm:col-span-2" size="lg" type="submit">
                  Send verification link <Mail className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}

          {mode === "sent" && (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-live/10 text-live">
                <Mail className="h-6 w-6" />
              </div>
              <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight">Check your inbox</h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                A verification link has been prepared for <strong className="text-ink">{signUp.email}</strong>.
                In this preview, use the button below to simulate opening the email.
              </p>
              <Button className="mt-7" size="lg" onClick={() => navigate(`/verify-email/${verificationCode}`)}>
                Open verification link <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
