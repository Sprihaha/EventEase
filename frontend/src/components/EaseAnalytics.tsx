import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, CircleDollarSign, Ticket, Users } from "lucide-react";
import type { EventItem } from "../lib/data";
import { Badge, Button, Card, Select, cx } from "./ui";

type Range = 7 | 30 | 90;

type EventSales = {
  event: EventItem;
  confirmedBookings: number;
  ticketsSold: number;
  revenueCents: number;
  dailyCents: number[];
  tiers: { name: string; sold: number }[];
};

const salesProfiles = [
  { confirmed: 84, tickets: 142, revenue: 1_854_200, tierSales: [24, 92, 26] },
  { confirmed: 51, tickets: 78, revenue: 914_600, tierSales: [12, 66, 0] },
  { confirmed: 29, tickets: 43, revenue: 486_300, tierSales: [8, 35, 0] },
];

const money = (cents: number) =>
  `S$${new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)}`;

function buildDaily(totalCents: number, seed: number) {
  const weights = Array.from({ length: 90 }, (_, index) => {
    const wave = 1 + Math.sin((index + seed) * 0.55) * 0.38;
    const weekend = index % 7 > 4 ? 1.3 : 0.9;
    return Math.max(0.08, wave * weekend);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const daily = weights.map((weight) => Math.round((totalCents * weight) / totalWeight));
  daily[daily.length - 1] += totalCents - daily.reduce((sum, value) => sum + value, 0);
  return daily;
}

function salesFor(events: EventItem[]): EventSales[] {
  return events.map((event, index) => {
    const profile = salesProfiles[index % salesProfiles.length];
    return {
      event,
      confirmedBookings: profile.confirmed,
      ticketsSold: profile.tickets,
      revenueCents: profile.revenue,
      dailyCents: buildDaily(profile.revenue, index * 7),
      tiers: event.tiers.map((tier, tierIndex) => ({
        name: tier.name,
        sold: profile.tierSales[tierIndex] ?? 0,
      })),
    };
  });
}

export default function EaseAnalytics({ events }: { events: EventItem[] }) {
  const [eventId, setEventId] = useState("all");
  const [range, setRange] = useState<Range>(30);
  const allSales = useMemo(() => salesFor(events), [events]);
  const selected = eventId === "all"
    ? allSales
    : allSales.filter((sales) => sales.event.id === eventId);

  const totals = selected.reduce(
    (summary, sales) => ({
      bookings: summary.bookings + sales.confirmedBookings,
      tickets: summary.tickets + sales.ticketsSold,
      revenue: summary.revenue + sales.revenueCents,
    }),
    { bookings: 0, tickets: 0, revenue: 0 },
  );
  const daily = Array.from({ length: range }, (_, offset) =>
    selected.reduce(
      (sum, sales) => sum + (sales.dailyCents[90 - range + offset] ?? 0),
      0,
    ),
  );
  const running = daily.reduce<number[]>((values, value) => {
    values.push((values.at(-1) ?? 0) + value);
    return values;
  }, []);

  const tierMap = new Map<string, number>();
  selected.forEach((sales) =>
    sales.tiers.forEach((tier) => tierMap.set(tier.name, (tierMap.get(tier.name) ?? 0) + tier.sold)),
  );
  const tierDemand = Array.from(tierMap, ([name, sold]) => ({ name, sold }));
  const totalTierSales = tierDemand.reduce((sum, tier) => sum + tier.sold, 0);
  const noSales = totals.bookings === 0 && totals.tickets === 0 && totals.revenue === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Badge tone="accent"><BarChart3 className="h-3 w-3" /> Read-only</Badge>
          <h2 className="mt-3 font-display text-3xl font-semibold">EaseAnalytics</h2>
          <p className="mt-1 text-sm text-muted">Sales performance across your EventEase events.</p>
        </div>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Confirmed bookings" value={totals.bookings.toLocaleString()} />
        <Metric icon={Ticket} label="Tickets sold" value={totals.tickets.toLocaleString()} />
        <Metric icon={CircleDollarSign} label="Total revenue (SGD)" value={money(totals.revenue)} accent />
        <Metric
          icon={CalendarDays}
          label="Average daily revenue"
          value={money(Math.round(totals.revenue / 90))}
        />
      </div>

      {noSales ? (
        <Card className="p-16 text-center">
          <BarChart3 className="mx-auto h-9 w-9 text-muted" />
          <h3 className="mt-4 font-display text-2xl font-semibold">No sales yet</h3>
          <p className="mt-2 text-sm text-muted">
            Revenue and ticket-demand insights will appear after the first confirmed booking.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Revenue over time</h3>
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
            <RevenueChart daily={daily} running={running} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="p-5 sm:p-6">
              <h3 className="font-display text-xl font-semibold">Ticket tier demand</h3>
              <p className="mt-1 text-sm text-muted">Share of tickets sold across every tier.</p>
              <div className="mt-7 space-y-5">
                {tierDemand.map((tier) => {
                  const share = totalTierSales ? (tier.sold / totalTierSales) * 100 : 0;
                  return (
                    <div key={tier.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{tier.name}</span>
                        <span className="text-muted">{tier.sold} sold · {share.toFixed(1)}%</span>
                      </div>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-mist">
                        <div
                          className={cx(
                            "h-full rounded-full",
                            tier.sold ? "bg-accent" : "bg-line",
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
                <h3 className="font-display text-xl font-semibold">Sales per event</h3>
                <p className="mt-1 text-sm text-muted">Confirmed performance in Singapore dollars.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-mist/50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="p-4">Event</th>
                      <th className="p-4 text-right">Bookings</th>
                      <th className="p-4 text-right">Tickets</th>
                      <th className="p-4 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((sales) => (
                      <tr key={sales.event.id} className="border-t border-line">
                        <td className="p-4 font-medium">{sales.event.title}</td>
                        <td className="p-4 text-right">{sales.confirmedBookings}</td>
                        <td className="p-4 text-right">{sales.ticketsSold}</td>
                        <td className="p-4 text-right font-semibold">{money(sales.revenueCents)}</td>
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
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
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
