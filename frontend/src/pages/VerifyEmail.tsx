import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Card } from "../components/ui";
import { backendSignup } from "../lib/backendApi";

type PendingAccount = {
  userId: string;
  password: string;
  email: string;
  phone: string;
  billingAddress: string;
};

export default function VerifyEmail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState<PendingAccount | null>(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    if (!code) {
      setVerifying(false);
      return;
    }
    const raw = localStorage.getItem(`eventease-pending-${code}`);
    if (!raw) {
      setVerifying(false);
      return;
    }
    try {
      const pending = JSON.parse(raw) as PendingAccount;
      backendSignup({
        username: pending.userId,
        password: pending.password,
        email: pending.email,
        phone: pending.phone,
      })
        .then(() => {
          localStorage.setItem(`eventease-user-${pending.userId.toLowerCase()}`, JSON.stringify(pending));
          localStorage.removeItem(`eventease-pending-${code}`);
          setAccount(pending);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Account verification failed.");
        })
        .finally(() => setVerifying(false));
    } catch {
      setVerifying(false);
    }
  }, [code]);

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg items-center px-5 py-16">
      <Card className="w-full p-8 text-center sm:p-10">
        {verifying ? (
          <>
            <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-brand-purple/20 border-t-brand-orange" />
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Verifying your account</h1>
            <p className="mt-3 text-sm text-brand-ink/70">Connecting securely to EventEase…</p>
          </>
        ) : account ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-live/10 text-live ring-8 ring-live/5">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">You’re verified</h1>
            <p className="mt-3 text-sm text-brand-ink/70">
              Welcome, <span className="font-semibold text-brand-deep">{account.userId}</span>. Your customer account is ready to use.
            </p>
            <Button className="mt-8 w-full" onClick={() => navigate("/login")}>Continue to sign in</Button>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger ring-8 ring-danger/5">
              <XCircle className="h-10 w-10" />
            </div>
            <h1 className="mt-6 font-brand text-3xl font-bold tracking-tight text-brand-deep">Link unavailable</h1>
            <p className="mt-3 text-sm text-brand-ink/70">
              {error || "This verification link is invalid or has already been used."}
            </p>
            <Button className="mt-8 w-full" onClick={() => navigate("/login")}>Return to sign in</Button>
          </>
        )}
      </Card>
    </div>
  );
}
