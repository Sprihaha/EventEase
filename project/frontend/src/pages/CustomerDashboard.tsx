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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useStore, currency, fmtDate } from "../lib/store";
import { fetchOwnedTickets, payBooking, type OwnedTicket } from "../lib/ticketingApi";
import { getExchangeActivity, type ExchangeActivity } from "../lib/exchangeApi";
import { DashboardShell, type NavItem } from "../components/DashboardShell";
import { QRCode, ticketPayload, Button, Badge, Card, cx } from "../components/ui";

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

export type TicketCategoryFilter = "all" | "upcoming" | "used" | "exchanged" | "expired";

function getTicketStatus(t: OwnedTicket): {
  key: "upcoming" | "used" | "exchanged" | "expired";
  label: string;
  tone: "live" | "neutral" | "warn" | "danger";
  description: string;
} {
  const isPast = Date.parse(t.event.endAt ?? t.event.startAt) <= Date.now();
  if (t.exchangedAt || t.status === "EXCHANGED") {
    return {
      key: "exchanged",
      label: "Exchanged",
      tone: "warn",
      description: "Exchanged via EaseXchange (One-time exchange completed).",
    };
  }
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
  if (t.status === "VALID") {
    return {
      key: "upcoming",
      label: t.code ? "Active (QR Issued)" : "Confirmed",
      tone: "live",
      description: t.code ? "Ready for admission" : (t.qrAvailableFrom ? `QR code releases on ${fmtDate(t.qrAvailableFrom)}` : "Booking confirmed"),
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

  // Ticket filtering & grouping states
  const [ticketFilter, setTicketFilter] = useState<TicketCategoryFilter>("all");
  const [lumpUsedOpen, setLumpUsedOpen] = useState(true);

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
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
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
  const classifiedTickets = tickets.map((t) => ({ ticket: t, status: getTicketStatus(t) }));
  const upcomingTickets = classifiedTickets.filter((c) => c.status.key === "upcoming");
  const usedTickets = classifiedTickets.filter((c) => c.status.key === "used");
  const exchangedTickets = classifiedTickets.filter((c) => c.status.key === "exchanged");
  const expiredTickets = classifiedTickets.filter((c) => c.status.key === "expired");
  const pastAndUsedTickets = classifiedTickets.filter((c) => c.status.key !== "upcoming");

  // Filtered ticket view
  const displayedTickets =
    ticketFilter === "upcoming"
      ? upcomingTickets
      : ticketFilter === "used"
        ? usedTickets
        : ticketFilter === "exchanged"
          ? exchangedTickets
          : ticketFilter === "expired"
            ? expiredTickets
            : classifiedTickets;

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
    const { ticket: t, status: st } = item;
    const canExchange =
      st.key === "upcoming" &&
      t.status === "VALID" &&
      !t.checkedInAt &&
      !t.code &&
      !t.exchangedAt &&
      Date.parse(t.event.startAt) - 7 * 24 * 60 * 60 * 1000 > Date.now() &&
      !eventPassed(t.event.endAt ?? t.event.startAt);

    return (
      <Card key={t.id} className="flex flex-wrap items-center justify-between gap-4 p-6 transition-shadow hover:shadow-md">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {t.exchangedAt && (
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                Single exchange used
              </span>
            )}
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
            <p className="text-xs text-muted italic">QR code releases on {fmtDate(t.qrAvailableFrom)}.</p>
          )}
          {st.key !== "upcoming" && <p className="text-xs font-medium text-muted">{st.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!t.code || t.status !== "VALID" || t.bookingStatus !== "CONFIRMED" || !!t.checkedInAt || !!t.exchangedAt}
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
          {t.exchangedAt && (
            <span className="text-xs text-muted italic px-2 py-1">Exchanged (Limit 1 per ticket)</span>
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
                      { key: "upcoming", label: "Upcoming", count: upcomingTickets.length },
                      { key: "used", label: "Used / Admitted", count: usedTickets.length },
                      { key: "exchanged", label: "Exchanged", count: exchangedTickets.length },
                      { key: "expired", label: "Expired", count: expiredTickets.length },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTicketFilter(tab.key)}
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

              {/* When Filter is "All": Display Upcoming Tickets on Top, Lump Past & Used Tickets Below */}
              {!loading && ticketFilter === "all" && classifiedTickets.length > 0 && (
                <div className="space-y-6">
                  {/* Section 1: Upcoming Active Tickets */}
                  <div className="space-y-4">
                    <h3 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2">
                      <span>Upcoming & Active Tickets</span>
                      <Badge tone="live">{upcomingTickets.length}</Badge>
                    </h3>
                    {upcomingTickets.length === 0 ? (
                      <Card className="p-6 text-sm text-muted">
                        No active upcoming tickets. Check below for past or used tickets.
                      </Card>
                    ) : (
                      <div className="space-y-4">{upcomingTickets.map(renderTicketCard)}</div>
                    )}
                  </div>

                  {/* Section 2: Lumped Used, Exchanged, and Expired Tickets */}
                  {pastAndUsedTickets.length > 0 && (
                    <div className="rounded-2xl border border-line bg-mist/30 p-4">
                      <button
                        type="button"
                        onClick={() => setLumpUsedOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between text-left font-brand text-base font-bold text-brand-deep cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span>Past & Used Tickets</span>
                          <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-muted">
                            {pastAndUsedTickets.length}
                          </span>
                        </span>
                        <span className="text-muted flex items-center gap-1 text-xs font-medium">
                          {lumpUsedOpen ? (
                            <>
                              <span>Collapse</span>
                              <ChevronUp className="h-4 w-4" />
                            </>
                          ) : (
                            <>
                              <span>Expand</span>
                              <ChevronDown className="h-4 w-4" />
                            </>
                          )}
                        </span>
                      </button>

                      {lumpUsedOpen && (
                        <div className="mt-4 space-y-3">
                          <p className="text-xs text-muted mb-2">
                            Tickets that have already been admitted, exchanged, or whose event dates have expired are lumped here for your records.
                          </p>
                          {pastAndUsedTickets.map(renderTicketCard)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* When Specific Filter is Selected */}
              {!loading && ticketFilter !== "all" && (
                <div className="space-y-4">
                  {displayedTickets.length === 0 ? (
                    <Card className="p-8 text-center text-sm text-muted">
                      No tickets match the "{ticketFilter}" filter.
                    </Card>
                  ) : (
                    displayedTickets.map(renderTicketCard)
                  )}
                </div>
              )}
            </div>
          )}

          {/* COMBINED 1 TABLE BOOKING & EXCHANGE HISTORY WITH PAGINATION */}
          {active === "history" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-brand text-xl font-bold text-brand-deep">Unified Activity & Booking History</h3>
                  <p className="text-xs text-muted mt-0.5">
                    All your ticket purchases, reservations, and EaseXchange transactions combined in one chronological table.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-medium">Filter:</span>
                  <select
                    className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold"
                    value={historyFilter}
                    onChange={(e) => {
                      setHistoryFilter(e.target.value as "all" | "booking" | "exchange");
                      setHistoryPage(1);
                    }}
                  >
                    <option value="all">All Activities ({bookingRows.length + exchangeRows.length})</option>
                    <option value="booking">Bookings Only ({bookingRows.length})</option>
                    <option value="exchange">Exchanges Only ({exchangeRows.length})</option>
                  </select>
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

                {/* PAGINATION CONTROLS */}
                {allHistoryRows.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-mist/20 p-3.5 text-xs text-muted">
                    <div className="flex items-center gap-2">
                      <span>Rows per page:</span>
                      <select
                        className="rounded border border-line bg-white p-1 text-xs"
                        value={historyPageSize}
                        onChange={(e) => {
                          setHistoryPageSize(Number(e.target.value));
                          setHistoryPage(1);
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <span>
                        Showing {(currentHistoryPage - 1) * historyPageSize + 1}–
                        {Math.min(currentHistoryPage * historyPageSize, allHistoryRows.length)} of {allHistoryRows.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentHistoryPage <= 1}
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Previous
                      </Button>
                      <span className="px-2 font-medium">
                        Page {currentHistoryPage} of {totalHistoryPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentHistoryPage >= totalHistoryPages}
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                      >
                        Next <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
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
