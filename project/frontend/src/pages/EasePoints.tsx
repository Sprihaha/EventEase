import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import {
  Sparkles,
  ArrowLeft,
  Award,
  Ticket,
  CheckCircle2,
  TrendingUp,
  Gift,
  Camera,
  Rotate3d,
  Repeat,
  Users,
  ShieldCheck,
  Zap,
  ChevronRight,
  Info,
  LogIn,
} from "lucide-react";
import { useStore } from "../lib/store";
import { getUserEasePoints, EASEPOINTS_RULES } from "../lib/easePoints";
import { backendListEasePix, type BackendEasePix } from "../lib/api/community";

export default function EasePoints() {
  const { user } = useStore();
  const navigate = useNavigate();

  const [points, setPoints] = useState<number>(() =>
    user ? getUserEasePoints(user.id) : 0
  );
  const [approvedPixCount, setApprovedPixCount] = useState<number>(0);
  const [loadingPix, setLoadingPix] = useState(false);

  // Sync points from localStorage and custom events
  useEffect(() => {
    if (!user) {
      setPoints(0);
      return;
    }
    const updatePoints = () => {
      setPoints(getUserEasePoints(user.id));
    };
    updatePoints();
    window.addEventListener("eventease:easepoints-updated", updatePoints);
    return () => {
      window.removeEventListener("eventease:easepoints-updated", updatePoints);
    };
  }, [user]);

  // Load user's approved EasePix count
  const loadApprovedPix = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingPix(true);
      const list = await backendListEasePix();
      const userApproved = list.filter((pix) => {
        const isOwner =
          (pix.userId && pix.userId === user.id) ||
          (pix.authorName &&
            user.name &&
            pix.authorName.toLowerCase() === user.name.toLowerCase());
        return isOwner && (pix.status === "APPROVED" || pix.pointsAwarded);
      });
      setApprovedPixCount(userApproved.length);
    } catch {
      // Fallback silently if offline or endpoint unavailable
    } finally {
      setLoadingPix(false);
    }
  }, [user]);

  useEffect(() => {
    void loadApprovedPix();
  }, [loadApprovedPix]);

  const tierName =
    points >= 200
      ? "Gold Exchange Member"
      : points >= 100
      ? "Verified Contributor (Discount Eligible)"
      : points >= 46
      ? "Silver Contributor"
      : "Active Fan";

  const activities = [
    {
      id: "views",
      label: "EasePix & EaseXplore",
      title: "Share your seat view",
      pts: "+23 pts",
      desc: "Earn points after your original EasePix photo is approved. Unlimited uploads. No per-event earning cap.",
      iconRender: () => (
        <div className="flex items-center -space-x-1.5 shrink-0">
          <div
            title="EasePix: Seat View Photos"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-white bg-brand-lilac text-brand-purple shadow-xs"
          >
            <Camera className="h-5 w-5" />
          </div>
          <div
            title="EaseXplore: 360° Views"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-white bg-orange-100 text-brand-orange shadow-xs"
          >
            <Rotate3d className="h-5 w-5" />
          </div>
        </div>
      ),
      cta: "Upload Seat View",
      link: "/community?tab=views&upload=true",
    },
    {
      id: "exchange",
      label: "EaseXchange",
      title: "Complete a ticket swap",
      pts: "+17 pts",
      desc: "Each participant earns points once the EaseXchange is fully completed.",
      iconRender: () => (
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-brand-orange shadow-2xs">
          <Repeat className="h-5 w-5" />
        </div>
      ),
      cta: "Browse Swaps",
      link: "/community?tab=exchange",
    },
    {
      id: "feed",
      label: "EaseConnect",
      title: "Ask a useful event question",
      pts: "+3 pts",
      desc: "Earn points for a qualifying EaseConnect question after relevance and duplicate checks.",
      iconRender: () => (
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-lilac/70 text-brand-purple shadow-2xs">
          <Users className="h-5 w-5" />
        </div>
      ),
      cta: "Join Discussion",
      link: "/community?tab=feed",
    },
  ];

  const redemptionRules = [
    {
      label: "Redemption Cost",
      rule: "100 EasePoints for one 10% discount.",
    },
    {
      label: "Eligible Amount",
      rule: "The ticket-price difference payable by the redeeming user.",
    },
    {
      label: "Maximum Discount",
      rule: "10% per exchange, regardless of points balance.",
    },
    {
      label: "Stacking",
      rule: "Not allowed — 200 points cannot provide 20% off one exchange.",
    },
    {
      label: "Remaining Points",
      rule: "Carry forward automatically for another eligible exchange.",
    },
    {
      label: "Same-Price Exchange",
      rule: "No price difference to discount, so no points are deducted.",
    },
    {
      label: "Upload Limit",
      rule: "Unlimited uploads, with no per-event earning cap.",
    },
  ];

  const progressPercent = Math.min(100, (points % 100 === 0 && points > 0 ? 100 : points % 100));

  return (
    <div className="min-h-full bg-brand-warm/30 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Navigation Breadcrumb & Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <nav className="flex items-center gap-2 text-xs font-semibold text-muted mb-2">
              <Link to="/community" className="hover:text-brand-purple transition-colors flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>EaseComms</span>
              </Link>
              <span>/</span>
              <span className="text-brand-orange font-bold">EasePoints</span>
            </nav>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-md shadow-brand-orange/20">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-brand text-2xl sm:text-3xl font-black text-brand-deep tracking-tight">
                  Your EasePoints Rewards
                </h1>
                <p className="text-xs sm:text-sm text-muted">
                  Official rules, community earning activities & ticket exchange discount guidelines
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/community?tab=views&upload=true"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-orange to-brand-amber px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
            >
              <Camera className="h-4 w-4" />
              <span>Upload Seat View (+23 pts)</span>
            </Link>
            <Link
              to="/community?tab=exchange"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-purple/20 bg-white px-4 py-2.5 text-xs font-bold text-brand-deep hover:bg-brand-lilac/40 transition-all shadow-xs"
            >
              <Repeat className="h-4 w-4 text-brand-purple" />
              <span>EaseXchange</span>
            </Link>
          </div>
        </div>

        {/* Not Logged In Banner */}
        {!user && (
          <div className="rounded-3xl border border-brand-orange/30 bg-gradient-to-r from-brand-orange/10 via-brand-amber/10 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h2 className="font-brand text-lg font-bold text-brand-deep">
                Log in to view your EasePoints balance
              </h2>
              <p className="text-xs sm:text-sm text-muted max-w-xl">
                Earn EasePoints with every approved seat photo (+23 pts), completed swap (+17 pts), and qualifying question (+3 pts).
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-deep px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-brand-purple transition-all shrink-0"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In / Register</span>
            </Link>
          </div>
        )}

        {/* Organizer / Admin Friendly Notice */}
        {user && (user.role === "admin" || user.role === "organizer") && (
          <div className="rounded-3xl border border-brand-purple/20 bg-brand-lilac/20 p-5 flex items-center gap-3.5 text-brand-deep">
            <Info className="h-5 w-5 text-brand-purple shrink-0" />
            <p className="text-xs sm:text-sm">
              You are signed in as an <strong>{user.role}</strong>. EasePoints rewards and discounts are earned and redeemed by <strong>customer accounts</strong> for community seat views and ticket swaps.
            </p>
          </div>
        )}

        {/* Hero Balance Card */}
        {user && user.role === "customer" && (
          <div className="relative overflow-hidden rounded-3xl border border-brand-orange/30 bg-gradient-to-br from-brand-deep via-[#311c59] to-[#451e36] p-6 sm:p-8 text-white shadow-xl">
            <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-brand-orange/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-brand-purple/30 blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-bold text-brand-orange border border-brand-orange/30 backdrop-blur-xs">
                  <Award className="h-3.5 w-3.5" />
                  <span>{tierName}</span>
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="font-brand text-5xl sm:text-6xl font-black text-white tracking-tight">
                    {points}
                  </span>
                  <span className="text-2xl font-extrabold text-brand-orange">
                    EasePoints
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-white/85 max-w-lg leading-relaxed">
                  {points >= 100
                    ? "✨ You have enough EasePoints to redeem a 10% discount on your next payable EaseXchange price difference!"
                    : `Earn ${100 - (points % 100)} more EasePoints to unlock 10% off your next ticket swap price difference.`}
                </p>

                {/* Progress bar towards next 100 points */}
                <div className="max-w-md space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-bold text-white/75">
                    <span>Reward Progress</span>
                    <span>{points >= 100 ? "10% Discount Unlocked" : `${points % 100} / 100 pts`}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-white/15 overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-orange to-amber-400 transition-all duration-500 shadow-sm"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Subtotal & Metrics Pills */}
              <div className="flex flex-row md:flex-col gap-3 shrink-0">
                <div className="flex-1 md:flex-none rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-xs">
                  <div className="flex items-center gap-2 text-emerald-400 mb-1">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-bold text-white">Approved Seat Views</span>
                  </div>
                  <p className="font-brand text-xl font-black text-white">
                    {approvedPixCount} <span className="text-xs font-semibold text-white/70">photos</span>
                  </p>
                  <p className="text-[11px] text-white/75 mt-0.5">
                    +{approvedPixCount * EASEPOINTS_RULES.POINTS_PER_APPROVED_PHOTO} pts earned
                  </p>
                </div>

                <div className="flex-1 md:flex-none rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-xs">
                  <div className="flex items-center gap-2 text-brand-orange mb-1">
                    <Ticket className="h-4 w-4" />
                    <span className="text-xs font-bold text-white">Discount Conversion</span>
                  </div>
                  <p className="font-brand text-xl font-black text-white">
                    100 pts <span className="text-xs font-semibold text-white/70">= 10% off</span>
                  </p>
                  <p className="text-[11px] text-white/75 mt-0.5">
                    Applied on ticket price difference
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 1: Ways to Earn EasePoints (3 Cards matching design reference) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-brand-orange" />
              Ways to Earn EasePoints
            </h2>
            <span className="text-xs font-semibold text-muted">
              3 Qualifying Activities
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {activities.map((act) => (
              <div
                key={act.label}
                className="rounded-3xl border border-brand-purple/15 bg-white p-6 shadow-xs hover:border-brand-purple/30 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    {act.iconRender()}
                    <span className="rounded-full bg-brand-orange/10 px-3 py-1 font-brand text-xs font-black text-brand-orange border border-brand-orange/20">
                      {act.pts}
                    </span>
                  </div>

                  <p className="mt-5 font-feature font-black italic tracking-tight text-sm text-brand-purple">
                    {act.label}
                  </p>
                  <h3 className="mt-1 font-brand text-base font-bold text-brand-deep leading-snug">
                    {act.title}
                  </h3>
                  <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-muted">
                    {act.desc}
                  </p>
                </div>

                <div className="pt-6 border-t border-brand-line/60 mt-6">
                  <Link
                    to={act.link}
                    className="group inline-flex items-center gap-1.5 text-xs font-bold text-brand-purple hover:text-brand-orange transition-colors"
                  >
                    <span>{act.cta}</span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-brand-purple/10 bg-white/70 px-4 py-3 text-xs text-muted italic flex items-center gap-2">
            <Info className="h-4 w-4 text-brand-purple shrink-0 not-italic" />
            <span>
              <strong>Integrity Guarantee:</strong> Photo likes do not earn points. Duplicate, copied, or rejected submissions do not qualify. Points are credited upon official moderation approval.
            </span>
          </div>
        </div>

        {/* Section 2: Redemption Rules & Guidelines */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2">
              <Gift className="h-5 w-5 text-brand-purple" />
              Redemption Rules for EaseXchange Swaps
            </h2>
            <span className="rounded-full bg-brand-purple/10 px-3 py-1 text-xs font-bold text-brand-purple">
              100 pts = 10% Discount
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {redemptionRules.map((r, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-brand-line bg-white p-4.5 space-y-1.5 hover:border-brand-purple/25 hover:shadow-xs transition-all"
              >
                <span className="text-[11px] font-extrabold text-brand-deep uppercase tracking-wider block">
                  {r.label}
                </span>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  {r.rule}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Practical Example Card */}
        <div className="rounded-3xl border border-brand-purple/20 bg-gradient-to-br from-brand-lilac/30 via-white to-brand-warm/40 p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-purple text-white shadow-xs">
              <Zap className="h-4 w-4" />
            </div>
            <h3 className="font-brand text-base font-bold text-brand-deep">
              Example: How the 10% Swap Discount Works
            </h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded-2xl bg-white p-4 border border-brand-purple/10 space-y-1">
              <p className="text-[10px] font-extrabold uppercase text-muted tracking-wider">Step 1 • Ticket Swap</p>
              <p className="font-bold text-brand-deep">You swap a $50 ticket for a $70 ticket</p>
              <p className="text-muted">The gross price difference payable is $20.00.</p>
            </div>

            <div className="rounded-2xl bg-white p-4 border border-brand-orange/20 space-y-1">
              <p className="text-[10px] font-extrabold uppercase text-brand-orange tracking-wider">Step 2 • 10% Discount Applied</p>
              <p className="font-bold text-brand-orange">10% discount on $20 = Save $2.00</p>
              <p className="text-muted">You pay only $18.00 instead of $20.00.</p>
            </div>

            <div className="rounded-2xl bg-white p-4 border border-emerald-500/20 space-y-1">
              <p className="text-[10px] font-extrabold uppercase text-emerald-600 tracking-wider">Step 3 • Points Balance</p>
              <p className="font-bold text-emerald-700">100 EasePoints deducted</p>
              <p className="text-muted">Any remaining points carry forward automatically!</p>
            </div>
          </div>
        </div>

        {/* Bottom Banner & Call to Action */}
        <div className="rounded-3xl border border-brand-line bg-white p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-brand text-base font-bold text-brand-deep">
              Ready to earn your next EasePoints reward?
            </h3>
            <p className="text-xs text-muted max-w-lg">
              Share real seat photos from events you attended, swap tickets securely on EaseXchange, or ask helpful event queries on EaseConnect!
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            <Link
              to="/community?tab=views&upload=true"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
              <span>Upload Seat View (+23 pts)</span>
            </Link>
            <Link
              to="/community"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-purple/20 bg-white px-5 py-2.5 text-xs font-bold text-brand-deep hover:bg-brand-lilac/40 transition-all"
            >
              <span>Explore EaseComms</span>
              <ChevronRight className="h-4 w-4 text-brand-purple" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

