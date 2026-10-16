import { useState } from "react";
import {
  LayoutDashboard,
  CalendarPlus,
  Ticket,
  BarChart3,
  Tag,
  TrendingUp,
  Users,
  CheckCircle2,
  CircleDollarSign,
  Building2,
  Armchair,
  MapPin,
  Clock3,
  Wrench,
} from "lucide-react";
import { useStore, currency } from "../lib/store";
import { categoryList, type Category, type EventItem } from "../lib/data";
import { DashboardShell, StatCard, BarChart, type NavItem } from "../components/DashboardShell";
import { Button, Badge, Card, Field, Input, Select, Textarea, Eyebrow, cx } from "../components/ui";
import { OperationsSeatMap } from "../components/OperationsSeatMap";

const nav: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "sales", label: "Ticket sales", icon: CircleDollarSign },
  { id: "venues", label: "Venue status", icon: Building2 },
  { id: "seats", label: "Seat maps", icon: Armchair },
  { id: "events", label: "My events", icon: Ticket },
  { id: "create", label: "Create event", icon: CalendarPlus },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "promos", label: "Promotions", icon: Tag },
];

export default function OrganizerDashboard() {
  const { user, events, createEvent } = useStore();
  const mine = events.filter((e) => e.organizerId === user?.id);

  const gross = mine.reduce((a, e) => a + e.tiers.reduce((x, t) => x + t.sold * t.price, 0), 0);
  const sold = mine.reduce((a, e) => a + e.tiers.reduce((x, t) => x + t.sold, 0), 0);
  const capacity = mine.reduce((a, e) => a + e.tiers.reduce((x, t) => x + t.total, 0), 0);

  return (
    <DashboardShell role="organizer" title="Organizer studio" nav={nav}>
      {(active) => (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <StatCard label="Gross sales" value={currency(gross)} tone="accent" sub="This season" />
            <StatCard label="Tickets sold" value={String(sold)} sub={`of ${capacity} capacity`} />
            <StatCard label="Live events" value={String(mine.filter((e) => e.status === "published").length)} />
            <StatCard label="Sell-through" value={`${Math.round((sold / Math.max(capacity, 1)) * 100)}%`} tone="live" />
          </div>

          {active === "overview" && <Overview mine={mine} />}
          {active === "sales" && <TicketSales mine={mine} />}
          {active === "venues" && <VenueStatus mine={mine} />}
          {active === "seats" && <OperationsSeatMap events={mine} eyebrow="Organizer seat maps" />}
          {active === "events" && <EventsTable mine={mine} />}
          {active === "create" && <CreateEvent onCreate={createEvent} organizer={{ id: user!.id, name: user!.name }} />}
          {active === "analytics" && <Analytics mine={mine} />}
          {active === "promos" && <Promotions />}
        </>
      )}
    </DashboardShell>
  );
}

function TicketSales({ mine }: { mine: EventItem[] }) {
  return (
    <div className="space-y-5">
      {mine.map((event) => {
        const sold = event.tiers.reduce((sum, tier) => sum + tier.sold, 0);
        const capacity = event.tiers.reduce((sum, tier) => sum + tier.total, 0);
        const revenue = event.tiers.reduce((sum, tier) => sum + tier.sold * tier.price, 0);
        return (
          <Card key={event.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold">{event.title}</h2>
                  <Badge tone={event.status === "published" ? "live" : "warn"}>{event.status}</Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="h-4 w-4" /> {event.venue}, {event.city}
                </p>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-semibold">{currency(revenue)}</div>
                <div className="text-xs text-muted">{sold} of {capacity} tickets sold</div>
              </div>
            </div>
            <div className="grid gap-px bg-line sm:grid-cols-3">
              {event.tiers.map((tier) => {
                const tierRevenue = tier.sold * tier.price;
                const percent = Math.round((tier.sold / Math.max(tier.total, 1)) * 100);
                return (
                  <div key={tier.id} className="bg-paper p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{tier.name}</span>
                      <span className="text-sm text-muted">{currency(tier.price)}</span>
                    </div>
                    <div className="mt-4 font-display text-2xl font-semibold">{currency(tierRevenue)}</div>
                    <div className="mt-1 text-xs text-muted">{tier.sold} sold · {percent}% filled</div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-mist">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function VenueStatus({ mine }: { mine: EventItem[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {mine.map((event, index) => {
        const checks = [
          { label: "Venue booking", status: "Confirmed" },
          { label: "Safety inspection", status: index % 2 ? "Scheduled" : "Passed" },
          { label: "Accessibility route", status: "Verified" },
          { label: "Entry scanners", status: index % 2 ? "Testing" : "Ready" },
        ];
        const ready = checks.filter((check) => ["Confirmed", "Passed", "Verified", "Ready"].includes(check.status)).length;
        return (
          <Card key={event.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{event.venue}</h2>
                <p className="mt-1 text-sm text-muted">{event.title} · {event.city}</p>
              </div>
              <Badge tone={ready === checks.length ? "live" : "warn"}>
                {ready === checks.length ? "Ready" : `${ready}/${checks.length} ready`}
              </Badge>
            </div>
            <div className="mt-5 space-y-2">
              {checks.map((check) => {
                const complete = ["Confirmed", "Passed", "Verified", "Ready"].includes(check.status);
                return (
                  <div key={check.label} className="flex items-center justify-between rounded-xl bg-mist/60 px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      {complete ? <CheckCircle2 className="h-4 w-4 text-live" /> : <Wrench className="h-4 w-4 text-warn" />}
                      {check.label}
                    </span>
                    <span className={complete ? "font-medium text-live" : "font-medium text-warn"}>{check.status}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-muted">
              <Clock3 className="h-3.5 w-3.5" /> Last operational update 12 minutes ago
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Overview({ mine }: { mine: EventItem[] }) {
  const data = mine.map((e) => ({
    label: e.title.split(" ")[0],
    value: e.tiers.reduce((a, t) => a + t.sold * t.price, 0),
  }));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-6">
        <Eyebrow>Revenue by event</Eyebrow>
        <h3 className="mt-1 font-display text-xl font-semibold">Sales performance</h3>
        <div className="mt-6">
          <BarChart data={data} />
        </div>
      </Card>
      <Card className="p-6">
        <Eyebrow>Audience</Eyebrow>
        <h3 className="mt-1 font-display text-xl font-semibold">Engagement snapshot</h3>
        <ul className="mt-5 space-y-4 text-sm">
          {[
            { icon: Users, l: "Unique visitors", v: "12,480", d: "+18% wk" },
            { icon: TrendingUp, l: "Conversion rate", v: "6.4%", d: "+0.9pt" },
            { icon: Ticket, l: "Avg. basket", v: "2.3 seats", d: "steady" },
          ].map((r) => (
            <li key={r.l} className="flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-muted">
                <r.icon className="h-4 w-4" /> {r.l}
              </span>
              <span className="text-right">
                <span className="font-display text-lg font-semibold">{r.v}</span>{" "}
                <span className="text-xs text-live">{r.d}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function EventsTable({ mine }: { mine: EventItem[] }) {
  return (
    <div className="space-y-4">
      {mine.map((e) => {
        const sold = e.tiers.reduce((a, t) => a + t.sold, 0);
        const cap = e.tiers.reduce((a, t) => a + t.total, 0);
        const pct = Math.round((sold / cap) * 100);
        return (
          <Card key={e.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">{e.title}</h3>
                  <Badge tone={e.status === "published" ? "live" : e.status === "pending" ? "warn" : "neutral"}>
                    {e.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted">{e.venue} · {e.category}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg font-semibold">
                  {currency(e.tiers.reduce((a, t) => a + t.sold * t.price, 0))}
                </div>
                <div className="text-xs text-muted">{sold}/{cap} sold</div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {e.tiers.map((t) => (
                <div key={t.id} className="rounded-xl bg-mist/60 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted">{currency(t.price)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(t.sold / t.total) * 100}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted">{t.sold}/{t.total}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-live" style={{ width: `${pct}%` }} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CreateEvent({
  onCreate,
  organizer,
}: {
  onCreate: (e: EventItem) => void;
  organizer: { id: string; name: string };
}) {
  const [form, setForm] = useState({
    title: "",
    category: "Concert" as Category,
    date: "",
    venue: "",
    city: "Singapore",
    blurb: "",
    vip: "200",
    std: "100",
    conc: "50",
    earlyBird: "",
  });
  const [done, setDone] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.title || !form.date || !form.venue) return;
    onCreate({
      id: "ev-" + Date.now(),
      title: form.title,
      category: form.category,
      date: new Date(form.date).toISOString(),
      doors: "18:30",
      venue: form.venue,
      city: form.city,
      image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80",
      blurb: form.blurb || "A new event on EventEase.",
      organizerId: organizer.id,
      organizerName: organizer.name,
      status: "pending",
      rows: 6,
      cols: 10,
      earlyBird: form.earlyBird ? +form.earlyBird : undefined,
      tiers: [
        { id: "t1", name: "VIP", price: +form.vip, total: 20, sold: 0 },
        { id: "t2", name: "Standard", price: +form.std, total: 40, sold: 0 },
        { id: "t3", name: "Concession", price: +form.conc, total: 20, sold: 0 },
      ],
    });
    setDone(true);
  };

  if (done) {
    return (
      <Card className="p-10 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-live" />
        <h3 className="mt-3 font-display text-2xl font-semibold">Event submitted</h3>
        <p className="mt-1 text-muted">
          Your event is now <Badge tone="warn">pending</Badge> admin approval. You'll be notified once
          it goes live.
        </p>
        <Button className="mt-5" onClick={() => setDone(false)}>
          Create another
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <Eyebrow>New event</Eyebrow>
      <h3 className="mt-1 font-display text-2xl font-semibold">Event details</h3>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Event title">
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Summer Sessions 2026" />
          </Field>
        </div>
        <Field label="Category">
          <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {categoryList.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date & time">
          <Input type="datetime-local" value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Venue">
          <Input value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="The National Stadium" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <Textarea rows={3} value={form.blurb} onChange={(e) => set("blurb", e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold">Ticket categories & pricing</div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="VIP price (S$)">
            <Input type="number" value={form.vip} onChange={(e) => set("vip", e.target.value)} />
          </Field>
          <Field label="Standard price (S$)">
            <Input type="number" value={form.std} onChange={(e) => set("std", e.target.value)} />
          </Field>
          <Field label="Concession price (S$)">
            <Input type="number" value={form.conc} onChange={(e) => set("conc", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 max-w-xs">
          <Field label="Early-bird discount (% — optional)">
            <Input type="number" value={form.earlyBird} onChange={(e) => set("earlyBird", e.target.value)} placeholder="e.g. 15" />
          </Field>
        </div>
      </div>

      <Button className="mt-6" onClick={submit}>
        Submit for approval
      </Button>
    </Card>
  );
}

function Analytics({ mine }: { mine: EventItem[] }) {
  const weeks = [
    { label: "W1", value: 120 },
    { label: "W2", value: 260 },
    { label: "W3", value: 340 },
    { label: "W4", value: 290 },
    { label: "W5", value: 420 },
    { label: "W6", value: 510 },
  ];
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <Eyebrow>Demand forecasting</Eyebrow>
        <h3 className="mt-1 font-display text-xl font-semibold">Weekly sales velocity</h3>
        <p className="mt-1 text-sm text-muted">Projected sell-out in ~2 weeks at current pace. Consider releasing more VIP inventory.</p>
        <div className="mt-6">
          <BarChart data={weeks} />
        </div>
      </Card>
      <div className="grid gap-6 sm:grid-cols-3">
        {mine.slice(0, 3).map((e) => {
          const rev = e.tiers.reduce((a, t) => a + t.sold * t.price, 0);
          return (
            <Card key={e.id} className="p-5">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="mt-2 font-display text-2xl font-semibold">{currency(rev)}</div>
              <div className="mt-3 space-y-1.5">
                {e.tiers.map((t) => (
                  <div key={t.id} className="flex justify-between text-xs text-muted">
                    <span>{t.name}</span>
                    <span>{Math.round((t.sold / t.total) * 100)}% sold</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Promotions() {
  const promos = [
    { code: "EARLYBIRD", type: "Early-bird pricing", off: "15% off", used: 213, active: true },
    { code: "BUNDLE4", type: "Bundle offer (buy 4)", off: "20% off", used: 88, active: true },
    { code: "WELCOME10", type: "Referral code", off: "10% off", used: 402, active: true },
    { code: "LOYALGOLD", type: "Loyalty reward", off: "Free booking fee", used: 156, active: false },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-5">
        <h3 className="font-display text-xl font-semibold">Active promotions</h3>
        <Button size="sm"><Tag className="h-4 w-4" /> New promo</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-mist/50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="p-4">Code</th>
            <th className="p-4">Type</th>
            <th className="p-4">Discount</th>
            <th className="p-4">Redemptions</th>
            <th className="p-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {promos.map((p) => (
            <tr key={p.code} className="border-b border-line last:border-0">
              <td className="p-4"><code className="rounded bg-mist px-2 py-1 font-mono text-xs">{p.code}</code></td>
              <td className="p-4 text-muted">{p.type}</td>
              <td className="p-4 font-medium">{p.off}</td>
              <td className="p-4 text-muted">{p.used}</td>
              <td className="p-4"><Badge tone={p.active ? "live" : "neutral"}>{p.active ? "Active" : "Ended"}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
