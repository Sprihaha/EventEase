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
} from "lucide-react";
import { useStore, currency, fmtDate } from "../lib/store";
import type { Booking } from "../lib/data";
import { DashboardShell, StatCard, type NavItem } from "../components/DashboardShell";
import { QRCode, Button, Badge, Card, Input, cx } from "../components/ui";

const nav: NavItem[] = [
  { id: "tickets", label: "My tickets", icon: Ticket },
  { id: "history", label: "Booking history", icon: History },
  { id: "resale", label: "Refund & resale", icon: Repeat },
  { id: "rewards", label: "Loyalty rewards", icon: Gift },
];

export default function CustomerDashboard() {
  const { bookings, events, cancelBooking, listForResale } = useStore();
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
              {upcoming.length ? (
                upcoming.map((b) => {
                  const ev = evOf(b.eventId)!;
                  return (
                    <Card key={b.id} className="flex flex-col overflow-hidden sm:flex-row">
                      <img src={ev.image} alt={ev.title} className="h-32 w-full object-cover sm:h-auto sm:w-40" />
                      <div className="flex flex-1 flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <Badge tone="live">Confirmed</Badge>
                          <h3 className="mt-2 font-display text-xl font-semibold">{ev.title}</h3>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{fmtDate(ev.date)}</span>
                            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ev.venue}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {b.seats.map((s) => (
                              <span key={s.seat} className="rounded-md bg-mist px-2 py-1 text-xs font-medium">
                                {s.seat} · {s.tier}
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 text-xs text-muted">Ref {b.ref}</div>
                        </div>
                        <Button variant="dark" onClick={() => setQr(b)}>
                          <QrCode className="h-4 w-4" /> Show ticket
                        </Button>
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
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-mist/50 text-left text-xs uppercase tracking-wide text-muted">
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
                    <tr key={b.id} className="border-b border-line last:border-0">
                      <td className="p-4 font-medium">{evOf(b.eventId)?.title}</td>
                      <td className="p-4 text-muted">{fmtDate(b.purchasedAt)}</td>
                      <td className="p-4 text-muted">{b.seats.length}</td>
                      <td className="p-4">{currency(b.total)}</td>
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
              <div className="rounded-2xl bg-accent-soft p-4 text-sm text-accent-ink">
                Change of plans? Get a full refund up to 48h before the show, or list your seat for a
                secure, verified one-to-one transfer at face value.
              </div>
              {upcoming.map((b) => {
                const ev = evOf(b.eventId)!;
                return (
                  <Card key={b.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-display text-lg font-semibold">{ev.title}</h3>
                      <div className="text-sm text-muted">
                        {b.seats.map((s) => s.seat).join(", ")} · Paid {currency(b.total)} · Ref {b.ref}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" onClick={() => cancelBooking(b.id)}>
                        Cancel & refund
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setResell(b); setAsk(String(b.total)); }}>
                        <Repeat className="h-4 w-4" /> List for resale
                      </Button>
                    </div>
                  </Card>
                );
              })}
              {!upcoming.length && <EmptyState />}
            </div>
          )}

          {active === "rewards" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-6">
                <Heart className="h-6 w-6 text-accent" />
                <div className="mt-3 font-display text-3xl font-semibold">1,240 pts</div>
                <p className="text-sm text-muted">Earn 1 point per S$1. Redeem for fee-free bookings and early access.</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-mist">
                  <div className="h-full w-3/4 rounded-full bg-accent" />
                </div>
                <p className="mt-2 text-xs text-muted">260 pts to Gold tier</p>
              </Card>
              <Card className="p-6">
                <Gift className="h-6 w-6 text-accent" />
                <div className="mt-3 font-semibold">Your referral code</div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="rounded-lg bg-mist px-3 py-2 font-mono text-sm">ALEX-FAN5</code>
                  <Button size="sm" variant="outline">Copy</Button>
                </div>
                <p className="mt-3 text-sm text-muted">Friends get 5% off their first booking; you earn 200 points each.</p>
              </Card>
            </div>
          )}

          {/* QR modal */}
          {qr && (
            <Modal onClose={() => setQr(null)}>
              <div className="text-center">
                <Badge tone="live">Valid ticket</Badge>
                <h3 className="mt-3 font-display text-2xl font-semibold">{evOf(qr.eventId)?.title}</h3>
                <p className="text-sm text-muted">{fmtDate(evOf(qr.eventId)!.date)} · {evOf(qr.eventId)?.venue}</p>
                <div className="mx-auto mt-5 w-max rounded-2xl border border-line p-4">
                  <QRCode value={qr.ref} size={160} />
                </div>
                <p className="mt-3 text-sm">Seats <b>{qr.seats.map((s) => s.seat).join(", ")}</b></p>
                <p className="text-xs text-muted">Ref {qr.ref} · Present at the gate for scanning</p>
              </div>
            </Modal>
          )}

          {/* Resale modal */}
          {resell && (
            <Modal onClose={() => setResell(null)}>
              <h3 className="font-display text-2xl font-semibold">List for secure resale</h3>
              <p className="mt-1 text-sm text-muted">
                {evOf(resell.eventId)?.title} · {resell.seats.map((s) => s.seat).join(", ")}
              </p>
              <div className="mt-4">
                <div className="text-sm font-medium">Asking price (max face value {currency(resell.total)})</div>
                <Input
                  className="mt-2"
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  type="number"
                  max={resell.total}
                />
              </div>
              <Button
                className="mt-4 w-full"
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
    <div className="rounded-3xl border border-dashed border-line p-16 text-center">
      <Ticket className="mx-auto h-8 w-8 text-muted" />
      <p className="mt-3 text-muted">No upcoming events yet.</p>
      <Link to="/events">
        <Button className="mt-4">Discover events</Button>
      </Link>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <Card className={cx("relative w-full max-w-md p-6 ee-rise")}>
        <button onClick={onClose} className="absolute right-4 top-4 text-muted hover:text-ink">
          <X className="h-5 w-5" />
        </button>
        {children}
      </Card>
    </div>
  );
}
