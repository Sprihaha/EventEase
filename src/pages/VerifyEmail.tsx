import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Card, Field, Input } from "../components/ui";
import { backendResendVerification, backendVerifyEmail } from "../lib/backendApi";

// Links are single-use, so a token must be sent to the backend only once even if the
// effect runs twice (React StrictMode in development).
const verifications = new Map<string, Promise<unknown>>();

export default function VerifyEmail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"verifying" | "verified" | "failed">(code ? "verifying" : "failed");
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    if (!code) return;
    let pending = verifications.get(code);
    if (!pending) {
      pending = backendVerifyEmail(code);
      verifications.set(code, pending);
    }
    pending
      .then(() => setState("verified"))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "");
        setState("failed");
      });
  }, [code]);

  const resend = async (event: FormEvent) => {
    event.preventDefault();
    setResendState("sending");
    try {
      await backendResendVerification(identifier.trim());
    } finally {
      setResendState("sent");
    }
  };

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg items-center px-5 py-16">
      <Card className="w-full p-8 text-center sm:p-10">
        {state === "verifying" ? (
          <>
            <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-brand-purple/20 border-t-brand-orange" />
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Verifying your email</h1>
            <p className="mt-3 text-sm text-brand-ink/70">Connecting securely to EventEase…</p>
          </>
        ) : state === "verified" ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-live/10 text-live ring-8 ring-live/5">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">You’re verified</h1>
            <p className="mt-3 text-sm text-brand-ink/70">Your email address is confirmed. You can now sign in to EventEase.</p>
            <Button className="mt-8 w-full" onClick={() => navigate("/login")}>Continue to sign in</Button>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger ring-8 ring-danger/5">
              <XCircle className="h-10 w-10" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Link unavailable</h1>
            <p className="mt-3 text-sm text-brand-ink/70">
              {error ? `${error[0].toUpperCase()}${error.slice(1)}.` : "This verification link is invalid or has already been used."}{" "}
              If your email is already verified, just sign in.
            </p>
            {resendState === "sent" ? (
              <p className="mt-6 text-sm font-medium text-brand-deep">
                If that account still needs verifying, a new link is on its way. Check your inbox and spam folder.
              </p>
            ) : (
              <form className="mt-6 space-y-3 text-left" onSubmit={resend}>
                <Field label="Need a new link? Enter your username or email">
                  <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
                </Field>
                <Button className="w-full" variant="outline" type="submit" disabled={resendState === "sending"}>
                  {resendState === "sending" ? "Sending…" : "Send a new verification link"}
                </Button>
              </form>
            )}
            <Button className="mt-4 w-full" onClick={() => navigate("/login")}>Return to sign in</Button>
          </>
        )}
      </Card>
    </div>
  );
}
