import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Calendar, MapPin, Ticket, ShieldCheck } from "lucide-react";
import { useStore, currency, fmtDate } from "../lib/store";
import { fetchTicketingEvent, fetchSeats, holdSeats, holdCategories, payBooking, cancelHeldBooking,
  type BackendBooking, type LiveSeat, type TicketingEvent } from "../lib/ticketingApi";
import { SeatMap } from "../components/SeatMap";
import { Badge, Button, Card, QRCode, ticketPayload } from "../components/ui";

export default function EventDetail() {
  const { id = "" } = useParams();
  const { user, sessionLoading, refreshBookings } = useStore();
  const [event, setEvent] = useState<TicketingEvent | null>(null);
  const [seats, setSeats] = useState<LiveSeat[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [booking, setBooking] = useState<BackendBooking | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failPayment, setFailPayment] = useState(false);
  const [now, setNow] = useState(Date.now);
  const submitting = useRef(false);
  const key = useRef<string | null>(null);
  const identity = useRef(`${id}:${user?.id}`);
  identity.current = `${id}:${user?.id}`;
  const loadSeats = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchSeats(id, signal);
    if (!signal?.aborted) setSeats(result);
  }, [id]);
  useEffect(() => {
    setEvent(null); setBooking(null); setSelected([]); setQuantities({}); setError(""); key.current = null;
    if (!user) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    Promise.all([fetchTicketingEvent(id, controller.signal), loadSeats(controller.signal)])
      .then(([result]) => { if (!controller.signal.aborted) setEvent(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load event."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const interval = window.setInterval(() => { void loadSeats(controller.signal).catch(() => setError("Seat availability could not be refreshed. Try refreshing before booking.")); }, 5000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [id, user?.id, loadSeats]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("eventease:narration-page", { detail: booking?.status === "CONFIRMED" ? "booking-confirmation" : booking ? "checkout" : "select-tickets" }));
  }, [booking?.status]);
  const chosen = seats.filter(s => selected.includes(s.id));
  const categoryItems = (event?.ticketCategories ?? []).filter(c => (quantities[c.id] ?? 0) > 0).map(c => ({ ticketCategoryId: c.id, quantity: quantities[c.id] }));
  const count = seats.length ? chosen.length : categoryItems.reduce((sum, item) => sum + item.quantity, 0);
  const estimated = seats.length ? chosen.reduce((total, s) => total + s.priceCents, 0) / 100 : (event?.ticketCategories ?? []).reduce((sum, c) => sum + c.priceCents * (quantities[c.id] ?? 0), 0) / 100;
  const expired = !!booking?.holdExpiresAt && Date.parse(booking.holdExpiresAt) <= now;
  const run = async (operation: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    const account = identity.current;
    try { await operation(); }
    catch (cause) { if (identity.current === account) setError(cause instanceof Error ? cause.message : "The action was not confirmed. Refresh your dashboard to check its status."); }
    finally { submitting.current = false; setBusy(false); }
  };
  const reserve = () => run(async () => {
    key.current ??= crypto.randomUUID();
    const result = seats.length ? await holdSeats(id, chosen, key.current) : await holdCategories(id, categoryItems, key.current);
    setBooking(result); await refreshBookings(); await loadSeats();
  });
  const pay = () => run(async () => {
    if (!booking) return;
    const result = await payBooking(booking.id, failPayment);
    setBooking(result); await refreshBookings(); await loadSeats();
  });
  const release = () => run(async () => {
    if (!booking) return;
    await cancelHeldBooking(booking.id); setBooking(null); setSelected([]); setQuantities({}); key.current = null;
    await refreshBookings(); await loadSeats();
  });
  if (sessionLoading) return <p className="p-12" role="status">Restoring your session…</p>;
  if (!user) return <div className="mx-auto max-w-xl p-12 text-center"><h1 className="font-brand text-3xl">Sign in to book tickets</h1><Link to="/login" state={{ returnTo: `/events/${id}` }}><Button className="mt-5">Sign in</Button></Link></div>;
  if (loading) return <p className="p-12" role="status">Loading event and seats…</p>;
  if (!event) return <div className="p-12"><p role="alert">{error || "Event not found."}</p><Link to="/events">Back to events</Link></div>;
  return <div className="mx-auto max-w-7xl px-5 py-10">
    <div className="relative mb-8 h-64 overflow-hidden rounded-3xl">
      <img src={event.imageUrl ?? "/event-placeholder.svg"} alt={event.title} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/70 to-transparent" />
    </div>
    <Badge tone="accent">Ticketing & checkout</Badge>
    <h1 className="mt-3 font-brand text-4xl font-bold text-brand-deep">{event.title}</h1>
    <p className="mt-3 flex flex-wrap gap-5 text-sm text-muted"><span className="flex gap-2"><Calendar className="h-4 w-4"/>{fmtDate(event.startAt)}</span><span className="flex gap-2"><MapPin className="h-4 w-4"/>{event.venueName}</span></p>
    <p className="mt-4 max-w-3xl text-muted">{event.description}</p>
    <div className="mt-5 flex flex-wrap gap-3"><Link to="/community"><Button variant="outline">Event community & venue views</Button></Link></div>
    {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-danger">{error}</div>}
    {booking?.status === "CONFIRMED" ? <Card className="mt-8 p-7">
      <ShieldCheck className="h-8 w-8 text-emerald-600"/><h2 className="mt-3 font-brand text-2xl font-bold">Booking confirmed</h2>
      <p className="mt-2 text-sm">Reference: {booking.id} · Paid {currency(booking.totalCents/100)}</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-3">{booking.tickets.map(t => <div key={t.id} className="rounded-xl border p-5 text-center"><h3 className="mb-4 font-bold">Seat {t.seatLabel ?? "General Admission"}</h3><div className="mx-auto w-max"><QRCode value={ticketPayload(t.code)}/></div><Link className="mt-3 inline-block text-sm text-brand-purple underline" to={`/verify/${encodeURIComponent(t.code)}`}>Verify ticket</Link></div>)}</div>
      <Link to="/dashboard/customer"><Button className="mt-6"><Ticket className="h-4 w-4"/> My tickets</Button></Link>
      <Link to="/community?tab=exchange&view=create"><Button className="ml-3 mt-6" variant="outline">Exchange a ticket</Button></Link>
    </Card> : <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_360px]">
      <Card className="p-6"><h2 className="font-brand text-2xl font-bold">Choose your seats</h2><p className="my-4 text-sm text-muted">Availability refreshes every 5 seconds. Your selection is reserved when you continue to checkout.</p>
        {seats.length ? <SeatMap seats={seats} selected={selected} disabled={busy || !!booking || user.role !== "customer"} onToggle={s => {
          setSelected(current => current.includes(s.id) ? current.filter(i => i !== s.id) : current.length < event.purchaseLimitPerEvent ? [...current,s.id] : current); key.current = null;
        }}/> : event.purchasable ? <div className="space-y-4"><p className="text-sm text-muted">This event sells tickets by category. No assigned seats are configured.</p>{event.ticketCategories.map(c => <label key={c.id} className="flex items-center justify-between gap-4 rounded-xl border p-4"><span>{c.name} · {currency(c.priceCents / 100)}<span className="block text-xs text-muted">{c.remaining} remaining</span></span><input aria-label={`${c.name} quantity`} className="w-20 rounded border p-2" type="number" min={0} max={Math.min(c.remaining, event.purchaseLimitPerEvent)} value={quantities[c.id] ?? 0} disabled={!c.onSale || busy || !!booking || user.role !== "customer"} onChange={e => { setQuantities(current => ({ ...current, [c.id]: Math.max(0, Math.min(Math.floor(Number(e.target.value)), c.remaining, event.purchaseLimitPerEvent)) })); key.current = null; }} /></label>)}</div> : <p>Tickets for this event are sold by the event provider. {event.externalUrl && <a className="text-brand-purple underline" href={event.externalUrl} target="_blank" rel="noreferrer">Visit official ticket site</a>}</p>}
      </Card>
      <Card className="h-max space-y-4 p-6"><h2 className="font-brand text-2xl font-bold">{booking ? "Checkout" : "Your selection"}</h2>
        <ul className="space-y-2 text-sm">{chosen.map(s => <li key={s.id}>{s.label} · {s.categoryName} · {currency(s.priceCents/100)}</li>)}</ul>
        {!seats.length && <ul className="text-sm">{categoryItems.map(item => <li key={item.ticketCategoryId}>{event.ticketCategories.find(c => c.id === item.ticketCategoryId)?.name} × {item.quantity}</li>)}</ul>}
        <p className="flex justify-between font-bold"><span>{booking ? "Total" : "Estimated total"}</span><span>{currency(booking ? booking.totalCents/100 : estimated)}</span></p>
        <p className="text-xs text-muted">Prices include all configured charges.</p>
        {booking ? <>
          <p className="text-sm" role="status">{expired ? "Your hold expired. Release it and select seats again." : `Reserved for ${Math.max(0, Math.ceil((Date.parse(booking.holdExpiresAt ?? "") - now)/1000))} seconds.`}</p>
          <label className="block text-sm">Simulated payment result<select className="mt-2 w-full rounded-lg border p-2" value={failPayment ? "fail" : "success"} onChange={e => setFailPayment(e.target.value === "fail")}><option value="success">Success — no real charge</option><option value="fail">Declined — test retry</option></select></label>
          <Button className="w-full" disabled={busy || expired} onClick={pay}>{busy ? "Processing…" : "Confirm simulated payment"}</Button>
          <Button className="w-full" variant="outline" disabled={busy} onClick={release}>Release reservation</Button>
        </> : <><p className="text-xs text-muted">Up to {event.purchaseLimitPerEvent} tickets per customer for this event.</p><Button className="w-full" disabled={busy || !count || count > event.purchaseLimitPerEvent || user.role !== "customer"} onClick={reserve}>{busy ? "Reserving…" : "Reserve & continue"}</Button></>}
      </Card>
    </div>}
  </div>;
}
