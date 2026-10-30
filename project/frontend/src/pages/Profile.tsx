import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import {
  User,
  Mail,
  Phone,
  Calendar,
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  Building2,
  Ticket,
  LayoutDashboard,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  LogOut,
  ArrowLeft,
  Briefcase,
  ShieldAlert,
  CalendarCheck,
  Code2,
} from "lucide-react";
import { useStore } from "../lib/store";
import { backendMe, type UserProfile } from "../lib/backendApi";
import { getCurrentOrganisation, fetchMyOrganisations, type Membership } from "../lib/organisation";
import { useAccessibility } from "../lib/accessibility";
import { Badge, Button, Card } from "../components/ui";

export default function Profile() {
  const navigate = useNavigate();
  const { user, sessionLoading, bookings, logout } = useStore();
  const { settings } = useAccessibility();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [organisations, setOrganisations] = useState<Membership[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const currentOrg = getCurrentOrganisation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    backendMe()
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => {
        // Fallback to basic store user info if backend request fails
        if (active && user) {
          setProfile({
            id: user.id,
            username: user.name,
            role: user.role === "organizer" ? "ORGANISER" : (user.role.toUpperCase() as "CUSTOMER" | "ADMIN"),
            email: user.email || null,
            phone: null,
            mustChangePassword: !!user.mustChangePassword,
            emailVerified: true,
            passwordChangeable: user.canChangePassword !== false,
            createdAt: new Date().toISOString(),
          });
        }
      });

    if (user.role === "organizer") {
      setLoadingOrgs(true);
      fetchMyOrganisations()
        .then((memberships) => {
          if (active) setOrganisations(memberships);
        })
        .catch(() => {
          if (active) setOrganisations([]);
        })
        .finally(() => {
          if (active) setLoadingOrgs(false);
        });
    }

    return () => {
      active = false;
    };
  }, [user]);

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-16 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-brand-purple/10" />
        <div className="mt-6 h-64 rounded-3xl bg-brand-purple/10" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ returnTo: "/profile" }} replace />;
  }

  const handleCopyId = () => {
    if (!profile?.id) return;
    navigator.clipboard.writeText(profile.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const formattedDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Member";

  const initials = (profile?.username || user.name || "U")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    user.role === "admin"
      ? "Platform Administrator"
      : user.role === "organizer"
      ? "Event Organiser"
      : "Community Customer";

  const roleBadgeTone =
    user.role === "admin"
      ? "danger"
      : user.role === "organizer"
      ? "warning"
      : "brand";

  const dashboardPath = `/dashboard/${user.role}`;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14 animate-in fade-in duration-200">
      {/* Top Breadcrumb & Return Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(dashboardPath)}
          className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-purple transition-all duration-150 hover:text-brand-orange hover:-translate-x-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20 rounded-lg px-2 py-1"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to {user.role === "admin" ? "Admin Dashboard" : "Dashboard"}</span>
        </button>

        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Account Profile
        </span>
      </div>

      {/* Hero Header Card */}
      <div className="relative overflow-hidden rounded-3xl border border-brand-purple/15 bg-white shadow-xl shadow-brand-purple/5">
        <div className="h-32 sm:h-36 bg-gradient-to-r from-brand-deep via-brand-purple to-brand-orange" />

        <div className="relative px-6 pb-6 pt-0 sm:px-8 sm:pb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-14 sm:-mt-16">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-3xl bg-white shadow-xl border-4 border-white text-2xl sm:text-3xl font-extrabold text-brand-purple">
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-gradient-to-br from-brand-lilac/80 to-brand-lilac/30 text-brand-purple font-brand">
                  {initials}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-brand text-2xl sm:text-3xl font-bold text-brand-deep">
                    {profile?.username || user.name}
                  </h1>
                  <Badge tone={roleBadgeTone} className="font-bold">
                    {roleLabel}
                  </Badge>
                  {profile?.emailVerified && (
                    <Badge tone="success" className="font-bold inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Verified</span>
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted">
                  @{profile?.username || user.name} · Member since {formattedDate}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2 sm:pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/change-password")}
                disabled={user.canChangePassword === false}
                className="rounded-xl border-brand-purple/20 font-bold hover:border-brand-purple/40"
              >
                <KeyRound className="h-4 w-4 text-brand-purple" />
                <span>Password</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(dashboardPath)}
                className="rounded-xl shadow-md font-bold"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>View Dashboard</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Details + Specific Roles + Security */}
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Left 2 Columns: Identity & Role-specific details */}
        <div className="space-y-8 lg:col-span-2">
          {/* Account Details Card */}
          <Card className="rounded-3xl border border-brand-purple/15 bg-white p-6 sm:p-7 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2 pb-3 border-b border-brand-purple/10">
              <User className="h-5 w-5 text-brand-purple" />
              <span>Personal & Account Details</span>
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-brand-purple/10 bg-brand-lilac/20 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-brand-purple" /> Username
                </span>
                <p className="mt-1 font-semibold text-brand-deep text-base">
                  {profile?.username || user.name}
                </p>
              </div>

              <div className="rounded-2xl border border-brand-purple/10 bg-brand-lilac/20 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-brand-purple" /> Email Address
                </span>
                <p className="mt-1 font-semibold text-brand-deep text-base truncate">
                  {profile?.email || user.email || "No email linked"}
                </p>
              </div>

              <div className="rounded-2xl border border-brand-purple/10 bg-brand-lilac/20 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-brand-purple" /> Phone Number
                </span>
                <p className="mt-1 font-semibold text-brand-deep text-base">
                  {profile?.phone || "Not provided"}
                </p>
              </div>

              <div className="rounded-2xl border border-brand-purple/10 bg-brand-lilac/20 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-brand-purple" /> Account Created
                </span>
                <p className="mt-1 font-semibold text-brand-deep text-base">
                  {formattedDate}
                </p>
              </div>
            </div>

            {/* Account ID with copy button */}
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-dashed border-brand-purple/20 bg-white p-3.5">
              <div className="min-w-0 pr-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted block">
                  Account ID
                </span>
                <span className="font-mono text-xs text-muted/80 truncate block">
                  {profile?.id || user.id}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-brand-purple/20 bg-brand-lilac/30 px-3 py-1.5 text-xs font-bold text-brand-purple hover:bg-brand-purple hover:text-white transition-all duration-150 active:scale-95"
              >
                {copiedId ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </Card>

          {/* Role Specific Section: Customer */}
          {user.role === "customer" && (
            <Card className="rounded-3xl border border-brand-purple/15 bg-white p-6 sm:p-7 shadow-sm">
              <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2 pb-3 border-b border-brand-purple/10">
                <Ticket className="h-5 w-5 text-brand-purple" />
                <span>Customer Activity & Tickets</span>
              </h2>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-brand-purple/10 bg-white p-4 shadow-xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">
                    Active Tickets
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="font-brand text-3xl font-bold text-brand-deep">
                      {bookings.length}
                    </span>
                    <Link
                      to="/dashboard/customer"
                      className="text-xs font-bold text-brand-orange hover:text-brand-purple transition-colors inline-flex items-center gap-1"
                    >
                      <span>Manage tickets</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                <div className="rounded-2xl border border-brand-purple/10 bg-white p-4 shadow-xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">
                    Accessibility & EaseVoice
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="font-brand text-base font-bold text-brand-deep">
                      {settings.voiceSpeed}x Speed
                    </span>
                    <Link
                      to="/settings/accessibility"
                      className="text-xs font-bold text-brand-purple hover:text-brand-orange transition-colors inline-flex items-center gap-1"
                    >
                      <span>Customize voice</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Role Specific Section: Organiser */}
          {user.role === "organizer" && (
            <Card className="rounded-3xl border border-brand-purple/15 bg-white p-6 sm:p-7 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-brand-purple/10">
                <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-brand-orange" />
                  <span>Organiser Affiliations</span>
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/select-organisation")}
                  className="rounded-xl border-brand-purple/20 text-xs font-bold hover:border-brand-purple/40"
                >
                  <Briefcase className="h-3.5 w-3.5 text-brand-purple" />
                  <span>Switch Organisation</span>
                </Button>
              </div>

              {/* Active Organisation Highlight */}
              <div className="mt-5 rounded-2xl border border-brand-orange/20 bg-brand-orange/5 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                      Active Organisation
                    </span>
                    <h3 className="mt-1 font-brand text-xl font-bold text-brand-deep">
                      {currentOrg?.name || "No organisation selected"}
                    </h3>
                  </div>
                  <Badge tone="warning" className="font-bold">
                    Primary
                  </Badge>
                </div>
              </div>

              {/* All Memberships list */}
              <div className="mt-5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted block mb-2">
                  Connected Organisations
                </span>
                {loadingOrgs ? (
                  <p className="text-sm text-muted">Loading organisations...</p>
                ) : organisations.length === 0 ? (
                  <p className="text-sm text-muted">
                    {currentOrg ? currentOrg.name : "No other organisations linked."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {organisations.map((org) => (
                      <div
                        key={org.id}
                        className="flex items-center justify-between rounded-xl border border-brand-purple/10 bg-white p-3 text-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <Building2 className="h-4 w-4 text-brand-purple" />
                          <span className="font-semibold text-brand-deep">
                            {org.organisationName}
                          </span>
                        </div>
                        <Badge
                          tone={org.status === "APPROVED" ? "success" : "neutral"}
                          className="text-xs font-semibold"
                        >
                          {org.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Role Specific Section: Admin */}
          {user.role === "admin" && (
            <Card className="rounded-3xl border border-brand-purple/15 bg-white p-6 sm:p-7 shadow-sm">
              <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2 pb-3 border-b border-brand-purple/10">
                <ShieldCheck className="h-5 w-5 text-brand-purple" />
                <span>Administrative Privileges & Quick Jump</span>
              </h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Link
                  to="/dashboard/admin?tab=events"
                  className="flex items-center gap-3 rounded-2xl border border-brand-purple/15 bg-white p-4 transition-all duration-150 hover:bg-brand-lilac/30 hover:border-brand-purple/40 hover:shadow-xs group"
                >
                  <CalendarCheck className="h-5 w-5 text-brand-purple transition-transform group-hover:scale-110" />
                  <div>
                    <span className="font-bold text-sm text-brand-deep block">Event Approvals</span>
                    <span className="text-xs text-muted">Review submitted events</span>
                  </div>
                </Link>

                <Link
                  to="/dashboard/admin?tab=fraud"
                  className="flex items-center gap-3 rounded-2xl border border-brand-purple/15 bg-white p-4 transition-all duration-150 hover:bg-brand-lilac/30 hover:border-brand-purple/40 hover:shadow-xs group"
                >
                  <ShieldAlert className="h-5 w-5 text-danger transition-transform group-hover:scale-110" />
                  <div>
                    <span className="font-bold text-sm text-brand-deep block">Fraud Shield</span>
                    <span className="text-xs text-muted">Monitor suspicious activity</span>
                  </div>
                </Link>

                <Link
                  to="/dashboard/admin?tab=organizers"
                  className="flex items-center gap-3 rounded-2xl border border-brand-purple/15 bg-white p-4 transition-all duration-150 hover:bg-brand-lilac/30 hover:border-brand-purple/40 hover:shadow-xs group"
                >
                  <Building2 className="h-5 w-5 text-brand-orange transition-transform group-hover:scale-110" />
                  <div>
                    <span className="font-bold text-sm text-brand-deep block">Organiser Requests</span>
                    <span className="text-xs text-muted">Approve seller credentials</span>
                  </div>
                </Link>

                <Link
                  to="/dashboard/admin?tab=developer"
                  className="flex items-center gap-3 rounded-2xl border border-brand-purple/15 bg-white p-4 transition-all duration-150 hover:bg-brand-lilac/30 hover:border-brand-purple/40 hover:shadow-xs group"
                >
                  <Code2 className="h-5 w-5 text-brand-deep transition-transform group-hover:scale-110" />
                  <div>
                    <span className="font-bold text-sm text-brand-deep block">Developer Settings</span>
                    <span className="text-xs text-muted">API and system controls</span>
                  </div>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* Right 1 Column: Security & Session Management */}
        <div className="space-y-6">
          {/* Security Card */}
          <Card className="rounded-3xl border border-brand-purple/15 bg-white p-6 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2 pb-3 border-b border-brand-purple/10">
              <KeyRound className="h-5 w-5 text-brand-purple" />
              <span>Security</span>
            </h2>

            <div className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-brand-deep block">Active Authentication</span>
                  <span className="text-xs text-muted">Encrypted JWT tokens with automatic rotation.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                {user.canChangePassword !== false ? (
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-brand-orange shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold text-brand-deep block">
                    {user.canChangePassword !== false ? "Password Status" : "Protected Account"}
                  </span>
                  <span className="text-xs text-muted">
                    {user.canChangePassword !== false
                      ? "Custom credential protection active."
                      : "Shared demonstration account credentials."}
                  </span>
                </div>
              </div>
            </div>

            {user.canChangePassword !== false && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/change-password")}
                className="mt-5 w-full rounded-xl border-brand-purple/20 font-bold hover:border-brand-purple/40"
              >
                <KeyRound className="h-4 w-4 text-brand-purple" />
                <span>Change Password</span>
              </Button>
            )}
          </Card>

          {/* Session & Sign Out Card */}
          <Card className="rounded-3xl border border-brand-purple/15 bg-white p-6 shadow-sm">
            <h2 className="font-brand text-lg font-bold text-brand-deep flex items-center gap-2 pb-3 border-b border-brand-purple/10">
              <LogOut className="h-5 w-5 text-muted" />
              <span>Session Management</span>
            </h2>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              You are signed in as <strong className="text-brand-deep">{user.name}</strong>. Signing out will invalidate your active session token on this device.
            </p>

            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="mt-5 w-full rounded-xl font-bold cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

