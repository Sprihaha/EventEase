import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  LayoutDashboard,
  History,
  QrCode,
  X,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useStore, currency, fmtDate } from "../lib/store";
import { fetchOwnedTickets, payBooking, type OwnedTicket } from "../lib/ticketingApi";
import { getExchangeActivity, type ExchangeActivity } from "../lib/exchangeApi";
import { DashboardShell, type NavItem } from "../components/DashboardShell";
import { QRCode, ticketPayload, Button, Badge, Card, cx, Select } from "../components/ui";

const nav: NavItem[] = [
  { id: "tickets", label: "Dashboard", icon: LayoutDashboard },
  { id: "history", label: "Booking history", icon: History },
  { id: "easexchange", label: "EaseXchange", icon: ArrowLeftRight, to: "/community?tab=exchange" },
];

const exchangeMessages: Record<string, string> = {
  EXCHANGE_OPEN: "Exchange request open",
  EXCHANGE_MATCHED: "Proposal received — review tickets",
  EXCHANGE_PENDING: "Proposal pending review",
  EXCHANGE_ACCEPTED: "Proposal accepted",
  EXCHANGE_READY: "Both accepted — awaiting difference payment",
  EXCHANGE_PAYMENT_REQUIRED: "Price difference payment required",
  EXCHANGE_PAYMENT_PENDING: "Payment pending — tickets unchanged",
  EXCHANGE_PAYMENT_CANCELLED: "Payment cancelled — tickets unchanged",
  EXCHANGE_SETTLEMENT_FAILED: "Settlement declined — tickets unchanged",
  EXCHANGE_COMPLETED: "Exchange completed",
  EXCHANGE_REJECTED: "Exchange rejected",
  EXCHANGE_CANCELLED: "Exchange cancelled",
  EXCHANGE_EXPIRED: "Exchange expired",
};

export type TicketCategoryFilter = "all" | "active" | "upcoming" | "used" | "exchanged" | "expired";

function getTicketStatus(t: OwnedTicket): {
  key: "upcoming" | "used" | "exchanged" | "expired";
  label: string;
  tone: "live" | "neutral" | "warn" | "danger";
  description: string;
} {
  const isPast = Date.parse(t.event.endAt ?? t.event.startAt) <= Date.now();
  if (t.checkedInAt) {
    return {
      key: "used",
      label: "Used / Admitted",
      tone: "neutral",
      description: `Admitted on ${new Date(t.checkedInAt).toLocaleString("en-SG")}.`,
    };
  }
  if (isPast) {
    return {
      key: "expired",
      label: "Expired",
      tone: "danger",
      description: "Event has concluded.",
    };
  }
  if (t.status === "VALID" || t.status === "EXCHANGED") {
    return {
      key: "upcoming",
      label: t.code ? "ACTIVE" : "Confirmed",
      tone: "live",
      description: t.code
        ? "Ready for admission"
        : t.qrAvailableFrom
          ? `Your QR code will be available from ${fmtDate(t.qrAvailableFrom)}`
          : "Booking confirmed",
    };
  }
  return {
    key: "expired",
    label: t.status,
    tone: "neutral",
    description: "Ticket inactive",
  };
}

export default function CustomerDashboard() {
  const [exchangeParams] = useSearchParams();
  const { user, sessionLoading, bookings, bookingsError, refreshBookings } = useStore();
  const [tickets, setTickets] = useState<OwnedTicket[]>([]);
  const [exchangeActivity, setExchangeActivity] = useState<ExchangeActivity[]>([]);
  const [qr, setQr] = useState<OwnedTicket | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Ticket filtering & pagination states
  const [ticketFilter, setTicketFilter] = useState<TicketCategoryFilter>("all");
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketPageSize, setTicketPageSize] = useState(10);

  // Booking history unified pagination & filter states
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyFilter, setHistoryFilter] = useState<"all" | "booking" | "exchange">("all");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user || user.role !== "customer") return;
    try {
      const [ticketResult, exchangeResult] = await Promise.all([
        fetchOwnedTickets(signal),
        getExchangeActivity(signal).catch(() => [] as ExchangeActivity[]),
      ]);
      if (!signal?.aborted) {
        setTickets(ticketResult);
        setExchangeActivity(exchangeResult);
        setQr((current) => (current ? ticketResult.find((t) => t.id === current.id) ?? null : null));
      }
    } catch (cause) {
      if (!signal?.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not load tickets.");
      }
    }
  }, [user?.id]);

  useEffect(() => {
    setTickets([]);
    setExchangeActivity([]);
    setQr(null);
    setError("");
    if (!user || user.role !== "customer") {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    const refresh = () => {
      void load(controller.signal).catch(() => {});
      void refreshBookings();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("business-date-changed", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("business-date-changed", refresh);
    };
  }, [user?.id, load]);

  const act = async (id: string, operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      await operation();
      await Promise.all([refreshBookings(), load()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action not confirmed. Refresh to check the current state.");
    } finally {
      setBusy(null);
    }
  };

  if (sessionLoading) return <p className="p-10" role="status">Restoring your session…</p>;
  if (!user || user.role !== "customer")
    return (
      <div className="p-10">
        <p>Sign in as a customer to view your tickets.</p>
        <Link to="/login">
          <Button className="mt-4">Sign in</Button>
        </Link>
      </div>
    );

  const mine = bookings.filter((b) => b.userId === user.id);
  const eventPassed = (date?: string) => !!date && Date.parse(date) <= Date.now();

  // Classified tickets with their computed statuses
  const classifiedTickets = tickets.map((t) => ({
    ticket: t,
    status: getTicketStatus(t),
    isExchanged: Boolean(t.exchangedAt || t.status === "EXCHANGED"),
  }));
  const activeTickets = classifiedTickets.filter((c) => c.status.label === "ACTIVE");
  const upcomingTickets = classifiedTickets.filter((c) => c.status.label === "Confirmed");
  const usedTickets = classifiedTickets.filter((c) => c.status.key === "used");
  const exchangedTickets = classifiedTickets.filter((c) => c.isExchanged);
  const expiredTickets = classifiedTickets.filter((c) => c.status.key === "expired");

  // Sorted classified tickets for "all": upcoming/active tickets first, then by event start date
  const allTicketsSorted = useMemo(() => {
    return [...classifiedTickets].sort((a, b) => {
      const aUpcoming = a.status.key === "upcoming" ? 1 : 0;
      const bUpcoming = b.status.key === "upcoming" ? 1 : 0;
      if (aUpcoming !== bUpcoming) return bUpcoming - aUpcoming;
      return Date.parse(b.ticket.event?.startAt || "") - Date.parse(a.ticket.event?.startAt || "");
    });
  }, [classifiedTickets]);

  // Filtered ticket view
  const displayedTickets =
    ticketFilter === "active"
      ? activeTickets
      : ticketFilter === "upcoming"
        ? upcomingTickets
        : ticketFilter === "used"
          ? usedTickets
          : ticketFilter === "exchanged"
            ? exchangedTickets
            : ticketFilter === "expired"
              ? expiredTickets
              : allTicketsSorted;

  const totalTicketPages = Math.max(1, Math.ceil(displayedTickets.length / ticketPageSize));
  const currentTicketPage = Math.min(ticketPage, totalTicketPages);
  const firstTicketShown = (currentTicketPage - 1) * ticketPageSize;
  const paginatedTickets = displayedTickets.slice(
    firstTicketShown,
    firstTicketShown + ticketPageSize,
  );

  // Unified Booking & Exchange History
  type UnifiedHistoryRow = {
    id: string;
    type: "booking" | "exchange";
    date: string;
    title: string;
    ref: string;
    amount: string;
    status: string;
    tone: "live" | "neutral" | "warn" | "danger" | "accent";
    actionLabel?: string;
    actionUrl?: string;
    bookingId?: string;
    bookingStatus?: string;
    eventDate?: string;
  };

  const bookingRows: UnifiedHistoryRow[] = mine.map((b) => ({
    id: `b-${b.id}`,
    type: "booking",
    date: b.purchasedAt || new Date().toISOString(),
    title: b.event?.title ?? "Event Booking",
    ref: b.id,
    amount: currency(b.total),
    status: b.status.replace(/_/g, " ").toUpperCase(),
    tone:
      b.status === "confirmed"
        ? "live"
        : b.status === "pending_payment"
          ? "warn"
          : b.status === "cancelled" || b.status === "refunded"
            ? "danger"
            : "neutral",
    bookingId: b.id,
    bookingStatus: b.status,
    eventDate: b.event?.date,
  }));

  const exchangeRows: UnifiedHistoryRow[] = exchangeActivity.map((item) => ({
    id: `e-${item.id}`,
    type: "exchange",
    date: item.createdAt,
    title: item.eventName,
    ref: item.matchId ? `Match ${item.matchId.slice(0, 8)}` : `Req ${item.id.slice(0, 8)}`,
    amount: "–",
    status: exchangeMessages[item.action] ?? item.action.replace(/_/g, " "),
    tone:
      item.action === "EXCHANGE_COMPLETED"
        ? "live"
        : item.action === "EXCHANGE_CANCELLED" || item.action === "EXCHANGE_REJECTED" || item.action === "EXCHANGE_EXPIRED"
          ? "danger"
          : "accent",
    actionLabel: item.action === "EXCHANGE_COMPLETED" ? "View in Tickets" : "View proposal",
    actionUrl:
      item.action === "EXCHANGE_COMPLETED"
        ? "/dashboard/customer"
        : item.matchId
          ? `/community?tab=exchange&view=mine&match=${encodeURIComponent(item.matchId)}`
          : `/community?tab=exchange&view=${item.ownAction ? "mine" : "invitations"}`,
  }));

  const allHistoryRows = useMemo(() => {
    const combined = [...bookingRows, ...exchangeRows];
    combined.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    if (historyFilter === "booking") return combined.filter((r) => r.type === "booking");
    if (historyFilter === "exchange") return combined.filter((r) => r.type === "exchange");
    return combined;
  }, [bookingRows, exchangeRows, historyFilter]);

  const totalHistoryPages = Math.max(1, Math.ceil(allHistoryRows.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedHistoryRows = allHistoryRows.slice(
    (currentHistoryPage - 1) * historyPageSize,
    currentHistoryPage * historyPageSize,
  );

  const renderTicketCard = (item: (typeof classifiedTickets)[0]) => {
    const { ticket: t, status: st, isExchanged } = item;
    const canExchange =
      st.key === "upcoming" &&
      (t.status === "VALID" || t.status === "EXCHANGED") &&
      !t.checkedInAt &&
      !t.code &&
      !t.exchangedAt &&
      Date.parse(t.event.startAt) - 7 * 24 * 60 * 60 * 1000 > Date.now() &&
      !eventPassed(t.event.endAt ?? t.event.startAt);

    return (
      <Card key={t.id} className="flex flex-col gap-4 p-6 transition-shadow hover:shadow-md">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {isExchanged && <Badge tone="accent">Exchanged</Badge>}
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="text-xs text-muted">ID: {t.id.slice(0, 8)}</span>
          </div>
          <h2 className="font-brand text-xl font-bold text-brand-deep">{t.event.title}</h2>
          <p className="text-sm text-muted">
            {fmtDate(t.event.startAt)} · {t.event.venueName}
          </p>
          <p className="font-semibold text-brand-deep">
            {t.seatLabel ?? "General Admission"} · {t.categoryName} · {t.seatSection}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>Price: {currency(t.unitPriceCents / 100)}</span>
            <span>•</span>
            <span className="font-medium text-emerald-800">Non-refundable policy</span>
          </div>
          {!t.code && t.qrAvailableFrom && st.key === "upcoming" && (
            <p className="text-xs text-muted italic">Your QR code will be available from {fmtDate(t.qrAvailableFrom)}.</p>
          )}
          {st.key !== "upcoming" && <p className="text-xs font-medium text-muted">{st.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-line/60">
          <Button
            disabled={!t.code || (t.status !== "VALID" && t.status !== "EXCHANGED") || (t.bookingStatus && t.bookingStatus !== "CONFIRMED" && t.status !== "EXCHANGED") || !!t.checkedInAt}
            onClick={() => setQr(t)}
          >
            <QrCode className="h-4 w-4" /> Show ticket
          </Button>
          {canExchange && (
            <Link to={`/community?tab=exchange&view=create&ticket=${encodeURIComponent(t.id)}`}>
              <Button variant="outline">
                <ArrowLeftRight className="h-4 w-4" /> Exchange ticket
              </Button>
            </Link>
          )}
        </div>
      </Card>
    );
  };

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
          <Button variant="outline" disabled={!!busy} onClick={() => act("refresh", async () => {})}>
            Refresh tickets & bookings
          </Button>
        ) : null
      }
    >
      {(active) => (
        <>
          {active === "tickets" && (
            <div className="space-y-6">
              {exchangeParams.get("exchange") === "completed" && <p role="status" className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-900">Exchange completed. Your received tickets are now in My Tickets.</p>}
              {(error || bookingsError) && (
                <p role="alert" className="rounded-xl bg-rose-50 p-4 text-danger">
                  {error || bookingsError}
                </p>
              )}

              {/* Strict Non-Refundable & Single Exchange Notice */}
              <div className="rounded-2xl border border-brand-purple/20 bg-brand-lilac/30 p-4 text-xs text-brand-deep flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 shrink-0 text-brand-purple mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-sm text-brand-purple">Ticketing Policy Reminder</p>
                  <p>
                    All ticket sales are final and strictly <strong>non-refundable</strong>. Tickets cannot be returned once confirmed.
                    Tickets are eligible for a <strong>one-time exchange</strong> via EaseXchange before ticket sales close.
                  </p>
                </div>
              </div>

              {/* Ticket Filter Tab Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: "all", label: "All Tickets", count: classifiedTickets.length },
                      { key: "active", label: "Active", count: activeTickets.length },
                      { key: "upcoming", label: "Upcoming / Confirmed", count: upcomingTickets.length },
                      { key: "used", label: "Used / Admitted", count: usedTickets.length },
                      { key: "exchanged", label: "Exchanged", count: exchangedTickets.length },
                      { key: "expired", label: "Expired", count: expiredTickets.length },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setTicketFilter(tab.key);
                        setTicketPage(1);
                      }}
                      className={cx(
                        "rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                        ticketFilter === tab.key
                          ? "bg-brand-purple text-white shadow-xs"
                          : "bg-mist/70 text-brand-deep hover:bg-mist",
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cx(
                          "rounded-full px-1.5 py-0.2 text-[10px]",
                          ticketFilter === tab.key ? "bg-white/20 text-white" : "bg-black/5 text-muted",
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {loading && <p role="status">Loading tickets…</p>}

              {!loading && !classifiedTickets.length && (
                <Card className="p-8 text-center">
                  <p className="text-muted">You have no tickets yet.</p>
                  <Link to="/events">
                    <Button className="mt-4">Browse events</Button>
                  </Link>
                </Card>
              )}

              {/* Tickets Summary & Per-Page Controls */}
              {!loading && classifiedTickets.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-muted">
                  <span>
                    {displayedTickets.length
                      ? `Showing ${firstTicketShown + 1}–${firstTicketShown + paginatedTickets.length} of ${displayedTickets.length} ${displayedTickets.length === 1 ? "ticket" : "tickets"}`
                      : "Showing 0 tickets"}
                  </span>

                  <label className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted">Per page</span>
                    <span className="w-24">
                      <Select
                        aria-label="Tickets per page"
                        value={String(ticketPageSize)}
                        onChange={(e) => {
                          setTicketPageSize(Number(e.target.value));
                          setTicketPage(1);
                        }}
                      >
                        {[10, 20, 50].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </Select>
                    </span>
                  </label>
                </div>
              )}

              {/* Paginated Tickets Display */}
              {!loading && classifiedTickets.length > 0 && (
                displayedTickets.length === 0 ? (
                  <Card className="p-8 text-center text-sm text-muted">
                    No tickets match the "{ticketFilter === "upcoming" ? "Upcoming / Confirmed" : ticketFilter}" filter.
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {paginatedTickets.map(renderTicketCard)}
                  </div>
                )
              )}

              {/* Discover-Style Bottom Pagination Navigation */}
              {!loading && totalTicketPages > 1 && (
                <nav aria-label="Ticket pages" className="mt-8 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Previous page"
                    disabled={currentTicketPage === 1}
                    onClick={() => {
                      setTicketPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalTicketPages }, (_, index) => index + 1).map((number) => (
                    <Button
                      key={number}
                      size="sm"
                      variant={number === currentTicketPage ? "primary" : "ghost"}
                      aria-current={number === currentTicketPage ? "page" : undefined}
                      onClick={() => {
                        setTicketPage(number);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      {number}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Next page"
                    disabled={currentTicketPage === totalTicketPages}
                    onClick={() => {
                      setTicketPage((p) => Math.min(totalTicketPages, p + 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              )}
            </div>
          )}

          {/* COMBINED 1 TABLE BOOKING & EXCHANGE HISTORY WITH PAGINATION */}
          {active === "history" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-brand text-xl font-bold text-brand-deep">Unified Activity & Booking History</h3>
                <p className="text-xs text-muted mt-0.5">
                  All your ticket purchases, reservations, and EaseXchange transactions combined in one chronological table.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-muted">
                <span>
                  {allHistoryRows.length
                    ? `Showing ${(currentHistoryPage - 1) * historyPageSize + 1}–${Math.min(currentHistoryPage * historyPageSize, allHistoryRows.length)} of ${allHistoryRows.length} ${allHistoryRows.length === 1 ? "activity" : "activities"}`
                    : "Showing 0 activities"}
                </span>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted">Filter</span>
                    <span className="w-40">
                      <Select
                        aria-label="Filter activity"
                        value={historyFilter}
                        onChange={(e) => {
                          setHistoryFilter(e.target.value as "all" | "booking" | "exchange");
                          setHistoryPage(1);
                        }}
                      >
                        <option value="all">All ({bookingRows.length + exchangeRows.length})</option>
                        <option value="booking">Bookings ({bookingRows.length})</option>
                        <option value="exchange">Exchanges ({exchangeRows.length})</option>
                      </Select>
                    </span>
                  </label>

                  <label className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted">Per page</span>
                    <span className="w-24">
                      <Select
                        aria-label="Activities per page"
                        value={String(historyPageSize)}
                        onChange={(e) => {
                          setHistoryPageSize(Number(e.target.value));
                          setHistoryPage(1);
                        }}
                      >
                        {[10, 20, 50].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </Select>
                    </span>
                  </label>
                </div>
              </div>

              <Card className="overflow-x-auto p-0 border border-line shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-mist/60 text-xs font-bold uppercase tracking-wider text-muted border-b border-line">
                    <tr>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Event & Reference</th>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {paginatedHistoryRows.map((row) => (
                      <tr key={row.id} className="hover:bg-mist/30 transition-colors">
                        <td className="p-3.5 whitespace-nowrap">
                          {row.type === "booking" ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-brand-purple/10 px-2 py-0.5 text-xs font-bold text-brand-purple">
                              Booking
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-brand-orange/15 px-2 py-0.5 text-xs font-bold text-brand-deep">
                              <ArrowLeftRight className="h-3 w-3 text-brand-orange" /> Exchange
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-brand-deep">{row.title}</div>
                          <div className="font-mono text-xs text-muted truncate max-w-xs">{row.ref}</div>
                        </td>
                        <td className="p-3.5 text-xs text-muted whitespace-nowrap">
                          {fmtDate(row.date)}
                        </td>
                        <td className="p-3.5 whitespace-nowrap font-medium">{row.amount}</td>
                        <td className="p-3.5 whitespace-nowrap">
                          <Badge tone={row.tone}>{row.status}</Badge>
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap text-xs">
                          {row.type === "booking" && (
                            <>
                              {row.bookingStatus === "confirmed" && (
                                eventPassed(row.eventDate) ? (
                                  <span className="text-muted" title="Event has ended">Event passed</span>
                                ) : (
                                  <Link className="text-brand-purple font-semibold underline" to={`/assistance/request/${row.bookingId}`}>
                                    Request assistance
                                  </Link>
                                )
                              )}
                              {row.bookingStatus === "pending_payment" && (
                                <Button
                                  size="sm"
                                  disabled={!!busy}
                                  onClick={() => act(row.bookingId!, () => payBooking(row.bookingId!))}
                                >
                                  Resume payment
                                </Button>
                              )}
                            </>
                          )}
                          {row.type === "exchange" && row.actionUrl && (
                            <Link className="text-brand-purple font-semibold underline" to={row.actionUrl}>
                              {row.actionLabel ?? "View exchange"}
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!allHistoryRows.length && (
                  <div className="p-8 text-center text-sm text-muted">No booking or exchange history found.</div>
                )}
              </Card>

              {totalHistoryPages > 1 && (
                <nav aria-label="Booking history pages" className="mt-8 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Previous page"
                    disabled={currentHistoryPage === 1}
                    onClick={() => {
                      setHistoryPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalHistoryPages }, (_, index) => index + 1).map((number) => (
                    <Button
                      key={number}
                      size="sm"
                      variant={number === currentHistoryPage ? "primary" : "ghost"}
                      aria-current={number === currentHistoryPage ? "page" : undefined}
                      onClick={() => {
                        setHistoryPage(number);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      {number}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Next page"
                    disabled={currentHistoryPage === totalHistoryPages}
                    onClick={() => {
                      setHistoryPage((p) => Math.min(totalHistoryPages, p + 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              )}
            </div>
          )}

          {/* QR Code Dialog Modal */}
          {qr?.code && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Digital ticket"
              className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-5"
            >
              <Card className="relative w-full max-w-md p-7 text-center">
                <button
                  aria-label="Close ticket"
                  className="absolute right-4 top-4 cursor-pointer text-muted hover:text-brand-deep"
                  onClick={() => setQr(null)}
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 className="font-brand text-2xl font-bold">{qr.event.title}</h2>
                <p className="my-4 font-semibold text-brand-deep">
                  Seat {qr.seatLabel ?? "General Admission"} · {qr.categoryName}
                </p>
                <div className="mx-auto w-max">
                  <QRCode value={ticketPayload(qr.code)} size={180} />
                </div>
                <Link className="mt-5 block text-brand-purple underline font-semibold" to={`/verify/${encodeURIComponent(qr.code)}`}>
                  Open verification page
                </Link>
                <p className="mt-3 break-all text-xs text-muted font-mono">{qr.code}</p>
                <div className="mt-4 rounded-lg bg-mist/60 p-2 text-[11px] text-muted">
                  Strictly non-refundable · One-time admission per gate scan
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
