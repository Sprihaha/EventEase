import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  Building2,
  Briefcase,
  ShieldAlert,
  BarChart3,
  Check,
  X,
  AlertTriangle,
  CircleDollarSign,
  Armchair,
  Route,
  MapPin,
  Accessibility,
  Clock3,
  ClipboardList,
  Volume2,
} from "lucide-react";
import { useStore, currency } from "../lib/store";
import { DashboardShell, StatCard, BarChart, type NavItem } from "../components/DashboardShell";
import { Button, Badge, Card, Eyebrow, cx } from "../components/ui";
import { OperationsSeatMap } from "../components/OperationsSeatMap";
import AssistanceQueue from "../components/AssistanceQueue";
import EaseVoiceNarration from "./EaseVoiceNarration";
import ResetDemoData from "../components/ResetDemoData";
import OrganiserRequests from "../components/OrganiserRequests";
import { countPendingOrganiserRequests } from "../lib/backendApi";
import OrganisationRequestsAdmin from "../components/OrganisationRequestsAdmin";
import { countPendingOrganisationRequests } from "../lib/organisation";

export default function AdminDashboard() {
  const { events, fraud, assistanceRequests } = useStore();
  const pendingEvents = events.filter((e) => e.status === "pending").length;
  // Real organiser sign-up requests waiting for review, from the backend.
  const [pendingOrgs, setPendingOrgs] = useState(0);
  const refreshPendingOrgs = useCallback(() => {
    countPendingOrganiserRequests().then(setPendingOrgs).catch(() => setPendingOrgs(0));
  }, []);
  useEffect(refreshPendingOrgs, [refreshPendingOrgs]);
  // Organisers asking to add an organisation to their account.
  const [pendingOrganisations, setPendingOrganisations] = useState(0);
  const refreshPendingOrganisations = useCallback(() => {
    countPendingOrganisationRequests().then(setPendingOrganisations).catch(() => setPendingOrganisations(0));
  }, []);
  useEffect(refreshPendingOrganisations, [refreshPendingOrganisations]);
  const openFraud = fraud.filter((f) => !f.resolved).length;
  const openAssistance = assistanceRequests.filter((request) =>
    ["Submitted", "Assigned", "In progress"].includes(request.status),
  ).length;

  const nav: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "events", label: "Event approvals", icon: CalendarCheck, badge: pendingEvents },
    { id: "organizers", label: "Organiser requests", icon: Building2, badge: pendingOrgs },
    { id: "organisations", label: "Organisation requests", icon: Briefcase, badge: pendingOrganisations },
    { id: "fraud", label: "Fraud monitor", icon: ShieldAlert, badge: openFraud },
    { id: "sales", label: "Sales status", icon: CircleDollarSign },
    { id: "assistance", label: "Assistance queue", icon: ClipboardList, badge: openAssistance },
    { id: "narration", label: "EaseVoice narration", icon: Volume2 },
    { id: "seats", label: "Seat maps", icon: Armchair },
    { id: "guide", label: "EaseGuide requests", icon: Route, badge: 3 },
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
            <StatCard label="Organiser requests" value={String(pendingOrgs)} tone={pendingOrgs ? "accent" : undefined} />
          </div>

          {active === "overview" && <><Overview /><div className="mt-8"><ResetDemoData /></div></>}
          {active === "events" && <EventApprovals />}
          {active === "organizers" && <OrganiserRequests onChanged={refreshPendingOrgs} />}
          {active === "organisations" && <OrganisationRequestsAdmin onChanged={refreshPendingOrganisations} />}
          {active === "fraud" && <FraudMonitor />}
          {active === "sales" && <SalesStatus />}
          {active === "seats" && <OperationsSeatMap events={events} eyebrow="Platform seat maps" />}
          {active === "assistance" && <AssistanceQueue />}
          {active === "narration" && <EaseVoiceNarration embedded />}
          {active === "guide" && <EaseGuideRequests />}
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
                  <h2 className="font-brand text-xl font-bold text-brand-deep">{event.title}</h2>
                  <Badge tone={event.status === "published" ? "live" : event.status === "pending" ? "warn" : "neutral"}>
                    {event.status}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="h-4 w-4 text-brand-orange" /> {event.venue} · {event.organizerName}
                </p>
              </div>
              <div className="text-right">
                <div className="font-brand text-2xl font-bold text-brand-deep">{currency(revenue)}</div>
                <div className="text-xs text-muted">gross ticket sales</div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {event.tiers.map((tier) => (
                <div key={tier.id} className="rounded-2xl bg-mist/60 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-brand-deep">{tier.name}</span>
                    <span className="text-muted">{tier.sold}/{tier.total}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-orange" style={{ width: `${(tier.sold / tier.total) * 100}%` }} />
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
      <div className="rounded-2xl border border-brand-purple/20 bg-brand-purple/10 p-4 text-sm font-medium text-brand-deep">
        EaseGuide requests coordinate accessible routes, arrival support, and venue assistance.
      </div>
      {guideSeed.map((request) => {
        const done = completed.includes(request.id);
        return (
          <Card key={request.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-purple/15 text-brand-purple">
                  <Accessibility className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-brand font-bold text-brand-deep">{request.request}</h2>
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

function Overview() {
  const { events, fraud } = useStore();
  const byCat = ["Concert", "Theatre", "Sports", "Cultural"].map((c) => ({
    label: c.slice(0, 4),
    value: events.filter((e) => e.category === c).length,
  }));
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <Eyebrow>Marketplace health</Eyebrow>
          <h3 className="mt-1 font-brand text-xl font-bold text-brand-deep">Events by category</h3>
          <div className="mt-6"><BarChart data={byCat} /></div>
        </Card>
        <Card className="p-6">
          <Eyebrow>Needs attention</Eyebrow>
          <h3 className="mt-1 font-brand text-xl font-bold text-brand-deep">Latest fraud signals</h3>
          <ul className="mt-4 space-y-3">
            {fraud.slice(0, 3).map((f) => (
              <li key={f.id} className="flex items-start gap-3 rounded-xl bg-mist/50 p-3">
                <AlertTriangle className={cx("mt-0.5 h-4 w-4", f.severity === "high" ? "text-danger" : "text-warn")} />
                <div className="text-sm">
                  <div className="font-medium text-brand-deep">{f.type}</div>
                  <div className="text-muted">{f.event} · {f.when} ago</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section aria-labelledby="overview-assistance-title">
        <div className="mb-4">
          <Eyebrow>EaseGuide operations</Eyebrow>
          <h2 id="overview-assistance-title" className="mt-1 font-brand text-2xl font-bold text-brand-deep">
            Assistance queue
          </h2>
        </div>
        <AssistanceQueue />
      </section>
    </div>
  );
}

function EventApprovals() {
  const { events, setEventStatus } = useStore();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const update = async (id: string, status: "published" | "rejected") => {
    setPending(id); setError("");
    try { await setEventStatus(id, status); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Event update failed."); }
    finally { setPending(null); }
  };
  const list = [...events].sort((a) => (a.status === "pending" ? -1 : 1));
  return (
    <Card className="overflow-hidden">
      {error && <p role="alert" className="p-4 text-danger">{error}</p>}
      <table className="w-full text-sm">
        <thead className="border-b border-brand-purple/10 bg-brand-purple/5 text-left text-xs uppercase tracking-wide text-muted">
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
                    <Button size="sm" disabled={!!pending} onClick={() => void update(e.id, "published")}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="danger" disabled={!!pending} onClick={() => void update(e.id, "rejected")}>
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
        <h3 className="mt-1 font-brand text-xl font-bold text-brand-deep">Monthly GMV</h3>
        <div className="mt-6"><BarChart data={revenue} /></div>
      </Card>
    </div>
  );
}
