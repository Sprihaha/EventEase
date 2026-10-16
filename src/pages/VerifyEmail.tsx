import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Card } from "../components/ui";

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

  useEffect(() => {
    if (!code) return;
    const raw = localStorage.getItem(`eventease-pending-${code}`);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as PendingAccount;
      localStorage.setItem(`eventease-user-${pending.userId.toLowerCase()}`, JSON.stringify(pending));
      localStorage.removeItem(`eventease-pending-${code}`);
      setAccount(pending);
    } catch {
      setAccount(null);
    }
  }, [code]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center px-5 py-16">
      <Card className="w-full p-8 text-center">
        {account ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-live" />
            <h1 className="mt-5 font-display text-4xl font-semibold">You’re verified</h1>
            <p className="mt-3 text-sm text-muted">
              Welcome, {account.userId}. Your customer account is ready to use.
            </p>
            <Button className="mt-7" onClick={() => navigate("/login")}>Continue to sign in</Button>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-danger" />
            <h1 className="mt-5 font-display text-4xl font-semibold">Link unavailable</h1>
            <p className="mt-3 text-sm text-muted">This verification link is invalid or has already been used.</p>
            <Button className="mt-7" onClick={() => navigate("/login")}>Return to sign in</Button>
          </>
        )}
      </Card>
    </div>
  );
}
