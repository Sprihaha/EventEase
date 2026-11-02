import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, CircleDollarSign, Ticket, Users } from "lucide-react";
import type { EventItem } from "../../lib/data";
import {
  fetchAnalyticsRevenueVelocity,
  fetchAnalyticsSales,
  fetchAnalyticsTierDemand,
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
  const daily = velocity?.points.map((point) => point.revenueCents) ?? [];
  const running = velocity?.points.map((point) => point.cumulativeRevenueCents) ?? [];
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
              <RevenueChart daily={daily} running={running} />
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

function RevenueChart({ daily, running }: { daily: number[]; running: number[] }) {
  const width = 700;
  const height = 240;
  const inset = 24;
  const max = Math.max(...running, 1);
  const points = (values: number[]) =>
    values
      .map((value, index) => {
        const x = inset + (index / Math.max(values.length - 1, 1)) * (width - inset * 2);
        const y = height - inset - (value / max) * (height - inset * 2);
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <div className="mt-7">
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Running total</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-live" /> Daily revenue</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl bg-mist/40 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue over time line chart" className="h-auto w-full">
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
          <polyline points={points(daily)} fill="none" className="stroke-live" strokeWidth="3" strokeLinejoin="round" />
          <polyline points={points(running)} fill="none" className="stroke-accent" strokeWidth="4" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted">
        <span>{daily.length} days ago</span>
        <span>Today · {money(running.at(-1) ?? 0)} total</span>
      </div>
    </div>
  );
}
