import { useNavigate } from "react-router"
import type { User } from "../types"

interface CommunityHeroBannerProps {
  user: User | null
  onExploreViews: () => void
}

export function CommunityHeroBanner({
  user,
  onExploreViews,
}: CommunityHeroBannerProps) {
  const navigate = useNavigate()

  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl border border-white/20 shadow-2xl transition-all">
      {/* Background Image & Multi-Stop Gradients */}
      <div
        className="relative min-h-[360px] sm:min-h-[390px] lg:min-h-[420px] p-6 sm:p-10 lg:p-12 text-white flex flex-col justify-between"
        style={{
          backgroundImage: `
            linear-gradient(90deg, rgba(27,7,44,0.92) 0%, rgba(50,19,79,0.80) 30%, rgba(50,19,79,0.42) 60%, rgba(216,61,165,0.20) 100%),
            linear-gradient(0deg, rgba(20,7,31,0.45) 0%, transparent 50%),
            url('/Neon_Festival_Lights_and_Euphoria.png')
          `,
          backgroundSize: "cover",
          backgroundPosition: "center 48%",
        }}
      >
        {/* Subtle Concentric Rings & Sparkle Overlay */}
        <div className="pointer-events-none absolute -top-40 -right-20 h-96 w-96 rounded-full border border-white/10 shadow-[0_0_0_35px_rgba(255,255,255,0.03),0_0_0_70px_rgba(255,255,255,0.02)]" />
        <div className="pointer-events-none absolute right-8 bottom-6 text-7xl sm:text-8xl lg:text-9xl font-black text-brand-orange/90 opacity-90 select-none drop-shadow-[0_0_40px_rgba(255,101,0,0.5)]">
          ✦
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-brand-deep/60 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-lilac backdrop-blur-md">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-orange shadow-[0_0_0_4px_rgba(255,101,0,0.35)] animate-pulse" />
            EASECOMMS
          </div>

          <h1 className="mt-4 font-brand text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[0.96] drop-shadow-md">
            THE NIGHT IS <br />
            <span className="font-feature italic font-black text-brand-orange drop-shadow-[0_4px_28px_rgba(255,101,0,0.45)]">
              BETTER TOGETHER.
            </span>
          </h1>

          <p className="mt-4 max-w-lg text-sm sm:text-base leading-relaxed text-brand-warm/95 drop-shadow">
            Find your people. Discover the view. Get hyped before the lights go
            down.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3.5">
            {!user ? (
              <button
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 0, left: 0, behavior: "instant" })
                  navigate("/login", { state: { returnTo: "/community" } })
                }}
                className="cursor-pointer inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-orange to-brand-amber px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-brand-orange/30 transition-transform hover:-translate-y-0.5 hover:shadow-brand-orange/45 active:translate-y-0"
              >
                Let me in!
              </button>
            ) : (
              <div className="inline-flex items-center gap-2.5 text-base sm:text-lg font-bold text-white drop-shadow">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                <span className="font-feature italic font-black text-brand-warm tracking-wide text-lg sm:text-xl">
                  ...and you&apos;re in!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Community Spotlight Feature Card */}
        <div className="relative z-10 mt-8 w-full max-w-[285px] sm:self-end lg:absolute lg:right-8 lg:bottom-8 lg:mt-0">
          <div
            onClick={onExploreViews}
            className="cursor-pointer rounded-2xl border border-white/30 bg-white/10 p-5 text-white shadow-2xl backdrop-blur-xl transform -rotate-2 sm:-rotate-3 transition-all hover:rotate-0 hover:scale-[1.02] duration-300 group"
            title="Click to explore EasePix seat views"
          >
            <div className="flex items-center justify-between text-[9px] font-extrabold tracking-wider text-[#FFC7A6]">
              <span className="flex items-center gap-1">
                ✦ COMMUNITY SPOTLIGHT
              </span>
              <span className="opacity-80">01 / 01</span>
            </div>

            <h2 className="mt-3.5 font-brand text-2xl font-extrabold leading-tight text-white tracking-tight group-hover:text-brand-orange transition-colors">
              Better views.
              <br />
              Shared by real fans.
            </h2>

            <p className="mt-2 text-xs leading-relaxed text-[#EADDF4]/90">
              Get a feel for your section before the lights go down.
            </p>

            <div className="mt-4 flex items-center pt-1.5">
              <div className="flex -space-x-1.5 items-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-purple text-[10px] font-extrabold text-white ring-2 ring-purple-950/60 shadow-sm">
                  N
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-orange text-[10px] font-extrabold text-white ring-2 ring-purple-950/60 shadow-sm">
                  A
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-magenta text-[10px] font-extrabold text-white ring-2 ring-purple-950/60 shadow-sm">
                  M
                </span>
              </div>
              <small className="ml-2.5 text-[10px] text-[#F3E7FA]/80 font-medium leading-tight">
                A different perspective, together.
              </small>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
