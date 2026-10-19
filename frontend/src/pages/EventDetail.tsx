import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Calendar,
  Clock,
  MapPin,
  Eye,
  Users,
  ShieldCheck,
  Accessibility,
  Ticket,
  CheckCircle2,
  X,
  Info,
} from "lucide-react";
import { useStore, currency, fmtDate, fmtTime } from "../lib/store";
import { SeatMap } from "../components/SeatMap";
import { QRCode, ticketPayload, Button, Badge, Eyebrow, Card, Input, cx } from "../components/ui";

type Sel = { seat: string; tier: string; price: number };

const PROMOS: Record<string, number> = { EARLYBIRD: 15, WELCOME10: 10, FAN5: 5 };

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { events, user, book, posts } = useStore();
  const ev = events.find((e) => e.id === id);
  const [sel, setSel] = useState<Sel[]>([]);
  const [companion, setCompanion] = useState(false);
  const [step, setStep] = useState<"seats" | "pay" | "done">("seats");
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState(0);
  const [ref, setRef] = useState("");

  useEffect(() => {
    const narrationPage =
      step === "pay"
        ? "checkout"
        : step === "done"
          ? "booking-confirmation"
          : sel.length
            ? "select-tickets"
            : "event-details";
    window.dispatchEvent(
      new CustomEvent("eventease:narration-page", { detail: narrationPage }),
    );
  }, [sel.length, step]);

  if (!ev) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="font-brand text-3xl font-bold text-brand-deep">Event not found</h1>
        <Button className="mt-6" onClick={() => navigate("/events")}>
          Back to browse
        </Button>
      </div>
    );
  }

  const eventPosts = posts.filter((p) => p.eventId === ev.id);
  const subtotal = sel.reduce((a, s) => a + s.price, 0);
  const fee = Math.round(subtotal * 0.05);
  const discount = Math.round((subtotal * applied) / 100);
  const total = Math.max(0, subtotal + fee - discount);

  const toggle = (seat: string, tier: string, price: number) =>
    setSel((cur) =>
      cur.some((s) => s.seat === seat)
        ? cur.filter((s) => s.seat !== seat)
        : [...cur, { seat, tier, price }],
    );

  const applyPromo = () => setApplied(PROMOS[promo.toUpperCase().trim()] ?? 0);

  const startCheckout = () => {
    if (!user) return navigate("/login");
    setStep("pay");
  };

  const confirm = () => {
    const bk = book(
      ev.id,
      sel.map((s) => ({ seat: s.seat, tier: s.tier })),
      total,
      applied ? promo.toUpperCase() : undefined,
    );
    setRef(bk.ref);
    setStep("done");
  };

  return (
    <div>
      {/* Hero banner */}
      <div className="relative h-[42vh] min-h-[340px] w-full overflow-hidden">
        <img src={ev.image} alt={ev.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/95 via-brand-deep/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-5 pb-8 text-white">
          <Badge tone="neutral" className="border-0 bg-white/95 text-brand-deep font-bold shadow-sm">
            {ev.category}
          </Badge>
          <h1 className="mt-3 font-brand text-4xl font-bold tracking-tight text-white md:text-6xl">
            {ev.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-orange" /> {fmtDate(ev.date)}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-purple" /> Doors {ev.doors} · Show {fmtTime(ev.date)}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-brand-orange" /> {ev.venue}, {ev.city}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1fr_380px]">
        {/* Left */}
        <div>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">{ev.blurb}</p>

          {/* Transparency + amenities */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-brand-purple/15 bg-white p-4.5 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-lilac text-brand-purple">
                <Eye className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-brand-deep">360° venue view</div>
                <div className="text-sm text-muted">Preview sightlines from every section.</div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-brand-purple/15 bg-white p-4.5 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
                <Accessibility className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-brand-deep">Accessible booking</div>
                <div className="text-sm text-muted">Companion seats & on-site support available.</div>
              </div>
            </div>
          </div>

          {/* Seat map */}
          <div className="mt-10">
            <Eyebrow>Choose your seats</Eyebrow>
            <h2 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-deep">
              Interactive seating chart
            </h2>
            <p className="mt-2 text-sm text-muted">
              Real-time availability. Front rows are VIP, middle Standard, back Concession.
            </p>
            <Card className="mt-5 border border-brand-purple/15 bg-white p-6 shadow-sm">
              <SeatMap
                ev={ev}
                selected={sel.map((s) => s.seat)}
                onToggle={toggle}
              />
            </Card>
          </div>

          {/* Community */}
          <div className="mt-12">
            <div className="flex items-center justify-between">
              <h2 className="font-brand text-2xl font-bold tracking-tight text-brand-deep">
                From the community
              </h2>
              <Link
                to="/community"
                className="flex items-center gap-1 text-sm font-bold text-brand-purple transition-colors hover:text-brand-orange"
              >
                <Users className="h-4 w-4" /> Join the conversation
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {eventPosts.length ? (
                eventPosts.map((p) => (
                  <div
                    key={p.id}
                    className="flex gap-3.5 rounded-2xl border border-brand-purple/15 bg-white p-4.5 shadow-sm"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta text-sm font-bold text-white shadow-sm">
                      {p.author[0]}
                    </div>
                    <div>
                      <div className="text-sm">
                        <span className="font-bold text-brand-deep">{p.author}</span>{" "}
                        {p.section && <Badge tone="neutral">Sec {p.section}</Badge>}{" "}
                        <span className="text-muted">· {p.when}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
                      {p.photo && (
                        <img
                          src={p.photo}
                          alt="Seat view"
                          className="mt-3 h-44 w-full max-w-sm rounded-xl object-cover"
                        />
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-brand-purple/20 bg-white/50 p-6 text-sm text-muted">
                  No posts yet — be the first to share the view.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right — booking summary */}
        <div className="lg:sticky lg:top-24 lg:h-max">
          <Card className="overflow-hidden border border-brand-purple/15 bg-white shadow-xl">
            <div className="border-b border-brand-purple/10 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-muted">
                  Your selection
                </span>
                <Badge tone={sel.length ? "accent" : "neutral"} className="font-bold">
                  {sel.length} {sel.length === 1 ? "seat" : "seats"}
                </Badge>
              </div>
              {sel.length ? (
                <div className="mt-4 space-y-2.5">
                  {sel.map((s) => (
                    <div key={s.seat} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-brand-purple text-[10px] font-bold text-white">
                          {s.seat}
                        </span>
                        <span className="font-semibold text-brand-deep">{s.tier}</span>
                      </span>
                      <span className="flex items-center gap-2 font-bold text-brand-deep">
                        {currency(s.price)}
                        <button
                          onClick={() => toggle(s.seat, s.tier, s.price)}
                          className="cursor-pointer"
                        >
                          <X className="h-4 w-4 text-muted hover:text-danger" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">Tap seats on the chart to add them.</p>
              )}
            </div>

            <div className="space-y-3 p-5 text-sm">
              <label className="flex items-center gap-2 text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={companion}
                  onChange={(e) => setCompanion(e.target.checked)}
                  className="h-4 w-4 accent-brand-orange cursor-pointer"
                />
                Request companion assistance (free)
              </label>
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="font-semibold text-brand-deep">{currency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-muted">
                  Booking fee <Info className="h-3 w-3" />
                </span>
                <span className="font-semibold text-brand-deep">{currency(fee)}</span>
              </div>
              {applied > 0 && (
                <div className="flex justify-between font-semibold text-live">
                  <span>Promo ({applied}% off)</span>
                  <span>−{currency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-brand-purple/10 pt-3 text-base font-bold text-brand-deep">
                <span>Total</span>
                <span className="font-brand text-2xl font-bold text-brand-deep">
                  {currency(total)}
                </span>
              </div>
              <p className="text-xs font-semibold text-live">
                ✓ No hidden charges. This is the final price.
              </p>
              <Button className="mt-2 w-full" disabled={!sel.length} onClick={startCheckout}>
                {user ? "Continue to payment" : "Sign in to book"}
              </Button>
            </div>
          </Card>

          <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs font-medium text-emerald-900">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            Every ticket carries a unique, tamper-checked QR verified at the gate.
          </div>
        </div>
      </div>

      {/* Checkout modal */}
      {step !== "seats" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-4 backdrop-blur-md">
          <Card className="w-full max-w-md border border-brand-purple/20 bg-white p-7 shadow-2xl ee-rise">
            {step === "pay" && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-brand text-2xl font-bold text-brand-deep">Checkout</h3>
                  <button onClick={() => setStep("seats")} className="cursor-pointer">
                    <X className="h-5 w-5 text-muted hover:text-brand-deep" />
                  </button>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {sel.length} {sel.length === 1 ? "seat" : "seats"} · {ev.title}
                </p>

                <div className="mt-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">
                    Promo code
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={promo}
                      onChange={(e) => setPromo(e.target.value)}
                      placeholder="EARLYBIRD"
                    />
                    <Button variant="outline" onClick={applyPromo}>
                      Apply
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(PROMOS).map(([code, pct]) => (
                      <button
                        key={code}
                        onClick={() => {
                          setPromo(code);
                          setApplied(pct);
                        }}
                        className="cursor-pointer rounded-full bg-brand-lilac px-3 py-1 text-xs font-bold text-brand-purple transition-colors hover:bg-brand-purple hover:text-white"
                      >
                        {code} −{pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">
                    Payment method
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {["Card", "PayPal", "PayNow"].map((m, i) => (
                      <div
                        key={m}
                        className={cx(
                          "cursor-pointer rounded-xl border p-3 text-center text-sm font-bold transition",
                          i === 0
                            ? "border-brand-purple bg-brand-lilac/70 text-brand-purple shadow-sm"
                            : "border-brand-purple/15 text-muted hover:border-brand-purple",
                        )}
                      >
                        {m}
                      </div>
                    ))}
                  </div>
                  <Input className="mt-2" placeholder="Card number (simulation)" />
                </div>

                <div className="mt-5 flex items-center justify-between rounded-xl border border-brand-purple/10 bg-brand-warm p-4 text-sm">
                  <span className="font-semibold text-muted">Total due</span>
                  <span className="font-brand text-xl font-bold text-brand-deep">
                    {currency(total)}
                  </span>
                </div>
                <Button className="mt-4 w-full" onClick={confirm}>
                  Pay {currency(total)}
                </Button>
              </>
            )}

            {step === "done" && (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <h3 className="mt-3 font-brand text-3xl font-bold text-brand-deep">You're going!</h3>
                <p className="mt-1 text-sm text-muted">
                  Booking <span className="font-bold text-brand-deep">{ref}</span> confirmed. Your
                  digital tickets are ready.
                </p>
                <div className="mx-auto mt-5 w-max rounded-2xl border border-brand-purple/15 bg-brand-warm/60 p-5 shadow-sm">
                  <QRCode value={ticketPayload(ref, sel.map((s) => s.seat).join(","))} />
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-brand-purple">
                    <Ticket className="h-3.5 w-3.5" /> {sel.map((s) => s.seat).join(", ")}
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("seats")}>
                    Close
                  </Button>
                  <Button className="flex-1" onClick={() => navigate("/dashboard/customer")}>
                    My tickets
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
