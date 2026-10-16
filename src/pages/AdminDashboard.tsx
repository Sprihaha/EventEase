import { useState } from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  Building2,
  ShieldAlert,
  BarChart3,
  Check,
  X,
  AlertTriangle,
  CircleDollarSign,
  Armchair,
  Route,
  RotateCcw,
  MapPin,
  Accessibility,
  Clock3,
} from "lucide-react";
import { useStore, currency } from "../lib/store";
import { DashboardShell, StatCard, BarChart, type NavItem } from "../components/DashboardShell";
import { Button, Badge, Card, Eyebrow, cx } from "../components/ui";
import { OperationsSeatMap } from "../components/OperationsSeatMap";

export default function AdminDashboard() {
  const { events, organizers, fraud } = useStore();
  const pendingEvents = events.filter((e) => e.status === "pending").length;
  const pendingOrgs = organizers.filter((o) => o.status === "pending").length;
  const openFraud = fraud.filter((f) => !f.resolved).length;

  const nav: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "events", label: "Event approvals", icon: CalendarCheck, badge: pendingEvents },
    { id: "organizers", label: "Organizers", icon: Building2, badge: pendingOrgs },
    { id: "fraud", label: "Fraud monitor", icon: ShieldAlert, badge: openFraud },
    { id: "sales", label: "Sales status", icon: CircleDollarSign },
    { id: "seats", label: "Seat maps", icon: Armchair },
    { id: "guide", label: "EaseGuide requests", icon: Route, badge: 3 },
    { id: "refunds", label: "Refund requests", icon: RotateCcw, badge: 2 },
    { id: "analytics", label: "Platform analytics", icon: BarChart3 },
  ];

  return (
    <DashboardShell role="admin" title="Admin control" nav={nav}>
      {(active) => (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <StatCard label="Live events" value={String(events.filter((e) => e.status === "published").length)} />
            <StatCard label="Pending approvals" value={String(pendingEvents + pendingOrgs)} tone="accent" />
            <StatCard label="Open fraud alerts" value={String(openFraud)} tone={openFraud ? "danger" : "live"} />
            <StatCard label="Approved organizers" value={String(organizers.filter((o) => o.status === "approved").length)} />
          </div>

          {active === "overview" && <Overview />}
          {active === "events" && <EventApprovals />}
          {active === "organizers" && <Organizers />}
          {active === "fraud" && <FraudMonitor />}
          {active === "sales" && <SalesStatus />}
          {active === "seats" && <OperationsSeatMap events={events} eyebrow="Platform seat maps" />}
          {active === "guide" && <EaseGuideRequests />}
          {active === "refunds" && <RefundRequests />}
          {active === "analytics" && <PlatformAnalytics />}
        </>
      )}
    </DashboardShell>
  );
}

function SalesStatus() {
  const { events } = useStore();
  return (
    <div className="space-y-4">
      {events.map((event) => {
        const sold = event.tiers.reduce((sum, tier) => sum + tier.sold, 0);
        const capacity = event.tiers.reduce((sum, tier) => sum + tier.total, 0);
        const revenue = event.tiers.reduce((sum, tier) => sum + tier.sold * tier.price, 0);
        const sellThrough = Math.round((sold / Math.max(capacity, 1)) * 100);
        return (
          <Card key={event.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold">{event.title}</h2>
                  <Badge tone={event.status === "published" ? "live" : event.status === "pending" ? "warn" : "neutral"}>
                    {event.status}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="h-4 w-4" /> {event.venue} · {event.organizerName}
                </p>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-semibold">{currency(revenue)}</div>
                <div className="text-xs text-muted">gross ticket sales</div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {event.tiers.map((tier) => (
                <div key={tier.id} className="rounded-2xl bg-mist/60 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{tier.name}</span>
                    <span className="text-muted">{tier.sold}/{tier.total}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(tier.sold / tier.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted">{sold} of {capacity} tickets sold</span>
              <span className="font-semibold text-live">{sellThrough}% sell-through</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const guideSeed = [
  { id: "EG-1042", user: "Nadia Lim", event: "Aurora — Midnight Tour", request: "Step-free route from Gate 2 to Section C", date: "18 Oct", priority: "high" },
  { id: "EG-1043", user: "Marcus Tan", event: "Swan Lake — Winter Gala", request: "Companion assistance from taxi stand", date: "14 Dec", priority: "normal" },
  { id: "EG-1044", user: "Aisha Rahman", event: "City Derby — Finals Night", request: "Audio navigation and accessible entrance", date: "2 Nov", priority: "normal" },
] as const;

function EaseGuideRequests() {
  const [completed, setCompleted] = useState<string[]>([]);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-accent-soft p-4 text-sm text-accent-ink">
        EaseGuide requests coordinate accessible routes, arrival support, and venue assistance.
      </div>
      {guideSeed.map((request) => {
        const done = completed.includes(request.id);
        return (
          <Card key={request.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Accessibility className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{request.request}</h2>
                    <Badge tone={done ? "live" : request.priority === "high" ? "warn" : "neutral"}>
                      {done ? "assigned" : request.priority}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{request.user} · {request.event}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <Clock3 className="h-3.5 w-3.5" /> Event date {request.date} · Request {request.id}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={done ? "outline" : "primary"}
                disabled={done}
                onClick={() => setCompleted((items) => [...items, request.id])}
              >
                {done ? <><Check className="h-4 w-4" /> Team assigned</> : "Assign support team"}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const refundSeed = [
  { id: "RF-2081", ref: "EE-8F3K21", customer: "Alex Chen", event: "Hamlet — A New Staging", amount: 240, reason: "Unable to attend due to medical appointment" },
  { id: "RF-2082", ref: "EE-2QP907", customer: "Jamie Koh", event: "City Derby — Finals Night", amount: 180, reason: "Duplicate booking made during checkout" },
] as const;

function RefundRequests() {
  const [decisions, setDecisions] = useState<Record<string, "approved" | "declined">>({});
  return (
    <div className="space-y-4">
      {refundSeed.map((request) => {
        const decision = decisions[request.id];
        return (
          <Card key={request.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold">{request.event}</h2>
                  <Badge tone={decision === "approved" ? "live" : decision === "declined" ? "danger" : "warn"}>
                    {decision ?? "pending review"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {request.customer} · Ticket {request.ref} · Request {request.id}
                </p>
                <p className="mt-3 max-w-xl rounded-xl bg-mist/60 p-3 text-sm">{request.reason}</p>
              </div>
              <div className="min-w-36 text-right">
                <div className="font-display text-2xl font-semibold">{currency(request.amount)}</div>
                <div className="text-xs text-muted">requested refund</div>
                {!decision && (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button size="sm" variant="danger" onClick={() => setDecisions((all) => ({ ...all, [request.id]: "declined" }))}>
                      Decline
                    </Button>
                    <Button size="sm" onClick={() => setDecisions((all) => ({ ...all, [request.id]: "approved" }))}>
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Overview() {
  const { events, fraud } = useStore();
  const byCat = ["Concert", "Theatre", "Sports", "Cultural"].map((c) => ({
    label: c.slice(0, 4),
    value: events.filter((e) => e.category === c).length,
  }));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <Card className="p-6">
        <Eyebrow>Marketplace health</Eyebrow>
        <h3 className="mt-1 font-display text-xl font-semibold">Events by category</h3>
        <div className="mt-6"><BarChart data={byCat} /></div>
      </Card>
      <Card className="p-6">
        <Eyebrow>Needs attention</Eyebrow>
        <h3 className="mt-1 font-display text-xl font-semibold">Latest fraud signals</h3>
        <ul className="mt-4 space-y-3">
          {fraud.slice(0, 3).map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-xl bg-mist/50 p-3">
              <AlertTriangle className={cx("mt-0.5 h-4 w-4", f.severity === "high" ? "text-danger" : "text-warn")} />
              <div className="text-sm">
                <div className="font-medium">{f.type}</div>
                <div className="text-muted">{f.event} · {f.when} ago</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function EventApprovals() {
  const { events, setEventStatus } = useStore();
  const list = [...events].sort((a) => (a.status === "pending" ? -1 : 1));
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-mist/50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="p-4">Event</th>
            <th className="p-4">Organizer</th>
            <th className="p-4">Category</th>
            <th className="p-4">Status</th>
            <th className="p-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.id} className="border-b border-line last:border-0">
              <td className="p-4 font-medium">{e.title}</td>
              <td className="p-4 text-muted">{e.organizerName}</td>
              <td className="p-4 text-muted">{e.category}</td>
              <td className="p-4">
                <Badge tone={e.status === "published" ? "live" : e.status === "pending" ? "warn" : e.status === "rejected" ? "danger" : "neutral"}>
                  {e.status}
                </Badge>
              </td>
              <td className="p-4">
                {e.status === "pending" ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => setEventStatus(e.id, "published")}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setEventStatus(e.id, "rejected")}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                ) : (
                  <div className="text-right text-xs text-muted">—</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Organizers() {
  const { organizers, setOrganizerStatus } = useStore();
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-mist/50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="p-4">Organizer</th>
            <th className="p-4">Contact</th>
            <th className="p-4">Events</th>
            <th className="p-4">Status</th>
            <th className="p-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {organizers.map((o) => (
            <tr key={o.id} className="border-b border-line last:border-0">
              <td className="p-4 font-medium">{o.name}</td>
              <td className="p-4 text-muted">{o.contact}</td>
              <td className="p-4 text-muted">{o.events}</td>
              <td className="p-4">
                <Badge tone={o.status === "approved" ? "live" : o.status === "pending" ? "warn" : "danger"}>
                  {o.status}
                </Badge>
              </td>
              <td className="p-4">
                <div className="flex justify-end gap-2">
                  {o.status === "pending" && (
                    <Button size="sm" onClick={() => setOrganizerStatus(o.id, "approved")}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                  )}
                  {o.status !== "suspended" ? (
                    <Button size="sm" variant="danger" onClick={() => setOrganizerStatus(o.id, "suspended")}>
                      Suspend
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setOrganizerStatus(o.id, "approved")}>
                      Reinstate
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function FraudMonitor() {
  const { fraud, resolveFraud } = useStore();
  return (
    <div className="space-y-3">
      {fraud.map((f) => (
        <Card key={f.id} className={cx("p-5", !f.resolved && f.severity === "high" && "border-danger/40 bg-danger/5")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={cx(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  f.severity === "high" ? "bg-danger/10 text-danger" : f.severity === "medium" ? "bg-warn/10 text-warn" : "bg-mist text-muted",
                )}
              >
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{f.type}</h3>
                  <Badge tone={f.severity === "high" ? "danger" : f.severity === "medium" ? "warn" : "neutral"}>
                    {f.severity}
                  </Badge>
                </div>
                <div className="mt-0.5 text-sm text-muted">{f.event} · Ref {f.ref} · {f.when} ago</div>
                <p className="mt-1.5 text-sm">{f.detail}</p>
              </div>
            </div>
            {f.resolved ? (
              <Badge tone="live"><Check className="h-3 w-3" /> Resolved</Badge>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline">Investigate</Button>
                <Button size="sm" onClick={() => resolveFraud(f.id)}>Resolve</Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PlatformAnalytics() {
  const { events } = useStore();
  const gmv = events.reduce((a, e) => a + e.tiers.reduce((x, t) => x + t.sold * t.price, 0), 0);
  const revenue = [
    { label: "May", value: 42000 },
    { label: "Jun", value: 51000 },
    { label: "Jul", value: 68000 },
    { label: "Aug", value: 74000 },
    { label: "Sep", value: 91000 },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Gross merchandise value" value={currency(gmv)} tone="accent" />
        <StatCard label="Platform fee revenue (5%)" value={currency(Math.round(gmv * 0.05))} tone="live" />
        <StatCard label="Fraud prevented" value="S$28,400" sub="Blocked this quarter" />
      </div>
      <Card className="p-6">
        <Eyebrow>Growth</Eyebrow>
        <h3 className="mt-1 font-display text-xl font-semibold">Monthly GMV</h3>
        <div className="mt-6"><BarChart data={revenue} /></div>
      </Card>
    </div>
  );
}
