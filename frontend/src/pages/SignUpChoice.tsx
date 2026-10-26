import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Sparkles, Ticket } from "lucide-react";
import { Button } from "../components/ui";
import { useStore } from "../lib/store";

export type SignUpRole = "CUSTOMER" | "ORGANISER";
export type SignUpPrefill = { username?: string; email?: string };

const OPTIONS: { role: SignUpRole; title: string; tagline: string; icon: typeof Ticket }[] = [
  { role: "CUSTOMER", title: "Sign up as a customer", tagline: "Search, view and book event tickets", icon: Ticket },
  { role: "ORGANISER", title: "Sign up as organiser", tagline: "Create your event, share your creativity", icon: Sparkles },
];

// First step of sign-up: choose the account type, then fill in the form on /login.
export default function SignUpChoice() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { prefill?: SignUpPrefill } | null)?.prefill ?? {};
  const { user, sessionLoading } = useStore();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  // Signed-in users don't sign up again.
  useEffect(() => {
    if (!sessionLoading && user) navigate(`/dashboard/${user.role}`, { replace: true });
  }, [sessionLoading, user, navigate]);

  const choose = (role: SignUpRole) => navigate("/login", { state: { mode: "signup", role, prefill } });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-brand-warm px-5 py-12">
      <div className="mx-auto max-w-4xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="-ml-3">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Button>
        <p className="mt-6 font-brand text-lg font-bold text-brand-orange">New to EventEase? Sign up now</p>
        <h1 className="mt-2 font-brand text-4xl font-bold tracking-tight text-brand-deep">
          How will you use EventEase?
        </h1>
        <p className="mt-2 text-sm text-muted">Choose an account type to continue.</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {OPTIONS.map(({ role, title, tagline, icon: Icon }) => (
            <button
              key={role}
              type="button"
              onClick={() => choose(role)}
              className="how-it-works-card group relative isolate flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[2.25rem] border border-white/25 p-8 text-center text-white shadow-md shadow-brand-purple/25 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-brand-orange/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/40"
            >
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 text-white shadow-sm backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:bg-white/30">
                  <Icon className="h-10 w-10 text-white" />
                </span>
                <span className="mt-6 font-brand text-2xl font-bold tracking-tight text-white">{title}</span>
                <span className="mt-3 max-w-[16rem] text-sm leading-relaxed text-white/90">{tagline}</span>
                <span className="mt-7 inline-flex items-center gap-2 rounded-full bg-white/20 px-5 py-2 text-sm font-bold text-white shadow-xs backdrop-blur-md transition-all duration-300 group-hover:bg-white group-hover:text-brand-orange group-hover:shadow-md">
                  Continue <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
