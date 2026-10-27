import { QrCode } from "lucide-react"

export function ExchangeHeroArt() {
  return (
    <div className="relative h-[374px] w-full max-w-[380px] sm:max-w-[420px] mx-auto rounded-[25px] border border-[#e4daef] bg-[#ede7f6] flex items-center justify-center overflow-hidden shadow-sm">
      {/* Concentric Decorative Rings */}
      <div className="absolute h-[290px] w-[290px] rounded-full border border-[#d6c8e8] pointer-events-none" />
      <div className="absolute h-[420px] w-[420px] rounded-full border border-[#dfd4ed] pointer-events-none" />

      {/* Sparkle Stars */}
      <span className="absolute top-8 right-10 text-2xl font-bold text-brand-purple select-none pointer-events-none">
        ✦
      </span>
      <span className="absolute bottom-10 left-8 text-xl font-bold text-brand-orange select-none pointer-events-none">
        ✧
      </span>

      {/* Floating Badge: Face Value (Top Right) */}
      <div className="absolute top-6 right-4 z-20 flex items-center gap-1.5 rounded-xl border border-[#ffddbc] bg-[#fff5e9] px-3 py-2 text-[11px] font-bold text-[#925125] shadow-sm rotate-[5deg]">
        Face value. Always.
      </div>

      {/* Back Ticket (Warm Peach, tilted -13deg) */}
      <div
        className="absolute z-0 h-[258px] w-[268px] rounded-[17px] bg-[#ffb887] shadow-xl border border-white/60 overflow-hidden flex flex-col justify-start"
        style={{ transform: "rotate(-13deg) translate(-37px, -14px)" }}
      >
        <div className="p-6 font-black text-[27px] leading-tight text-[#713a29] tracking-tight">
          LIVE FOR
          <br />
          THE MOMENT.
        </div>
      </div>

      {/* Front Ticket (Purple header + White bottom, tilted +8deg) */}
      <div
        className="absolute z-10 w-[268px] rounded-[17px] bg-white shadow-2xl border border-white overflow-hidden"
        style={{ transform: "rotate(8deg) translate(18px, 8px)" }}
      >
        {/* Ticket Top */}
        <div className="bg-[#6f39d6] p-5 pb-4 text-white">
          <div className="text-[9px] font-extrabold uppercase tracking-[2px] opacity-75">
            THE GOOD NIGHTS TOUR
          </div>
          <h2 className="mt-3 font-brand text-[25px] font-black leading-tight tracking-tight">
            One ticket.
            <br />
            Endless memories.
          </h2>
          <p className="mt-1 text-[10px] font-bold opacity-80 tracking-wider">
            LIVE MUSIC · GOOD COMPANY
          </p>
        </div>

        {/* Ticket Bottom with Cutout Notches */}
        <div className="relative bg-white px-6 py-4">
          {/* Left and Right cutout notch circles */}
          <div className="absolute -left-[10px] -top-[10px] h-5 w-5 rounded-full bg-[#ede7f6]" />
          <div className="absolute -right-[10px] -top-[10px] h-5 w-5 rounded-full bg-[#ede7f6]" />

          <div className="flex justify-between border-b border-dashed border-[#ddd3e5] pb-3 mb-3">
            <div>
              <span className="block text-[8px] font-bold uppercase tracking-wider text-muted">
                SECTION
              </span>
              <strong className="text-xs font-black text-brand-deep">
                Floor A
              </strong>
            </div>
            <div className="text-right">
              <span className="block text-[8px] font-bold uppercase tracking-wider text-muted">
                ADMISSION
              </span>
              <strong className="text-xs font-black text-brand-deep">
                One happy fan
              </strong>
            </div>
          </div>

          {/* QR Code graphic */}
          <div className="flex flex-col items-center justify-center pt-0.5 pb-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#e1d9ea] bg-[#faf8fc] p-1.5 shadow-inner">
              <QrCode className="h-full w-full text-brand-deep" />
            </div>
            <div className="mt-1.5 text-center text-[8px] font-black tracking-[1.4px] text-muted">
              LESS SCROLLING. MORE SINGING.
            </div>
          </div>
        </div>
      </div>

      {/* Floating Badge: Verified (Bottom Left) */}
      <div
        className="absolute bottom-7 left-4 z-20 flex items-center gap-2 rounded-xl border border-[#eee9f4] bg-white px-3.5 py-2.5 text-[11px] font-bold text-brand-deep shadow-lg"
        style={{ transform: "rotate(-4deg)" }}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#eaf5ed] text-[#287958] font-black">
          ✓
        </div>
        <span>New fan. Fresh QR code.</span>
      </div>
    </div>
  )
}
