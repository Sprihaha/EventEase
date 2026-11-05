import {
  Sparkles,
  X,
  Gift,
  ShieldCheck,
  Ticket,
  Award,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  Camera,
  Repeat2,
  CircleHelp,
} from "lucide-react"
import { EASEPOINTS_RULES } from "../../../lib/easePoints"

export interface EasePointsModalProps {
  isOpen: boolean
  onClose: () => void
  userPoints: number
  uploadedCount: number
  onOpenUploadModal: () => void
}

export function EasePointsModal({
  isOpen,
  onClose,
  userPoints,
  uploadedCount,
  onOpenUploadModal,
}: EasePointsModalProps) {
  if (!isOpen) return null

  const tierName =
    userPoints >= 200
      ? "Gold Exchange Member"
      : userPoints >= 100
        ? "Verified Contributor (Discount Eligible)"
        : userPoints >= 46
          ? "Silver Contributor"
          : "Active Fan"

  const activities = [
    {
      label: "EASEPIX",
      title: "Share your seat view",
      pts: "+23 pts",
      desc: "Earn points after your original EasePix photo is approved. Unlimited uploads. No per-event earning cap.",
      icon: Camera,
    },
    {
      label: "EASEXCHANGE",
      title: "Complete a ticket swap",
      pts: "+17 pts",
      desc: "Each participant earns points once the EaseXchange is fully completed.",
      icon: Repeat2,
    },
    {
      label: "EASECONNECT",
      title: "Ask a useful event question",
      pts: "+3 pts",
      desc: "Earn points for a qualifying EaseConnect question after relevance and duplicate checks.",
      icon: CircleHelp,
    },
  ]

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
      rule: "Carry forward for another eligible exchange.",
    },
    {
      label: "Same-Price Exchange",
      rule: "No price difference to discount, so no points are deducted.",
    },
    {
      label: "Upload Limit",
      rule: "Unlimited uploads, with no per-event earning cap.",
    },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="easepoints-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[92vh] rounded-3xl bg-white shadow-2xl border border-brand-purple/20 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-brand-line">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="easepoints-modal-title"
                className="font-brand text-base font-bold text-brand-deep"
              >
                Your EasePoints Rewards
              </h3>
              <p className="text-[11px] text-muted">
                Official rules, earning activities & exchange discount guidelines
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-brand-lilac/40 hover:text-brand-deep transition-all"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Main Points Card */}
          <div className="relative overflow-hidden rounded-3xl border border-brand-orange/30 bg-gradient-to-br from-brand-deep via-[#311c59] to-[#451e36] p-6 text-white text-center shadow-lg">
            <div className="absolute -top-12 -right-12 h-36 w-36 rounded-full bg-brand-orange/20 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-brand-purple/30 blur-2xl pointer-events-none" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-brand-orange border border-brand-orange/30 backdrop-blur-xs mb-3">
                <Award className="h-3.5 w-3.5" />
                <span>{tierName}</span>
              </div>

              <div className="my-1">
                <span className="font-brand text-5xl font-black text-white tracking-tight">
                  {userPoints}
                </span>
                <span className="ml-2 text-xl font-extrabold text-brand-orange">
                  EasePoints
                </span>
              </div>

              <p className="text-xs text-white/80 max-w-md mx-auto mt-1">
                {userPoints >= 100
                  ? "You have enough EasePoints to redeem a 10% discount on your next payable EaseXchange price difference!"
                  : `Earn ${100 - userPoints} more EasePoints to unlock 10% off your next ticket swap price difference.`}
              </p>

              {/* Contributor breakdown pills */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-xs text-white/90">
                <div className="rounded-xl bg-white/10 px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>
                    <strong className="text-white">{uploadedCount}</strong> approved photos (+{uploadedCount * EASEPOINTS_RULES.POINTS_PER_APPROVED_PHOTO} pts)
                  </span>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
                  <Ticket className="h-3.5 w-3.5 text-brand-orange" />
                  <span>
                    <strong>100 pts</strong> = 10% exchange discount
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Official Earning Activities */}
          <div className="space-y-3">
            <h4 className="font-brand text-sm font-bold text-brand-deep flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-orange" />
              Ways to Earn EasePoints
            </h4>

            <div className="grid gap-3 sm:grid-cols-3">
              {activities.map((act) => {
                const Icon = act.icon
                return (
                  <div
                    key={act.label}
                    className="rounded-2xl border border-brand-purple/15 bg-white p-4.5 shadow-xs hover:border-brand-purple/30 hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-lilac/70 text-brand-purple shadow-2xs">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="rounded-full bg-brand-orange/10 px-3 py-1 font-brand text-xs font-black text-brand-orange border border-brand-orange/20">
                          {act.pts}
                        </span>
                      </div>

                      <p className="mt-4 text-[10px] font-extrabold uppercase tracking-wider text-brand-purple">
                        {act.label}
                      </p>
                      <h5 className="mt-1 font-brand text-sm font-bold text-brand-deep leading-snug">
                        {act.title}
                      </h5>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        {act.desc}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-muted italic px-1">
              * Note: Photo likes do not earn points. Duplicate, copied, or rejected photos do not qualify.
            </p>
          </div>

          {/* Section 2: Redemption & Discount Rules */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-brand text-sm font-bold text-brand-deep flex items-center gap-2">
                <Gift className="h-4 w-4 text-brand-purple" />
                Redemption Rules for EaseXchange Swaps
              </h4>
              <span className="text-[11px] font-semibold text-brand-purple">
                100 pts = 10% Off
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {redemptionRules.map((r, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-brand-line bg-brand-warm/25 p-3.5 space-y-1 hover:bg-white hover:border-brand-purple/20 transition-all"
                >
                  <span className="text-[11px] font-extrabold text-brand-deep uppercase tracking-wider block">
                    {r.label}
                  </span>
                  <p className="text-xs text-muted leading-relaxed">
                    {r.rule}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-brand-line bg-brand-warm/40 px-6 py-4">
          <p className="text-[11px] text-muted text-center sm:text-left">
            Remaining points automatically carry forward for future eligible exchanges.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 sm:flex-none rounded-xl border border-brand-line bg-white px-4 py-2 text-xs font-bold text-brand-deep hover:bg-brand-warm transition-all"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenUploadModal()
              }}
              className="cursor-pointer flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-orange/25 hover:opacity-95 transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Upload Seat View (+23 pts)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
