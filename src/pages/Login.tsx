import { useNavigate } from "react-router";
import { User, Building2, ShieldCheck, Ticket, ArrowRight } from "lucide-react";
import { useStore } from "../lib/store";
import type { Role } from "../lib/data";
import { Button, Eyebrow, Card } from "../components/ui";

const roles: { role: Role; icon: typeof User; h: string; p: string; can: string[] }[] = [
  {
    role: "customer",
    icon: User,
    h: "Customer",
    p: "Discover events, pick seats, and manage your tickets.",
    can: ["Browse & book events", "Manage bookings & cancellations", "Digital QR tickets", "Refund & secure resale"],
  },
  {
    role: "organizer",
    icon: Building2,
    h: "Organizer",
    p: "Create events, set pricing, and track your sales.",
    can: ["Create & edit events", "VIP / Standard / Concession tiers", "Promotions & early-bird", "Sales analytics & forecasting"],
  },
  {
    role: "admin",
    icon: ShieldCheck,
    h: "Administrator",
    p: "Oversee the platform and keep it fraud-free.",
    can: ["Approve events & organizers", "Monitor fraudulent activity", "Platform-wide analytics", "Manage all accounts"],
  },
];

export default function Login() {
  const { login } = useStore();
  const navigate = useNavigate();

  const go = (role: Role) => {
    login(role);
    navigate(`/dashboard/${role}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink">
          <Ticket className="h-6 w-6 text-white" />
        </div>
        <Eyebrow>Welcome to EventEase</Eyebrow>
        <h1 className="mx-auto mt-2 max-w-xl font-display text-5xl font-semibold tracking-tight">
          Sign in to your world
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Every role has its own dashboard, permissions and tools. Choose how you're here today —
          this is a live demo, so no password required.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.role} className="flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(11,11,15,0.35)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <r.icon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold">{r.h}</h2>
            <p className="mt-1 text-sm text-muted">{r.p}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {r.can.map((c) => (
                <li key={c} className="flex items-center gap-2 text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {c}
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" onClick={() => go(r.role)}>
              Enter as {r.h} <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
