import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BarChart3, CalendarDays, CircleDollarSign, Ticket, Users } from "lucide-react";
import type { EventItem } from "../../lib/data";
import {
  fetchAnalyticsRevenueVelocity,
  fetchAnalyticsSales,
  fetchAnalyticsTierDemand,
  type AnalyticsRevenuePoint,
  type AnalyticsRevenueVelocity,
  type AnalyticsSales,
  type AnalyticsTierDemand,
} from "../../lib/api/analytics";
import { Badge, Button, Card, Select, cx } from "../ui";
import ReportDownload from "./ReportDownload";

type Range = 7 | 30 | 90;

// Sample and imported events have non-UUID ids and no sales records in the backend.
const isLiveEventId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const money = (cents: number) =>
  `S$${new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)}`;

// Backend tier types are codes such as "SPECIAL_ASSISTANCE"; show them as "Special assistance".
const tierLabel = (code: string) => {
  const words = code.toLowerCase().split("_");
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
};

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : "EaseAnalytics could not be loaded. Please try again.";

export default function EaseAnalytics({ events }: { events: EventItem[] }) {
  const [eventId, setEventId] = useState("all");
  const [range, setRange] = useState<Range>(30);
  const [sales, setSales] = useState<AnalyticsSales | null>(null);
  const [tiers, setTiers] = useState<AnalyticsTierDemand | null>(null);
  const [velocity, setVelocity] = useState<AnalyticsRevenueVelocity | null>(null);
  const [error, setError] = useState("");

  const liveFilter = eventId === "all" ? undefined : eventId;
  const filterHasRecords = eventId === "all" || isLiveEventId(eventId);

  // Totals and tier demand depend only on the event filter.
  useEffect(() => {
    let active = true;
    setSales(null);
    setTiers(null);
    setError("");
    if (!filterHasRecords) return;
    Promise.all([fetchAnalyticsSales(liveFilter), fetchAnalyticsTierDemand(liveFilter)])
      .then(([salesResult, tierResult]) => {
        if (!active) return;
        setSales(salesResult);
        setTiers(tierResult);
      })
      .catch((cause) => active && setError(messageOf(cause)));
    return () => {
      active = false;
    };
  }, [liveFilter, filterHasRecords]);

  // The revenue chart and average daily revenue also depend on the chosen range.
  useEffect(() => {
    let active = true;
    setVelocity(null);
    if (!filterHasRecords) return;
    fetchAnalyticsRevenueVelocity(range, liveFilter)
      .then((result) => active && setVelocity(result))
      .catch((cause) => active && setError(messageOf(cause)));
    return () => {
      active = false;
    };
  }, [range, liveFilter, filterHasRecords]);

  const loading = filterHasRecords && !error && (sales === null || tiers === null);
  const tierDemand = (tiers?.tiers ?? []).filter((tier) => tier.ticketsSold > 0);
  const noSales = !filterHasRecords || (sales !== null && sales.confirmedBookings === 0);
  // "–" while loading, so nobody mistakes an unloaded figure for zero sales.
  const show = (value: number | undefined, format: (n: number) => string) =>
    value === undefined ? "–" : format(value);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Badge tone="accent"><BarChart3 className="h-3 w-3" /> Read-only</Badge>
          <h2 className="mt-3 font-feature text-3xl font-black italic tracking-tight text-brand-deep">EaseAnalytics</h2>
          <p className="mt-1 text-sm text-muted">Sales performance across your EventEase events.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Event
            </span>
            <Select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              aria-label="Filter EaseAnalytics by event"
            >
              <option value="all">All my events</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
            </Select>
          </label>
          <ReportDownload
            label="Download report"
            buildPath={(format) =>
              `/organiser/analytics/export?format=${format}&days=${range}` +
              (eventId !== "all" ? `&eventId=${eventId}` : "")
            }
            fallbackName={(format) => `easeanalytics-report.${format}`}
            validate={() =>
              eventId !== "all" && !isLiveEventId(eventId)
                ? "This event has no live sales record yet. Choose “All my events” to download a report."
                : null
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Confirmed bookings"
          value={show(sales?.confirmedBookings, (n) => n.toLocaleString())} />
        <Metric icon={Ticket} label="Tickets sold" value={show(sales?.totalTicketsSold, (n) => n.toLocaleString())} />
        <Metric icon={CircleDollarSign} label="Total revenue (SGD)" value={show(sales?.totalRevenueCents, money)} accent />
        <Metric
          icon={CalendarDays}
          label={`Average daily revenue (last ${range} days)`}
          value={show(velocity?.averageDailyRevenueCents, money)}
        />
      </div>

      {error ? (
        <Card className="p-8 text-center" role="alert">
          <p className="font-semibold text-danger">{error}</p>
          <p className="mt-1 text-sm text-muted">Refresh the page to try again.</p>
        </Card>
      ) : loading ? (
        <Card className="p-16 text-center text-sm text-muted">Loading sales data…</Card>
      ) : noSales ? (
        <Card className="p-16 text-center">
          <BarChart3 className="mx-auto h-9 w-9 text-brand-orange" />
          <h3 className="mt-4 font-brand text-2xl font-bold text-brand-deep">No sales yet</h3>
          <p className="mt-2 text-sm text-muted">
            {filterHasRecords
              ? "Revenue and ticket-demand insights will appear after the first confirmed booking."
              : "This event has no live sales records. Choose another event or “All my events”."}
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-brand text-xl font-bold text-brand-deep">Revenue over time</h3>
                <p className="mt-1 text-sm text-muted">Daily revenue and cumulative running total.</p>
              </div>
              <div className="flex rounded-full border border-line bg-mist/50 p-1" aria-label="Revenue chart range">
                {([7, 30, 90] as Range[]).map((days) => (
                  <Button
                    key={days}
                    size="sm"
                    variant={range === days ? "dark" : "ghost"}
                    onClick={() => setRange(days)}
                    aria-pressed={range === days}
                    className="h-8 px-3"
                  >
                    {days} days
                  </Button>
                ))}
              </div>
            </div>
            {velocity ? (
              <RevenueChart points={velocity.points} />
            ) : (
              <p className="mt-7 text-sm text-muted">Loading revenue…</p>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="p-5 sm:p-6">
              <h3 className="font-brand text-xl font-bold text-brand-deep">Ticket tier demand</h3>
              <p className="mt-1 text-sm text-muted">Share of tickets sold across every tier.</p>
              <div className="mt-7 space-y-5">
                {tierDemand.map((tier) => {
                  const share = tier.sharePercent;
                  return (
                    <div key={tier.type}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-brand-deep">{tierLabel(tier.type)}</span>
                        <span className="text-muted">
                          {tier.ticketsSold} sold · {share.toFixed(1)}% · {money(tier.revenueCents)}
                        </span>
                      </div>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-mist">
                        <div
                          className={cx(
                            "h-full rounded-full",
                            tier.ticketsSold ? "bg-gradient-to-r from-brand-purple to-brand-orange" : "bg-line",
                          )}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line p-5 sm:p-6">
                <h3 className="font-brand text-xl font-bold text-brand-deep">Sales per event</h3>
                <p className="mt-1 text-sm text-muted">Confirmed performance in Singapore dollars.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-brand-purple/5 border-b border-brand-purple/10 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="p-4">Event</th>
                      <th className="p-4 text-right">Bookings</th>
                      <th className="p-4 text-right">Tickets</th>
                      <th className="p-4 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sales?.events ?? []).map((row) => (
                      <tr key={row.eventId} className="border-t border-line hover:bg-brand-purple/5 transition-colors">
                        <td className="p-4 font-medium text-brand-deep">{row.title}</td>
                        <td className="p-4 text-right">{row.confirmedBookings}</td>
                        <td className="p-4 text-right">{row.ticketsSold}</td>
                        <td className="p-4 text-right font-bold text-brand-deep">{money(row.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={cx("p-5", accent && "border-accent/30 bg-accent-soft/40")}>
      <Icon className="h-5 w-5 text-accent" />
      <div className="mt-5 text-sm text-muted">{label}</div>
      <div className="mt-1 font-brand text-2xl font-bold text-brand-deep">{value}</div>
    </Card>
  );
}

// Backend days are Singapore calendar dates ("2026-10-24"); format them without shifting the day.
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00Z`));

function RevenueChart({ points: data }: { points: AnalyticsRevenuePoint[] }) {
  const width = 700;
  const height = 240;
  const inset = 24;
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const daily = data.map((point) => point.revenueCents);
  const running = data.map((point) => point.cumulativeRevenueCents);
  const max = Math.max(...running, 1);
  const xAt = (index: number) => inset + (index / Math.max(data.length - 1, 1)) * (width - inset * 2);
  const yAt = (value: number) => height - inset - (value / max) * (height - inset * 2);
  const line = (values: number[]) => values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(" ");

  // Snap the pointer to the nearest day.
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || data.length === 0) return;
    const x = ((event.clientX - box.left) / box.width) * width;
    const index = Math.round(((x - inset) / (width - inset * 2)) * (data.length - 1));
    setActive(Math.min(data.length - 1, Math.max(0, index)));
  };

  // Keyboard: arrows move day by day, Home/End jump to the ends, Escape hides the tooltip.
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const last = data.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: Math.min(last, (active ?? -1) + 1),
      ArrowLeft: Math.max(0, (active ?? last + 1) - 1),
      Home: 0,
      End: last,
    };
    if (event.key === "Escape") setActive(null);
    else if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    }
  };

  const point = active === null ? null : data[active];
  const left = active === null ? 0 : (xAt(active) / width) * 100;
  // Keep the tooltip inside the chart near the edges.
  const shift = left > 70 ? "-100%" : left < 30 ? "0%" : "-50%";

  return (
    <div className="mt-7">
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Running total</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-live" /> Daily revenue</span>
        <span className="ml-auto hidden sm:inline">Hover, or focus the chart and use ← → to see each day.</span>
      </div>
      <div className="mt-4 rounded-2xl bg-mist/40 p-3">
        <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          tabIndex={0}
          aria-label={`Revenue over the last ${data.length} days. Use the left and right arrow keys to read each day.`}
          className="h-auto w-full cursor-crosshair touch-none rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(event: PointerEvent<SVGSVGElement>) => event.pointerType === "mouse" && setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {[0.25, 0.5, 0.75].map((position) => (
            <line
              key={position}
              x1={inset}
              x2={width - inset}
              y1={height * position}
              y2={height * position}
              className="stroke-line"
              strokeDasharray="5 7"
            />
          ))}
          <polyline points={line(daily)} fill="none" className="stroke-live" strokeWidth="3" strokeLinejoin="round" />
          <polyline points={line(running)} fill="none" className="stroke-accent" strokeWidth="4" strokeLinejoin="round" />
          {point && active !== null && (
            <g pointerEvents="none">
              <line x1={xAt(active)} x2={xAt(active)} y1={inset / 2} y2={height - inset} className="stroke-muted" strokeDasharray="3 4" />
              <circle cx={xAt(active)} cy={yAt(point.cumulativeRevenueCents)} r="6" className="fill-white stroke-accent" strokeWidth="3" />
              <circle cx={xAt(active)} cy={yAt(point.revenueCents)} r="5" className="fill-white stroke-live" strokeWidth="3" />
            </g>
          )}
        </svg>
        {point && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute top-3 z-10 min-w-48 rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs shadow-lg"
            style={{ left: `${left}%`, transform: `translateX(${shift})` }}
          >
            <div className="font-semibold text-brand-deep">{dayLabel(point.day)}</div>
            <div className="mt-1.5 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-live" /> Daily revenue</span>
              <span className="font-semibold text-brand-deep">{money(point.revenueCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <span className="text-muted">Tickets sold</span>
              <span className="font-semibold text-brand-deep">{point.ticketsSold}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-accent" /> Running total</span>
              <span className="font-semibold text-brand-deep">{money(point.cumulativeRevenueCents)}</span>
            </div>
          </div>
        )}
        </div>
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted">
        <span>{data.length ? dayLabel(data[0].day) : ""}</span>
        <span>Today · {money(running.at(-1) ?? 0)} total</span>
      </div>
    </div>
  );
}
