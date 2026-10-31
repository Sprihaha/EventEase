import { useEffect, useState } from "react";
import {
  CalendarPlus,
  Ticket,
  BarChart3,
  Tag,
  CircleDollarSign,
  Building2,
  Armchair,
  MapPin,
  CheckCircle2,
  Wrench,
  Clock3,
  Users,
} from "lucide-react";
import { useStore, currency } from "../lib/store";
import { type EventItem } from "../lib/data";
import { BarChart, DashboardShell, type NavItem } from "../components/DashboardShell";
import { Button, Badge, Card, Eyebrow } from "../components/ui";
import EaseAnalytics from "../components/EaseAnalytics";
import VenueSetup from "../components/VenueSetup";
import CreateEventForm from "../components/CreateEventForm";
import VenueSeatMap from "../components/VenueSeatMap";
import OrganisationTeam from "../components/OrganisationTeam";
import TicketTierEditor from "../components/TicketTierEditor";
import { fetchMyOrganisations, getCurrentOrganisation } from "../lib/organisation";

const nav: NavItem[] = [
  { id: "analytics", label: "EaseAnalytics", icon: BarChart3 },
  { id: "sales", label: "Ticket sales", icon: CircleDollarSign },
  { id: "venues", label: "Venue status", icon: Building2 },
  { id: "venue-setup", label: "Venue setup", icon: MapPin },
  { id: "seats", label: "Venue seat maps", icon: Armchair },
  { id: "events", label: "My events", icon: Ticket },
  { id: "create", label: "Create event", icon: CalendarPlus },
  { id: "promos", label: "Promotions", icon: Tag },
];

export default function OrganizerDashboard() {
  const { user, events, createEvent } = useStore();
  // The backend already returns only the events this organiser manages: their own, plus the
  // shared events of a self-managed organisation chosen for this session.
  const mine = events;
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    const chosen = getCurrentOrganisation();
    if (!chosen) return;
    fetchMyOrganisations()
      .then((memberships) => setIsManager(memberships.some((m) => m.organisationId === chosen.id && m.isManager)))
      .catch(() => setIsManager(false));
  }, []);

  const items = isManager ? [...nav, { id: "team", label: "Team", icon: Users }] : nav;

  return (
    <DashboardShell
      role="organizer"
      title={(active) => {
        if (active === "analytics") return `Welcome, ${user?.name || "organizer"}!`;
        return items.find((n) => n.id === active)?.label ?? "Organizer studio";
      }}
      nav={items}
    >
      {(active) => (
        <>
          {active === "analytics" && <EaseAnalytics events={mine} />}
          {active === "sales" && <TicketSales mine={mine} />}
          {active === "venues" && <VenueStatus mine={mine} />}
          {active === "venue-setup" && <VenueSetup />}
          {active === "seats" && <VenueSeatMap />}
          {active === "events" && <EventsTable mine={mine} />}
          {active === "create" && <CreateEventForm onCreate={createEvent} />}
          {active === "promos" && <Promotions />}
          {active === "team" && isManager && <OrganisationTeam />}
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
                  <h2 className="font-brand text-xl font-bold text-brand-deep">{event.title}</h2>
                  <Badge tone={event.status === "published" ? "live" : "warn"}>{event.status}</Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="h-4 w-4 text-brand-orange" /> {event.venue}, {event.city}
                </p>
              </div>
              <div className="text-right">
                <div className="font-brand text-2xl font-bold text-brand-deep">{currency(revenue)}</div>
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
                      <span className="font-semibold text-brand-deep">{tier.name}</span>
                      <span className="text-sm text-muted">{currency(tier.price)}</span>
                    </div>
                    <div className="mt-4 font-brand text-2xl font-bold text-brand-deep">{currency(tierRevenue)}</div>
                    <div className="mt-1 text-xs text-muted">{tier.sold} sold · {percent}% filled</div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-mist">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-orange" style={{ width: `${percent}%` }} />
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
                <h2 className="font-brand text-xl font-bold text-brand-deep">{event.venue}</h2>
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

function EventsTable({ mine }: { mine: EventItem[] }) {
  return (
    <div className="space-y-4">
      {mine.map((e) => {
        const sold = e.tiers.reduce((a, t) => a + t.sold, 0);
        const cap = e.tiers.reduce((a, t) => a + t.total, 0);
        const pct = Math.round((sold / Math.max(cap, 1)) * 100);
        return (
          <Card key={e.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-brand text-lg font-bold text-brand-deep">{e.title}</h3>
                  <Badge tone={e.status === "published" ? "live" : e.status === "pending" ? "warn" : "neutral"}>
                    {e.status}
                  </Badge>
                  {e.imported && <Badge tone="accent">Imported by System</Badge>}
                </div>
                <div className="text-sm text-muted">{e.venue} · {e.category}</div>
              </div>
              <div className="text-right">
                <div className="font-brand text-lg font-bold text-brand-deep">
                  {currency(e.tiers.reduce((a, t) => a + t.sold * t.price, 0))}
                </div>
                <div className="text-xs text-muted">{sold}/{cap} sold</div>
              </div>
            </div>
            {e.rejectionReason && <p role="status" className="mt-3 text-sm text-danger">Rejection reason: {e.rejectionReason}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {e.tiers.map((t) => (
                <div key={t.id} className="rounded-xl bg-mist/60 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-brand-deep">{t.name}</span>
                    <span className="text-muted">{currency(t.price)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand-purple" style={{ width: `${(t.sold / t.total) * 100}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted">{t.sold}/{t.total}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand-orange" style={{ width: `${pct}%` }} />
            </div>
            {e.status === "published" && e.tiers.length > 0 && <TicketTierEditor event={e} />}
          </Card>
        );
      })}
    </div>
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
        <h3 className="mt-1 font-brand text-xl font-bold text-brand-deep">Weekly sales velocity</h3>
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
              <div className="text-sm font-medium text-brand-deep">{e.title}</div>
              <div className="mt-2 font-brand text-2xl font-bold text-brand-deep">{currency(rev)}</div>
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
        <h3 className="font-brand text-xl font-bold text-brand-deep">Active promotions</h3>
        <Button size="sm"><Tag className="h-4 w-4" /> New promo</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-brand-purple/5 border-b border-brand-purple/10 text-left text-xs uppercase tracking-wide text-muted">
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
            <tr key={p.code} className="border-b border-line last:border-0 hover:bg-brand-purple/5 transition-colors">
              <td className="p-4"><code className="rounded bg-brand-purple/10 px-2 py-1 font-mono text-xs font-semibold text-brand-purple">{p.code}</code></td>
              <td className="p-4 text-muted">{p.type}</td>
              <td className="p-4 font-semibold text-brand-deep">{p.off}</td>
              <td className="p-4 text-muted">{p.used}</td>
              <td className="p-4"><Badge tone={p.active ? "live" : "neutral"}>{p.active ? "Active" : "Ended"}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
