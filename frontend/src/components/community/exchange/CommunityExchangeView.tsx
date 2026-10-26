import { useNavigate } from "react-router"
import { LogIn, Repeat, ShieldCheck, Tag, Users } from "lucide-react"
import SecureExchange from "../../SecureExchange"
import { ExchangeHeroArt } from "./ExchangeHeroArt"
import type { User } from "../types"

interface CommunityExchangeViewProps {
  user: User | null
}

export function CommunityExchangeView({ user }: CommunityExchangeViewProps) {
  const navigate = useNavigate()

  return (
    <div id="exchange-view" className="max-w-5xl mx-auto pt-0.5 pb-6 space-y-5">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h2 className="font-brand text-2xl font-bold tracking-tight text-brand-deep">
            Ticket Swaps
          </h2>
          <p className="text-xs text-muted">
            Face-value ticket swaps backed by community verification
          </p>
        </div>
      </div>

      {/* Hero Section */}
      <div className="rounded-3xl border border-brand-line bg-white p-6 sm:p-10 lg:p-12 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[1.12fr_1fr] gap-8 lg:gap-12 items-center">
          {/* Left Column: Hero Copy */}
          <div className="max-w-xl">
            <div className="text-[11px] font-extrabold uppercase tracking-[1.7px] text-brand-purple">
              FAN-TO-FAN TICKET EXCHANGE
            </div>

            <h1 className="mt-4 font-brand text-4xl sm:text-5xl lg:text-[54px] font-extrabold leading-[1.06] tracking-tight text-brand-deep">
              Plans change.
              <br />
              The show{" "}
              <span className="relative inline-block text-brand-purple font-black">
                goes on.
                <span
                  className="absolute -bottom-1.5 left-0 w-full h-[6px] border-t-[3px] border-[#ff9c66] rounded-[50%] -rotate-[2deg] pointer-events-none"
                  aria-hidden="true"
                />
              </span>
            </h1>

            <p className="mt-5 text-sm sm:text-base leading-relaxed text-muted max-w-md">
              Your next great night shouldn’t come with a markup. Swap tickets
              or pass them on to another fan, all at original face value.
            </p>

            {/* Sign In / Visit Action Button */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {!user ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate("/login", {
                      state: { returnTo: "/community?tab=exchange" },
                    })
                  }
                  className="cursor-pointer inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-purple/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                  <LogIn className="h-4 w-4" /> Sign In to EventEase
                </button>
              ) : (
                <button
                  type="button"
                  id="try-easexchange-btn"
                  onClick={() => {
                    const el = document.getElementById("easexchange-app")
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth" })
                    } else {
                      navigate("/community?tab=exchange")
                    }
                  }}
                  className="cursor-pointer inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-purple/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                  <Repeat className="h-4 w-4" /> Try EaseXchange
                </button>
              )}
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs text-muted">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                {!user
                  ? "Use your EventEase account to get started."
                  : `Signed in as ${user.name}. Ready to exchange.`}
              </span>
            </p>
          </div>

          {/* Right Column: Ticket Illustration Art Box */}
          <ExchangeHeroArt />
        </div>

        {/* Trust Benefits Bar */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-brand-line border-y border-brand-line py-5 text-center">
          <div className="flex items-center justify-center gap-2.5 py-2 sm:py-0 text-xs font-bold text-brand-deep">
            <Tag className="h-4 w-4 text-brand-purple" />
            <span>No price markups</span>
          </div>
          <div className="flex items-center justify-center gap-2.5 py-2 sm:py-0 text-xs font-bold text-brand-deep">
            <ShieldCheck className="h-4 w-4 text-brand-purple" />
            <span>Reissued ticket codes</span>
          </div>
          <div className="flex items-center justify-center gap-2.5 py-2 sm:py-0 text-xs font-bold text-brand-deep">
            <Users className="h-4 w-4 text-brand-purple" />
            <span>Fans, not scalpers</span>
          </div>
        </div>

        {/* 3 Simple How It Works Steps */}
        <div className="mt-10 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="font-brand text-xl sm:text-2xl font-bold tracking-tight text-brand-deep">
                Different plans. Simple swaps.
              </h3>
              <p className="text-xs text-muted">
                A little less hassle. A lot more live moments.
              </p>
            </div>
            <span className="hidden sm:inline-block rounded-full border border-brand-line px-3 py-1 text-[11px] font-black uppercase tracking-wider text-muted">
              HOW IT WORKS
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Card 01 */}
            <div className="how-it-works-card group overflow-hidden rounded-[20px] p-6 text-white border border-white/25 shadow-md shadow-brand-purple/25 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-orange/25 cursor-default">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm font-bold shadow-sm">
                    <Tag className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-black text-white/80 tracking-wider">
                    01
                  </span>
                </div>
                <h4 className="font-brand text-lg font-bold text-white tracking-tight">
                  Find your fit
                </h4>
                <p className="mt-1.5 text-xs text-white/90 leading-relaxed">
                  Looking for another date, seat, or section? Find a ticket that
                  works for your new plans.
                </p>
              </div>
            </div>

            {/* Card 02 */}
            <div className="how-it-works-card group overflow-hidden rounded-[20px] p-6 text-white border border-white/25 shadow-md shadow-brand-purple/25 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-orange/25 cursor-default">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm font-bold shadow-sm">
                    <Repeat className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-black text-white/80 tracking-wider">
                    02
                  </span>
                </div>
                <h4 className="font-brand text-lg font-bold text-white tracking-tight">
                  Keep it fair
                </h4>
                <p className="mt-1.5 text-xs text-white/90 leading-relaxed">
                  Connect with another fan and exchange at original face value. No
                  inflated ticket prices.
                </p>
              </div>
            </div>

            {/* Card 03 */}
            <div className="how-it-works-card group overflow-hidden rounded-[20px] p-6 text-white border border-white/25 shadow-md shadow-brand-purple/25 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-orange/25 cursor-default">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm font-bold shadow-sm">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-black text-white/80 tracking-wider">
                    03
                  </span>
                </div>
                <h4 className="font-brand text-lg font-bold text-white tracking-tight">
                  Make it yours
                </h4>
                <p className="mt-1.5 text-xs text-white/90 leading-relaxed">
                  Previous ticket codes are voided and new ones issued to the
                  buyer. Your next night out, sorted.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* EaseXchange Platform: Only available to users who have signed in */}
        {user && (
          <div id="easexchange-app" className="pt-6 border-t border-brand-line">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-brand text-2xl font-bold tracking-tight text-brand-deep flex items-center gap-2">
                  <span className="font-feature italic font-black text-brand-purple">
                    EaseXchange
                  </span>
                  <span>Platform</span>
                </h3>
                <p className="text-xs text-muted">
                  Browse active face-value listings, create exchange requests,
                  and swap tickets securely.
                </p>
              </div>
            </div>
            <SecureExchange key={user.id} />
          </div>
        )}
      </div>
    </div>
  )
}
