import { useState } from "react";
import { Link } from "react-router";
import {
  Ticket,
  History,
  Repeat,
  Heart,
  Calendar,
  MapPin,
  QrCode,
  X,
  Gift,
  Accessibility,
} from "lucide-react";
import { useStore, currency, fmtDate } from "../lib/store";
import type { Booking } from "../lib/data";
import { DashboardShell, StatCard, type NavItem } from "../components/DashboardShell";
import { QRCode, ticketPayload, Button, Badge, Card, Input, cx } from "../components/ui";

const nav: NavItem[] = [
  { id: "tickets", label: "My tickets", icon: Ticket },
  { id: "history", label: "Booking history", icon: History },
  { id: "resale", label: "Refund & resale", icon: Repeat },
  { id: "rewards", label: "Loyalty rewards", icon: Gift },
];

export default function CustomerDashboard() {
  const { bookings, events, assistanceRequests, cancelBooking, listForResale } = useStore();
  const mine = bookings.filter((b) => b.userId === "u-cust");
  const [qr, setQr] = useState<Booking | null>(null);
  const [resell, setResell] = useState<Booking | null>(null);
  const [ask, setAsk] = useState("");

  const evOf = (id: string) => events.find((e) => e.id === id);
  const upcoming = mine.filter((b) => b.status === "confirmed");
  const spent = mine.filter((b) => b.status !== "refunded").reduce((a, b) => a + b.total, 0);

  return (
    <DashboardShell role="customer" title="My dashboard" nav={nav}>
      {(active) => (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard label="Upcoming events" value={String(upcoming.length)} tone="accent" />
            <StatCard label="Total tickets" value={String(mine.reduce((a, b) => a + b.seats.length, 0))} />
            <StatCard label="Lifetime spend" value={currency(spent)} sub="Across all bookings" />
          </div>

          {active === "tickets" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Link to="/assistance">
                  <Button variant="outline" size="sm">
                    <Accessibility className="h-4 w-4 text-brand-purple" /> My assistance requests
                  </Button>
                </Link>
              </div>
              {upcoming.length ? (
                upcoming.map((b) => {
                  const ev = evOf(b.eventId)!;
                  const openRequest = assistanceRequests.find(
                    (request) =>
                      request.bookingId === b.id &&
                      ["Submitted", "Assigned", "In progress"].includes(request.status),
                  );
                  const canRequest = new Date(ev.date).getTime() > Date.now();
                  return (
                    <Card key={b.id} className="flex flex-col overflow-hidden sm:flex-row border border-brand-purple/15 bg-white shadow-sm rounded-3xl">
                      <img src={ev.image} alt={ev.title} className="h-36 w-full object-cover sm:h-auto sm:w-44" />
                      <div className="flex flex-1 flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <Badge tone="live">Confirmed</Badge>
                          <h3 className="mt-2 font-brand text-xl font-bold text-brand-deep">{ev.title}</h3>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-brand-purple" />{fmtDate(ev.date)}</span>
                            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-orange" />{ev.venue}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {b.seats.map((s) => (
                              <span key={s.seat} className="rounded-lg bg-brand-lilac px-2.5 py-1 text-xs font-bold text-brand-purple">
                                {s.seat} · {s.tier}
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 text-xs font-medium text-muted">Ref <span className="font-bold text-brand-deep">{b.ref}</span></div>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 sm:items-end">
                          <Button onClick={() => setQr(b)}>
                            <QrCode className="h-4 w-4" /> Show ticket
                          </Button>
                          {openRequest ? (
                            <Link
                              to={`/assistance?request=${openRequest.id}`}
                              className="text-center text-xs font-bold text-brand-purple hover:text-brand-orange transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20"
                            >
                              Request already open, view it →
                            </Link>
                          ) : canRequest ? (
                            <Link to={`/assistance/request/${b.id}`}>
                              <Button variant="outline" size="sm" className="w-full">
                                <Accessibility className="h-4 w-4 text-brand-purple" /> Request assistance
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <EmptyState />
              )}
            </div>
          )}

          {active === "history" && (
            <Card className="overflow-hidden border border-brand-purple/15 bg-white shadow-sm rounded-3xl">
              <table className="w-full text-sm">
                <thead className="border-b border-brand-purple/10 bg-brand-lilac/30 text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="p-4">Event</th>
                    <th className="p-4">Booked</th>
                    <th className="p-4">Seats</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((b) => (
                    <tr key={b.id} className="border-b border-brand-purple/10 last:border-0 hover:bg-brand-warm/50 transition-colors">
                      <td className="p-4 font-bold text-brand-deep">{evOf(b.eventId)?.title}</td>
                      <td className="p-4 text-muted">{fmtDate(b.purchasedAt)}</td>
                      <td className="p-4 font-semibold text-brand-deep">{b.seats.length}</td>
                      <td className="p-4 font-bold text-brand-deep">{currency(b.total)}</td>
                      <td className="p-4">
                        <Badge
                          tone={
                            b.status === "confirmed" ? "live" : b.status === "refunded" ? "warn" : b.status === "listed" ? "accent" : "neutral"
                          }
                        >
                          {b.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {active === "resale" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand-purple/20 bg-brand-lilac/60 p-4.5 text-sm font-medium text-brand-deep shadow-sm">
                Change of plans? Get a full refund up to 48h before the show, or list your seat for a
                secure, verified one-to-one transfer at face value.
              </div>
              {upcoming.map((b) => {
                const ev = evOf(b.eventId)!;
                return (
                  <Card key={b.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border border-brand-purple/15 bg-white shadow-sm rounded-3xl">
                    <div>
                      <h3 className="font-brand text-lg font-bold text-brand-deep">{ev.title}</h3>
                      <div className="mt-1 text-sm text-muted">
                        {b.seats.map((s) => s.seat).join(", ")} · Paid {currency(b.total)} · Ref {b.ref}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" onClick={() => cancelBooking(b.id)}>
                        Cancel & refund
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setResell(b); setAsk(String(b.total)); }}>
                        <Repeat className="h-4 w-4 text-brand-orange" /> List for resale
                      </Button>
                    </div>
                  </Card>
                );
              })}
              {!upcoming.length && <EmptyState />}
            </div>
          )}

          {active === "rewards" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Card className="border border-brand-purple/15 bg-white p-6 shadow-sm rounded-3xl">
                <Heart className="h-7 w-7 text-brand-magenta" />
                <div className="mt-3 font-brand text-3xl font-bold text-brand-deep">1,240 pts</div>
                <p className="mt-1 text-sm text-muted leading-relaxed">Earn 1 point per S$1. Redeem for fee-free bookings and early access.</p>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-brand-lilac">
                  <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-brand-purple to-brand-orange" />
                </div>
                <p className="mt-2 text-xs font-semibold text-brand-purple">260 pts to Gold tier</p>
              </Card>
              <Card className="border border-brand-purple/15 bg-white p-6 shadow-sm rounded-3xl">
                <Gift className="h-7 w-7 text-brand-orange" />
                <div className="mt-3 font-brand text-xl font-bold text-brand-deep">Your referral code</div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="rounded-xl border border-brand-purple/15 bg-brand-warm px-3.5 py-2 font-mono text-sm font-bold text-brand-purple">ALEX-FAN5</code>
                  <Button size="sm" variant="outline">Copy</Button>
                </div>
                <p className="mt-3 text-sm text-muted leading-relaxed">Friends get 5% off their first booking; you earn 200 points each.</p>
              </Card>
            </div>
          )}

          {/* QR modal */}
          {qr && (
            <Modal onClose={() => setQr(null)}>
              <div className="text-center">
                <Badge tone="live">Valid ticket</Badge>
                <h3 className="mt-3 font-brand text-2xl font-bold text-brand-deep">{evOf(qr.eventId)?.title}</h3>
                <p className="mt-1 text-sm text-muted">{fmtDate(evOf(qr.eventId)!.date)} · {evOf(qr.eventId)?.venue}</p>
                <div className="mx-auto mt-5 w-max rounded-2xl border border-brand-purple/15 bg-brand-warm/60 p-5 shadow-sm">
                  <QRCode value={ticketPayload(qr.ref, qr.seats.map((s) => s.seat).join(","))} size={160} />
                </div>
                <p className="mt-4 text-sm font-semibold text-brand-deep">Seats <b className="text-brand-purple">{qr.seats.map((s) => s.seat).join(", ")}</b></p>
                <p className="mt-1 text-xs text-muted">Ref <span className="font-mono font-bold text-brand-deep">{qr.ref}</span> · Present at the gate for scanning</p>
              </div>
            </Modal>
          )}

          {/* Resale modal */}
          {resell && (
            <Modal onClose={() => setResell(null)}>
              <h3 className="font-brand text-2xl font-bold text-brand-deep">List for secure resale</h3>
              <p className="mt-1 text-sm text-muted">
                {evOf(resell.eventId)?.title} · {resell.seats.map((s) => s.seat).join(", ")}
              </p>
              <div className="mt-5">
                <div className="text-xs font-bold uppercase tracking-wider text-muted">Asking price (max face value {currency(resell.total)})</div>
                <Input
                  className="mt-2"
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  type="number"
                  max={resell.total}
                />
              </div>
              <Button
                className="mt-5 w-full"
                onClick={() => {
                  listForResale(resell.id, resell.seats[0].seat, Math.min(+ask, resell.total));
                  setResell(null);
                }}
              >
                List on secure exchange
              </Button>
            </Modal>
          )}
        </>
      )}
    </DashboardShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-brand-purple/20 bg-white/50 p-16 text-center">
      <Ticket className="mx-auto h-8 w-8 text-brand-orange" />
      <p className="mt-3 text-sm font-medium text-muted">No upcoming events yet.</p>
      <Link to="/events">
        <Button className="mt-4">Discover events</Button>
      </Link>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-4 backdrop-blur-md">
      <Card className={cx("relative w-full max-w-md border border-brand-purple/20 bg-white p-7 shadow-2xl ee-rise")}>
        <button onClick={onClose} className="cursor-pointer absolute right-4 top-4 text-muted hover:text-brand-deep">
          <X className="h-5 w-5" />
        </button>
        {children}
      </Card>
    </div>
  );
}
