import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { LayoutDashboard, History, QrCode, X, ArrowLeftRight } from "lucide-react";
import { useStore, currency, fmtDate } from "../lib/store";
import { fetchOwnedTickets, payBooking, type OwnedTicket } from "../lib/ticketingApi";
import { DashboardShell, type NavItem } from "../components/DashboardShell";
import { QRCode, ticketPayload, Button, Badge, Card } from "../components/ui";

import ExchangeActivityPanel from "../components/ExchangeActivityPanel";

const nav: NavItem[] = [
  { id: "tickets", label: "Dashboard", icon: LayoutDashboard },
  { id: "history", label: "Booking history", icon: History },
  { id: "easexchange", label: "EaseXchange", icon: ArrowLeftRight, to: "/community?tab=exchange" },
];
export default function CustomerDashboard() {
  const { user, sessionLoading, bookings, bookingsError, refreshBookings } = useStore();
  const [tickets, setTickets] = useState<OwnedTicket[]>([]);
  const [qr, setQr] = useState<OwnedTicket | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user || user.role !== "customer") return;
    const result = await fetchOwnedTickets(signal);
    if (!signal?.aborted) { setTickets(result); setQr(current => current ? result.find(t => t.id === current.id) ?? null : null); }
  }, [user?.id]);
  useEffect(() => {
    setTickets([]); setQr(null); setError("");
    if (!user || user.role !== "customer") { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load tickets."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const refresh = () => { void load(controller.signal).catch(() => {}); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [user?.id, load]);
  const act = async (id: string, operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id); setError("");
    try { await operation(); await Promise.all([refreshBookings(), load()]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action not confirmed. Refresh to check the current state."); }
    finally { setBusy(null); }
  };
  if (sessionLoading) return <p className="p-10" role="status">Restoring your session…</p>;
  if (!user || user.role !== "customer") return <div className="p-10"><p>Sign in as a customer to view your tickets.</p><Link to="/login"><Button className="mt-4">Sign in</Button></Link></div>;
  const mine = bookings.filter(b => b.userId === user.id);
  // Assistance can only be requested for events that haven't happened yet.
  const eventPassed = (date?: string) => !!date && Date.parse(date) <= Date.now();
  // My tickets shows only usable tickets: valid, from a confirmed booking, for an event that hasn't finished.
  const activeTickets = tickets.filter(t => t.status === "VALID" && t.bookingStatus === "CONFIRMED" && Date.parse(t.event.endAt ?? t.event.startAt) > Date.now());
  return (
    <DashboardShell
      role="customer"
      title={(active) => {
        if (active === "history") return "Booking history";
        return `Welcome, ${user.name}!`;
      }}
      nav={nav}
      headerAction={(active) =>
        active === "tickets" ? (
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() => act("refresh", async () => {})}
          >
            Refresh tickets & bookings
          </Button>
        ) : null
      }
    >
      {(active) => (
        <>
          {active === "tickets" && (
            <>
        {(error || bookingsError) && (
          <p role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-danger">
            {error || bookingsError}
          </p>
        )}
        {loading && <p role="status">Loading tickets…</p>}
        <div className="space-y-4">
          {!loading && !activeTickets.length && (
            <Card className="p-8">
              <p>No upcoming tickets.</p>
              <Link to="/events"><Button className="mt-4">Browse events</Button></Link>
            </Card>
          )}
          {activeTickets.map(t => (
            <Card key={t.id} className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <Badge tone={t.status === "VALID" && !t.checkedInAt ? "live" : "neutral"}>
                  {t.checkedInAt ? "Admitted" : t.status}
                </Badge>
                <h2 className="mt-2 font-brand text-xl font-bold">{t.event.title}</h2>
                <p className="mt-1 text-sm text-muted">{fmtDate(t.event.startAt)} · {t.event.venueName}</p>
                <p className="mt-2 font-semibold">{t.seatLabel ?? "General Admission"} · {t.categoryName} · {t.seatSection}</p>
                <p className="mt-1 text-sm">Purchase price: {currency(t.unitPriceCents / 100)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={t.status !== "VALID" || t.bookingStatus !== "CONFIRMED" || !!t.checkedInAt} onClick={() => setQr(t)}>
                  <QrCode className="h-4 w-4" /> Show ticket
                </Button>
                {t.status === "VALID" && !t.checkedInAt && (
                  <Link to={`/community?tab=exchange&view=create&ticket=${encodeURIComponent(t.id)}`}>
                    <Button variant="outline">Exchange ticket</Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      </>
    )}
    {active === "history" && (
      <div className="space-y-6">
        <ExchangeActivityPanel key={user.id} title="My activity" />
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Event</th>
                <th className="p-3">Booked</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {mine.map(b => (
                <tr key={b.id} className="border-t">
                  <td className="p-3">
                    {b.event?.title}
                    <p className="text-xs text-muted">{b.id}</p>
                  </td>
                  <td className="p-3">{fmtDate(b.purchasedAt)}</td>
                  <td className="p-3">{currency(b.total)}</td>
                  <td className="p-3">{b.status.replace(/_/g, " ")}</td>
                  <td className="p-3">
                    {b.status === "confirmed" && (eventPassed(b.event?.date) ? (
                      <span className="text-xs text-muted" title="Assistance can't be requested for a past event">Event has passed</span>
                    ) : (
                      <Link className="text-brand-purple underline" to={`/assistance/request/${b.id}`}>
                        Request assistance
                      </Link>
                    ))}
                    {b.status === "pending_payment" && (
                      <Button size="sm" disabled={!!busy} onClick={() => act(b.id, () => payBooking(b.id))}>
                        Resume simulated payment
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!mine.length && <p className="p-3">No bookings yet.</p>}
        </Card>
      </div>
    )}
    {qr && <div role="dialog" aria-modal="true" aria-label="Digital ticket" className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-5"><Card className="relative w-full max-w-md p-7 text-center"><button aria-label="Close ticket" className="absolute right-4 top-4" onClick={() => setQr(null)}><X className="h-5 w-5"/></button><h2 className="font-brand text-2xl font-bold">{qr.event.title}</h2><p className="my-4">Seat {qr.seatLabel ?? "General Admission"} · {qr.categoryName}</p><div className="mx-auto w-max"><QRCode value={ticketPayload(qr.code)} size={180}/></div><Link className="mt-5 block text-brand-purple underline" to={`/verify/${encodeURIComponent(qr.code)}`}>Open verification page</Link><p className="mt-3 break-all text-xs text-muted">{qr.code}</p></Card></div>}
  </>)}</DashboardShell>
  );
}
