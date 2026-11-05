import { useCallback, useEffect, useRef, useState } from "react";
import EventImage from "../components/common/EventImage";
import { Link, useParams } from "react-router";
import { Calendar, MapPin, Ticket, ShieldCheck, Accessibility } from "lucide-react";
import { useStore, currency, fmtDate } from "../lib/store";
import { fetchTicketingEvent, fetchSeats, holdSeats, holdCategories, payBooking, cancelHeldBooking,
  type BackendBooking, type LiveSeat, type TicketingEvent } from "../lib/ticketingApi";
import { checkPromoCode, discountedCents } from "../lib/promoApi";
import { SeatMap } from "../components/SeatMap";
import { Badge, Button, Card, QRCode, ticketPayload, cx } from "../components/ui";
import { SEO } from "../components/common";

export default function EventDetail() {
  const { id = "" } = useParams();
  const { user, sessionLoading, refreshBookings, publicEvents } = useStore();
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
  // Organiser promo code: checked when the customer presses Apply, then sent with the reservation.
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; percentOff: number } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [checkingPromo, setCheckingPromo] = useState(false);
  const submitting = useRef(false);
  const key = useRef<string | null>(null);
  const identity = useRef(`${id}:${user?.id}`);
  identity.current = `${id}:${user?.id}`;
  const loadSeats = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchSeats(id, signal);
    if (!signal?.aborted) {
      const hasAccessible = result.some(s => s.isAccessible);
      const enhanced = hasAccessible
        ? result
        : result.map(s => ({
            ...s,
            isAccessible: s.isAccessible || (s.row.toUpperCase() === "A" && (s.number === 1 || s.number === 2)),
          }));
      setSeats(enhanced);
    }
  }, [id]);
  useEffect(() => {
    setEvent(null); setBooking(null); setSelected([]); setQuantities({}); setError(""); key.current = null;
    setPromo(null); setPromoInput(""); setPromoError("");
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
  const isPast = (!!event?.endAt && Date.parse(event.endAt) <= now) || (!!event?.startAt && Date.parse(event.startAt) <= now && !event?.endAt);
  const salesPaused = !!event?.salesPaused;
  const salesClosed = isPast || salesPaused || (!!event?.salesCloseAt && Date.parse(event.salesCloseAt) <= now);
  const categoryItems = (event?.ticketCategories ?? []).filter(c => (quantities[c.id] ?? 0) > 0).map(c => ({ ticketCategoryId: c.id, quantity: quantities[c.id] }));
  const count = seats.length ? chosen.length : categoryItems.reduce((sum, item) => sum + item.quantity, 0);
  const estimated = seats.length ? chosen.reduce((total, s) => total + s.priceCents, 0) / 100 : (event?.ticketCategories ?? []).reduce((sum, c) => sum + c.priceCents * (quantities[c.id] ?? 0), 0) / 100;
  // Same per-ticket rounding as the server, so the estimate matches what is charged.
  const savingCents = !promo ? 0 : seats.length
    ? chosen.reduce((sum, s) => sum + s.priceCents - discountedCents(s.priceCents, promo.percentOff), 0)
    : (event?.ticketCategories ?? []).reduce((sum, c) => sum + (c.priceCents - discountedCents(c.priceCents, promo.percentOff)) * (quantities[c.id] ?? 0), 0);
  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code) return;
    setCheckingPromo(true); setPromoError("");
    try { setPromo(await checkPromoCode(id, code)); key.current = null; }
    catch (cause) { setPromo(null); const message = cause instanceof Error ? cause.message : "This promo code could not be checked.";
      setPromoError(message.charAt(0).toUpperCase() + message.slice(1)); }
    finally { setCheckingPromo(false); }
  };
  const removePromo = () => { setPromo(null); setPromoInput(""); setPromoError(""); key.current = null; };
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
    const result = seats.length ? await holdSeats(id, chosen, key.current, promo?.code) : await holdCategories(id, categoryItems, key.current, promo?.code);
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
    setPromo(null); setPromoInput("");
    await refreshBookings(); await loadSeats();
  });

  const publicEv = publicEvents.find(e => e.id === id);
  const displayTitle = event?.title ?? publicEv?.title;
  const displayDesc = event?.description ?? publicEv?.blurb ?? "View event details, seat map and ticketing information.";
  const displayVenue = event?.venueName ?? publicEv?.venue ?? "Singapore";
  const displayImage = event?.imageUrl ?? publicEv?.image ?? "/EventEase_logo.png";
  const displayDate = event?.startAt ?? publicEv?.date;

  const eventStructuredData = displayTitle ? {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": displayTitle,
    "description": displayDesc,
    "startDate": displayDate,
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "location": {
      "@type": "Place",
      "name": displayVenue,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Singapore",
        "addressCountry": "SG"
      }
    },
    "image": [displayImage.startsWith("http") ? displayImage : `https://eventease-frontend.onrender.com${displayImage.startsWith("/") ? "" : "/"}${displayImage}`],
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "SGD",
      "availability": "https://schema.org/InStock",
      "url": `https://eventease-frontend.onrender.com/events/${id}`
    }
  } : undefined;

  const seoComponent = (
    <SEO
      title={displayTitle ? `${displayTitle} - Tickets & Info` : "Event Details"}
      description={displayDesc}
      canonicalPath={`/events/${id}`}
      image={displayImage}
      type="event"
      structuredData={eventStructuredData}
    />
  );

  if (sessionLoading) return <><SEO title="Event Details" canonicalPath={`/events/${id}`} /><p className="p-12" role="status">Restoring your session…</p></>;
  if (!user) return <div className="mx-auto max-w-xl p-12 text-center">{seoComponent}<h1 className="font-brand text-3xl">Sign in to book tickets</h1><Link to="/login" state={{ returnTo: `/events/${id}` }}><Button className="mt-5">Sign in</Button></Link></div>;
  if (loading) return <><SEO title={displayTitle ? `${displayTitle} - Tickets & Info` : "Event Details"} canonicalPath={`/events/${id}`} /><p className="p-12" role="status">Loading event and seats…</p></>;
  if (!event) return <div className="p-12">{seoComponent}<p role="alert">{error || "Event not found."}</p><Link to="/events">Back to events</Link></div>;
  return <div className="mx-auto max-w-7xl px-5 py-10">
    {seoComponent}
    <div className="relative mb-8 h-64 overflow-hidden rounded-3xl">
      <EventImage src={event.imageUrl} alt={event.title} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/70 to-transparent" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="accent">Ticketing & checkout</Badge>
      {event.imported && <Badge tone="neutral">Imported by System</Badge>}
      {user.role === "organizer" && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100/90 px-3 py-1 text-xs font-bold text-amber-900 shadow-xs">
          <span>⚠️</span>
          <span>Organizers are not allowed to purchase a ticket</span>
        </span>
      )}
    </div>
    <h1 className="mt-3 font-brand text-4xl font-bold text-brand-deep">{event.title}</h1>
    {event.organisationName && <p className="mt-1 text-sm font-medium text-muted">Organised by {event.organisationName}</p>}
    <p className="mt-3 flex flex-wrap gap-5 text-sm text-muted"><span className="flex gap-2"><Calendar className="h-4 w-4"/>{fmtDate(event.startAt)}</span><span className="flex gap-2"><MapPin className="h-4 w-4"/>{event.venueName}</span></p>
    <p className="mt-4 max-w-3xl text-muted">{event.description}</p>
    <div className="mt-5 flex flex-wrap gap-3"><Link to={`/community?tab=views&event=${encodeURIComponent(event.id)}`}><Button variant="outline">Event community & venue views</Button></Link></div>
    {user.role === "organizer" && (
      <div
        role="status"
        className="mt-5 rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-sm font-semibold text-amber-950 flex items-center gap-3 shadow-xs"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 font-bold text-sm">
          ⚠️
        </span>
        <div>
          <span className="font-bold">Organizers are not allowed to purchase a ticket.</span> Seat selection and checkout controls are restricted.
        </div>
      </div>
    )}
    {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-danger">{error}</div>}
    {isPast && !booking && <div role="status" className="mt-5 rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm font-medium text-slate-800">This event took place on {fmtDate(event.startAt)}. It has ended.</div>}
    {!isPast && salesPaused && !booking && <div role="status" className="mt-5 rounded-xl border border-brand-orange/30 bg-brand-orange/10 p-4 text-sm font-medium text-brand-deep">Ticket sales for this event are paused for now. Please check back later.</div>}
    {!isPast && !salesPaused && salesClosed && !booking && <div role="status" className="mt-5 rounded-xl border border-brand-orange/30 bg-brand-orange/10 p-4 text-sm font-medium text-brand-deep">Ticket sales closed on {fmtDate(event.salesCloseAt as string)}.</div>}
    {booking?.status === "CONFIRMED" ? <Card className="mt-8 p-7">
      <ShieldCheck className="h-8 w-8 text-emerald-600"/><h2 className="mt-3 font-brand text-2xl font-bold">Booking confirmed</h2>
      <p className="mt-2 text-sm">Reference: {booking.id} · Paid {currency(booking.totalCents/100)}{!!booking.discountCents && ` · Saved ${currency(booking.discountCents/100)} with ${booking.promoCode}`}</p>
      {!booking.qrReleased && <p role="status" className="mt-2 text-sm text-muted">Your QR tickets will be emailed to you{booking.qrAvailableFrom ? ` on ${fmtDate(booking.qrAvailableFrom)}` : ""}, when ticket sales close. Until then you can swap tickets on EaseXchange.</p>}
      <div className="mt-6 grid gap-5 sm:grid-cols-3">{booking.tickets.map(t => <div key={t.id} className="rounded-xl border p-5 text-center"><h3 className="mb-4 font-bold">Seat {t.seatLabel ?? "General Admission"}</h3>{t.code ? <><div className="mx-auto w-max"><QRCode value={ticketPayload(t.code)}/></div><Link className="mt-3 inline-block text-sm text-brand-purple underline" to={`/verify/${encodeURIComponent(t.code)}`}>Verify ticket</Link></> : <Badge tone="live">Confirmed</Badge>}</div>)}</div>
      <Link to="/dashboard/customer"><Button className="mt-6"><Ticket className="h-4 w-4"/> My tickets</Button></Link>
      {!booking.qrReleased && <Link to="/community?tab=exchange&view=create"><Button className="ml-3 mt-6" variant="outline">Exchange a ticket</Button></Link>}
    </Card> : <div className={cx(
      "mt-8 grid gap-7 lg:grid-cols-[1fr_360px] transition-all",
      user.role === "organizer" && "opacity-50 pointer-events-none select-none grayscale-[0.25]"
    )}>
      <Card className="p-6"><h2 className="font-brand text-2xl font-bold">Choose your seats</h2><p className="my-4 text-sm text-muted">Availability refreshes every 5 seconds. Your selection is reserved when you continue to checkout.</p>
        {seats.length ? <SeatMap seats={seats} selected={selected} disabled={busy || !!booking || salesClosed || isPast || user.role !== "customer"} onToggle={s => {
          setSelected(current => current.includes(s.id) ? current.filter(i => i !== s.id) : current.length < event.purchaseLimitPerEvent ? [...current,s.id] : current); key.current = null;
        }}/> : event.purchasable ? <div className="space-y-4"><p className="text-sm text-muted">This event sells tickets by category. No assigned seats are configured.</p>{event.ticketCategories.map(c => <label key={c.id} className="flex items-center justify-between gap-4 rounded-xl border p-4"><span>{c.name} · {currency(c.priceCents / 100)}<span className="block text-xs text-muted">{c.remaining} remaining</span></span><input aria-label={`${c.name} quantity`} className="w-20 rounded border p-2" type="number" min={0} max={Math.min(c.remaining, event.purchaseLimitPerEvent)} value={quantities[c.id] ?? 0} disabled={!c.onSale || busy || !!booking || salesClosed || isPast || user.role !== "customer"} onChange={e => { setQuantities(current => ({ ...current, [c.id]: Math.max(0, Math.min(Math.floor(Number(e.target.value)), c.remaining, event.purchaseLimitPerEvent)) })); key.current = null; }} /></label>)}</div> : <p>Tickets for this event are sold by the event provider. {event.externalUrl && <a className="text-brand-purple underline" href={event.externalUrl} target="_blank" rel="noreferrer">Visit official ticket site</a>}</p>}
      </Card>
      <Card className="h-max space-y-4 p-6"><h2 className="font-brand text-2xl font-bold">{booking ? "Checkout" : "Your selection"}</h2>
        <ul className="space-y-2 text-sm">
          {chosen.map(s => (
            <li key={s.id} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>{s.label} · {s.categoryName}</span>
                {s.isAccessible && (
                  <span className="inline-flex items-center gap-1 rounded bg-brand-purple/10 px-1.5 py-0.5 text-xs font-semibold text-brand-purple">
                    <Accessibility className="h-3 w-3" /> Accessible
                  </span>
                )}
              </span>
              <span>{currency(s.priceCents / 100)}</span>
            </li>
          ))}
        </ul>
        {!seats.length && <ul className="text-sm">{categoryItems.map(item => <li key={item.ticketCategoryId}>{event.ticketCategories.find(c => c.id === item.ticketCategoryId)?.name} × {item.quantity}</li>)}</ul>}
        {!booking && !salesClosed && user.role === "customer" && <div className="border-t border-line pt-4">
          {promo ? <p className="flex items-center justify-between gap-3 text-sm" role="status">
            <span><span className="font-mono font-semibold text-brand-purple">{promo.code}</span> applied · {promo.percentOff}% off each ticket</span>
            <button type="button" className="text-xs font-semibold text-brand-purple underline" onClick={removePromo}>Remove</button>
          </p> : <>
            <label htmlFor="promo-code" className="block text-sm font-semibold text-brand-deep">Promo code</label>
            <div className="mt-1.5 flex gap-2">
              <input id="promo-code" className="h-10 min-w-0 flex-1 rounded-lg border border-brand-purple/20 px-3 text-sm uppercase outline-none focus:border-brand-purple focus:ring-4 focus:ring-brand-purple/15"
                value={promoInput} maxLength={32} autoComplete="off" placeholder="Enter code"
                aria-invalid={!!promoError} aria-describedby={promoError ? "promo-error" : undefined}
                onChange={e => { setPromoInput(e.target.value); setPromoError(""); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void applyPromo(); } }} />
              <Button type="button" size="sm" variant="outline" disabled={!promoInput.trim() || checkingPromo || busy} onClick={applyPromo}>{checkingPromo ? "Checking…" : "Apply"}</Button>
            </div>
            {promoError && <p id="promo-error" role="alert" className="mt-1.5 text-xs font-semibold text-danger">{promoError}</p>}
          </>}
        </div>}
        {booking ? !!booking.discountCents && <p className="flex justify-between text-sm text-emerald-700"><span>Promo {booking.promoCode}</span><span>−{currency(booking.discountCents/100)}</span></p>
          : savingCents > 0 && <p className="flex justify-between text-sm text-emerald-700"><span>Promo {promo?.code}</span><span>−{currency(savingCents/100)}</span></p>}
        <p className="flex justify-between font-bold"><span>{booking ? "Total" : "Estimated total"}</span><span>{currency(booking ? booking.totalCents/100 : estimated - savingCents/100)}</span></p>
        <p className="text-xs text-muted">Prices include all configured charges. Tickets are non-refundable and cannot be returned once confirmed; single exchange eligible.</p>
        {booking ? <>
          <p className="text-sm" role="status">{expired ? "Your hold expired. Release it and select seats again." : (() => {
            const sec = Math.max(0, Math.ceil((Date.parse(booking.holdExpiresAt ?? "") - now) / 1000));
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            const timeStr = m > 0 ? `${m} min ${s < 10 ? "0" : ""}${s} sec` : `${s} seconds`;
            return `Reserved for ${timeStr}.`;
          })()}</p>
          <label className="block text-sm">Simulated payment result<select className="mt-2 w-full rounded-lg border p-2" value={failPayment ? "fail" : "success"} onChange={e => setFailPayment(e.target.value === "fail")}><option value="success">Success — no real charge</option><option value="fail">Declined — test retry</option></select></label>
          <Button className="w-full" disabled={busy || expired} onClick={pay}>{busy ? "Processing…" : "Confirm simulated payment"}</Button>
          <Button className="w-full" variant="outline" disabled={busy} onClick={release}>Release reservation</Button>
        </> : <><p className="text-xs text-muted">Up to {event.purchaseLimitPerEvent} tickets per customer for this event.</p><Button className="w-full" disabled={busy || !count || count > event.purchaseLimitPerEvent || salesClosed || user.role !== "customer"} onClick={reserve}>{user.role === "organizer" ? "Organizers cannot purchase tickets" : busy ? "Reserving…" : salesPaused ? "Sales paused" : salesClosed ? "Sales closed" : "Reserve & continue"}</Button></>}
      </Card>
    </div>}
  </div>;
}
