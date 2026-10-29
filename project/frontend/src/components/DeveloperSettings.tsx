import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Clock,
  Play,
  RotateCcw,
  FastForward,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ToggleLeft,
  ToggleRight,
  ListFilter,
  FileText,
  Edit2,
  X,
  RefreshCw,
  Sliders,
  Check,
  Sparkles,
  Globe,
} from "lucide-react";
import { WebSearchableControl } from "./common";
import {
  advanceBusinessDate,
  getBusinessDateState,
  getSchedulerJobLogs,
  getSchedulerJobs,
  setBusinessDate,
  triggerSchedulerJob,
  updateSchedulerJob,
  type BusinessDateState,
  type SchedulerJob,
  type SchedulerJobLog,
} from "../lib/backendApi";
import { Badge, Button, Card, Eyebrow, cx } from "./ui";

interface DeveloperSettingsProps {
  embedded?: boolean;
}

export default function DeveloperSettings({ embedded = false }: DeveloperSettingsProps) {
  // ── Business Date State ──────────────────────────────────────────────────
  const [clockState, setClockState] = useState<BusinessDateState | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [clockLoading, setClockLoading] = useState<boolean>(false);
  const [clockNotice, setClockNotice] = useState<string | null>(null);

  // ── Scheduler Jobs State ─────────────────────────────────────────────────
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState<boolean>(true);
  const [executingJobId, setExecutingJobId] = useState<string | null>(null);
  const [jobToast, setJobToast] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // ── Logs Modal State ─────────────────────────────────────────────────────
  const [activeLogJob, setActiveLogJob] = useState<SchedulerJob | null>(null);
  const [jobLogs, setJobLogs] = useState<SchedulerJobLog[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);

  // ── Edit Cron Modal State ────────────────────────────────────────────────
  const [editingJob, setEditingJob] = useState<SchedulerJob | null>(null);
  const [cronDraft, setCronDraft] = useState<string>("");
  const [cronError, setCronError] = useState<string | null>(null);
  const [cronSaving, setCronSaving] = useState<boolean>(false);

  // Fetch Business Date
  const loadClock = useCallback(async () => {
    try {
      const data = await getBusinessDateState();
      setClockState(data);
      if (!selectedDate && data.effective_date) {
        setSelectedDate(data.effective_date);
      }
    } catch (e) {
      console.error("Failed to load business date state", e);
    }
  }, [selectedDate]);

  // Fetch Jobs
  const loadJobs = useCallback(async () => {
    try {
      const data = await getSchedulerJobs();
      setJobs(data);
    } catch (e) {
      console.error("Failed to load scheduler jobs", e);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClock();
    void loadJobs();
  }, [loadClock, loadJobs]);

  // Auto-clear toasts
  useEffect(() => {
    if (!jobToast) return;
    const timer = setTimeout(() => setJobToast(null), 6000);
    return () => clearTimeout(timer);
  }, [jobToast]);

  // Handle Set Specific Date
  const handleSetDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;
    setClockLoading(true);
    setClockNotice(null);
    try {
      const updated = await setBusinessDate(selectedDate);
      setClockState(updated);
      setClockNotice(`Business date switched to ${updated.effective_date}`);
      void loadJobs(); // Refresh next-run times if any
    } catch (err: any) {
      setClockNotice(`Failed to set business date: ${err.message || err}`);
    } finally {
      setClockLoading(false);
    }
  };

  // Handle Advance Date
  const handleAdvanceDate = async (days: number) => {
    setClockLoading(true);
    setClockNotice(null);
    try {
      const updated = await advanceBusinessDate(days);
      setClockState(updated);
      setSelectedDate(updated.effective_date);
      setClockNotice(`Advanced business date by +${days} day(s) to ${updated.effective_date}`);
      void loadJobs();
    } catch (err: any) {
      setClockNotice(`Failed to advance business date: ${err.message || err}`);
    } finally {
      setClockLoading(false);
    }
  };

  // Handle Reset to Live Real-Time
  const handleResetDate = async () => {
    setClockLoading(true);
    setClockNotice(null);
    try {
      const updated = await setBusinessDate(null);
      setClockState(updated);
      setSelectedDate(updated.effective_date);
      setClockNotice("Reset back to Live Real-Time system clock.");
      void loadJobs();
    } catch (err: any) {
      setClockNotice(`Failed to reset date: ${err.message || err}`);
    } finally {
      setClockLoading(false);
    }
  };

  // Handle Toggle Active/Inactive
  const handleToggleActive = async (job: SchedulerJob) => {
    const nextActive = !job.is_active;
    // Optimistic update
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, is_active: nextActive } : j)),
    );
    try {
      await updateSchedulerJob(job.id, { is_active: nextActive });
      void loadJobs();
    } catch (e: any) {
      // Revert on error
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, is_active: job.is_active } : j)),
      );
      setJobToast({
        id: job.id,
        success: false,
        message: `Could not update active status: ${e.message || e}`,
      });
    }
  };

  // Handle Manual "Run Now" (Allowed even when inactive!)
  const handleRunNow = async (job: SchedulerJob) => {
    setExecutingJobId(job.id);
    setJobToast(null);
    try {
      const res = await triggerSchedulerJob(job.id);
      setJobToast({
        id: job.id,
        success: res.status === "SUCCESS",
        message: `Job completed in ${res.duration_ms}ms: ${res.output}`,
      });
      await loadJobs();
    } catch (e: any) {
      setJobToast({
        id: job.id,
        success: false,
        message: `Execution failed: ${e.message || e}`,
      });
      await loadJobs();
    } finally {
      setExecutingJobId(null);
    }
  };

  // View Logs
  const handleOpenLogs = async (job: SchedulerJob) => {
    setActiveLogJob(job);
    setLogsLoading(true);
    try {
      const logs = await getSchedulerJobLogs(job.id, 15);
      setJobLogs(logs);
    } catch (e) {
      console.error("Failed to load job logs", e);
    } finally {
      setLogsLoading(false);
    }
  };

  // Edit Cron Expression
  const handleOpenEditCron = (job: SchedulerJob) => {
    setEditingJob(job);
    setCronDraft(job.cron_expression);
    setCronError(null);
  };

  const handleSaveCron = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob || !cronDraft.trim()) return;
    setCronSaving(true);
    setCronError(null);
    try {
      await updateSchedulerJob(editingJob.id, { cron_expression: cronDraft.trim() });
      await loadJobs();
      setEditingJob(null);
    } catch (err: any) {
      setCronError(err.message || "Invalid cron expression");
    } finally {
      setCronSaving(false);
    }
  };

  const activeJobsCount = jobs.filter((j) => j.is_active).length;
  const inactiveJobsCount = jobs.filter((j) => !j.is_active).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      {!embedded && (
        <div className="border-b border-brand-purple/10 pb-5">
          <Eyebrow>Developer &amp; System Tools</Eyebrow>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-brand text-3xl font-bold tracking-tight text-brand-deep">
                Developer Settings
              </h1>
              <p className="mt-1 text-sm text-muted">
                Simulate business dates, test scheduled background jobs, and manage automated cron tasks.
              </p>
            </div>
            <Badge tone="accent" className="px-3 py-1 text-xs">
              Admin / Dev Access
            </Badge>
          </div>
        </div>
      )}

      {/* ── SECTION 1: System Configurations & Business Date Simulator ── */}
      <section aria-labelledby="configurations-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="configurations-heading" className="font-brand text-xl font-bold text-brand-deep">
                  Configurations &amp; Business Date
                </h2>
                {clockState?.is_simulated ? (
                  <Badge tone="warn" className="text-[10px] animate-pulse">
                    Simulated Date Active
                  </Badge>
                ) : (
                  <Badge tone="live" className="text-[10px]">
                    Live System Clock
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted">
                Control the virtual calendar date for the application to test pre-event reminders, seat holds, and cron schedules.
              </p>
            </div>
          </div>
        </div>

        <Card className="border border-brand-purple/15 p-6 shadow-sm">
          {/* Active Status Banner */}
          <div
            className={cx(
              "flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 transition-all",
              clockState?.is_simulated
                ? "border-amber-300 bg-amber-50/80 text-amber-950"
                : "border-emerald-200 bg-emerald-50/70 text-emerald-950",
            )}
          >
            <div className="flex items-center gap-3">
              {clockState?.is_simulated ? (
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Active Application Business Date
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="font-brand text-2xl font-bold">
                    {clockState?.effective_date || "Loading..."}
                  </span>
                  <span className="text-xs text-muted">
                    ({clockState?.timezone || "SGT"})
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right text-xs text-muted">
              <p>Real-World System Date: <strong className="text-brand-deep">{clockState?.system_date || "—"}</strong></p>
              <p className="mt-0.5">
                Mode: {clockState?.is_simulated ? "Virtual Date Simulation" : "Real-Time Clock"}
              </p>
            </div>
          </div>

          {/* Date Picker Input & Actions */}
          <form onSubmit={handleSetDate} className="mt-6 flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-auto">
              <label htmlFor="business-date-input" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                Set Specific Date (YYYY-MM-DD)
              </label>
              <input
                id="business-date-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-56 rounded-xl border border-brand-purple/20 bg-white px-3.5 py-2.5 text-sm font-medium text-brand-deep shadow-xs focus:border-brand-purple focus:outline-none focus:ring-4 focus:ring-brand-purple/15"
                required
              />
            </div>

            <Button
              type="submit"
              size="md"
              disabled={clockLoading || selectedDate === clockState?.effective_date}
              className="gap-2"
            >
              <CalendarClock className="h-4 w-4" />
              Apply Date
            </Button>

            <div className="flex flex-wrap items-center gap-1.5 border-l border-brand-purple/15 pl-3 sm:ml-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted mr-1">Quick Jump:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clockLoading}
                onClick={() => handleAdvanceDate(1)}
                title="Advance +1 Day"
              >
                +1 Day
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clockLoading}
                onClick={() => handleAdvanceDate(3)}
                title="Advance +3 Days"
              >
                +3 Days
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clockLoading}
                onClick={() => handleAdvanceDate(7)}
                title="Advance +1 Week"
              >
                +1 Week
              </Button>

              {clockState?.is_simulated && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={clockLoading}
                  onClick={handleResetDate}
                  className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  title="Reset to Live Date"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                  Reset to Today
                </Button>
              )}
            </div>
          </form>

          {clockNotice && (
            <p className="mt-3 text-xs font-medium text-brand-purple flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-orange shrink-0" />
              {clockNotice}
            </p>
          )}

          <p className="mt-4 border-t border-brand-purple/10 pt-3 text-xs text-muted">
            💡 <strong>How Business Date works:</strong> All date-sensitive operations (e.g. pre-event ticket reminders, hold releases, cancellation cutoffs, and exchange settlements) reference this active business date. User login tokens and passwords still use real UTC timestamps for safety.
          </p>
        </Card>

        {/* Web Search & Engine Indexing Controls */}
        <div className="pt-2">
          <WebSearchableControl />
        </div>
      </section>

      {/* ── SECTION 2: Quartz Scheduler Jobs ── */}
      <section aria-labelledby="scheduler-jobs-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-purple/10 text-brand-purple">
              <CalendarClock className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="scheduler-jobs-heading" className="font-brand text-xl font-bold text-brand-deep">
                  Scheduler Jobs (Quartz Engine)
                </h2>
                <Badge tone="live" className="text-[10px]">
                  Enterprise Scheduler
                </Badge>
              </div>
              <p className="text-sm text-muted">
                Background tasks and automated cron schedules. Toggle cron automation or trigger manual runs anytime.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadJobs()}
            disabled={jobsLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cx("h-3.5 w-3.5", jobsLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Global Toast for Job Action */}
        {jobToast && (
          <div
            className={cx(
              "flex items-start justify-between gap-3 rounded-2xl border p-4 shadow-sm text-sm transition-all animate-fadeIn",
              jobToast.success
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : "border-red-300 bg-red-50 text-red-950",
            )}
          >
            <div className="flex items-center gap-2.5">
              {jobToast.success ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-red-600" />
              )}
              <div>
                <p className="font-semibold">{jobToast.id}: {jobToast.success ? "Success" : "Failed"}</p>
                <p className="text-xs mt-0.5 opacity-90">{jobToast.message}</p>
              </div>
            </div>
            <button
              onClick={() => setJobToast(null)}
              className="text-muted hover:text-brand-deep p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Metrics Row */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="p-4 border-brand-purple/15">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Configured Jobs</p>
            <p className="mt-1 font-brand text-2xl font-bold text-brand-deep">{jobs.length}</p>
          </Card>
          <Card className="p-4 border-brand-purple/15 bg-emerald-50/40">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Active Cron Jobs</p>
            <p className="mt-1 font-brand text-2xl font-bold text-emerald-700">{activeJobsCount}</p>
            <p className="text-[11px] text-emerald-600">Auto-scheduled execution</p>
          </Card>
          <Card className="p-4 border-brand-purple/15 bg-neutral-50">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Inactive Jobs</p>
            <p className="mt-1 font-brand text-2xl font-bold text-brand-deep">{inactiveJobsCount}</p>
            <p className="text-[11px] text-muted">Manual trigger only</p>
          </Card>
          <Card className="p-4 border-brand-purple/15 bg-brand-lilac/30">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-purple">Virtual Reference</p>
            <p className="mt-1 font-brand text-lg font-bold text-brand-deep truncate">
              {clockState?.effective_date || "—"}
            </p>
            <p className="text-[11px] text-muted">{clockState?.is_simulated ? "Simulated clock" : "Live real-time"}</p>
          </Card>
        </div>

        {/* Jobs List / Cards */}
        <div className="space-y-3">
          {jobs.map((job) => {
            const isExecuting = executingJobId === job.id || job.status === "RUNNING";

            return (
              <Card
                key={job.id}
                className={cx(
                  "p-5 border transition-all duration-150",
                  job.is_active ? "border-brand-purple/20 bg-white" : "border-brand-purple/10 bg-slate-50/80",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Job Details */}
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-brand text-lg font-bold text-brand-deep">
                        {job.name}
                      </h3>
                      <Badge tone="accent" className="text-[10px]">
                        {job.group}
                      </Badge>
                      <span className="font-mono text-xs rounded-md bg-brand-lilac/60 px-2 py-0.5 text-brand-deep font-semibold">
                        {job.id}
                      </span>
                    </div>

                    <p className="text-xs text-muted leading-relaxed">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted">
                      <span className="flex items-center gap-1 font-mono bg-white border border-brand-purple/15 px-2 py-0.5 rounded-md">
                        <Clock className="h-3 w-3 text-brand-purple" />
                        {job.cron_expression}
                      </span>

                      {job.last_run_at && (
                        <span>
                          Last run:{" "}
                          <strong className="text-brand-deep">
                            {new Date(job.last_run_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </strong>
                          {job.last_duration_ms !== null && (
                            <span className="text-muted ml-1 font-mono">({job.last_duration_ms}ms)</span>
                          )}
                        </span>
                      )}

                      {job.last_status && (
                        <span className="flex items-center gap-1">
                          {job.last_status === "SUCCESS" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                              <XCircle className="h-3.5 w-3.5 text-red-600" /> Failed
                            </span>
                          )}
                        </span>
                      )}

                      {job.is_active && job.next_run_at && (
                        <span className="text-brand-purple font-medium">
                          Next due: {new Date(job.next_run_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Toggle & Action Controls */}
                  <div className="flex flex-wrap items-center gap-3 sm:self-center">
                    {/* Active / Inactive Toggle Switch */}
                    <div className="flex items-center gap-2 bg-white rounded-xl border border-brand-purple/15 px-3 py-1.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(job)}
                        className="cursor-pointer flex items-center gap-1.5 text-xs font-semibold focus:outline-none"
                        title={job.is_active ? "Click to set Inactive" : "Click to set Active"}
                      >
                        {job.is_active ? (
                          <>
                            <ToggleRight className="h-5 w-5 text-emerald-600" />
                            <span className="text-emerald-700">Active</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-5 w-5 text-muted" />
                            <span className="text-muted">Inactive</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Manual "Run Now" Trigger (Always Available!) */}
                    <Button
                      size="sm"
                      onClick={() => handleRunNow(job)}
                      disabled={isExecuting}
                      className={cx(
                        "gap-1.5 shadow-2xs",
                        job.is_active
                          ? "bg-brand-purple text-white hover:bg-brand-deep"
                          : "bg-brand-orange text-white hover:bg-brand-orange/90",
                      )}
                      title="Trigger an immediate execution right now (against active business date)"
                    >
                      {isExecuting ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                      {isExecuting ? "Running…" : "Run Now"}
                    </Button>

                    {/* Edit Cron Expression */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEditCron(job)}
                      title="Edit cron expression"
                      className="px-2.5"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-muted" />
                    </Button>

                    {/* View Logs Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenLogs(job)}
                      title="View execution logs"
                      className="gap-1 text-xs"
                    >
                      <FileText className="h-3.5 w-3.5 text-brand-purple" />
                      Logs
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── LOGS MODAL ── */}
      {activeLogJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fadeIn">
          <Card className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-purple/15 bg-brand-lilac/30 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-brand-purple" />
                <div>
                  <h3 className="font-brand text-lg font-bold text-brand-deep">
                    Execution Logs: {activeLogJob.name}
                  </h3>
                  <p className="text-xs text-muted font-mono">{activeLogJob.id}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveLogJob(null)}
                className="rounded-xl p-1.5 text-muted hover:bg-brand-lilac hover:text-brand-deep transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6 space-y-3">
              {logsLoading ? (
                <div className="py-8 text-center text-sm text-muted flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-brand-purple" />
                  Loading execution history…
                </div>
              ) : jobLogs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  No execution logs recorded yet for this job. Click &ldquo;Run Now&rdquo; to test execution.
                </p>
              ) : (
                jobLogs.map((log) => (
                  <div
                    key={log.id}
                    className={cx(
                      "rounded-2xl border p-4 text-xs transition-all",
                      log.status === "SUCCESS"
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-red-200 bg-red-50/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-2">
                      <div className="flex items-center gap-2">
                        {log.status === "SUCCESS" ? (
                          <Badge tone="live" className="text-[10px]">SUCCESS</Badge>
                        ) : (
                          <Badge tone="danger" className="text-[10px]">FAILURE</Badge>
                        )}
                        <span className="font-mono text-muted">
                          Triggered by: <strong>{log.triggered_by}</strong>
                        </span>
                        {log.simulated_business_date && (
                          <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 font-mono text-[10px]">
                            BusDate: {log.simulated_business_date}
                          </span>
                        )}
                      </div>
                      <span className="text-muted">
                        {new Date(log.started_at).toLocaleString()} · {log.duration_ms}ms
                      </span>
                    </div>

                    <div className="mt-2.5 space-y-1">
                      {log.output_summary && (
                        <p className="font-mono text-brand-deep whitespace-pre-wrap">
                          {log.output_summary}
                        </p>
                      )}
                      {log.error_message && (
                        <p className="font-mono text-red-700 bg-red-100/70 p-2 rounded-lg whitespace-pre-wrap">
                          {log.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end border-t border-brand-purple/10 bg-neutral-50 px-6 py-3">
              <Button variant="outline" size="sm" onClick={() => setActiveLogJob(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── EDIT CRON MODAL ── */}
      {editingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fadeIn">
          <Card className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-purple/15 pb-3">
              <div>
                <h3 className="font-brand text-lg font-bold text-brand-deep">
                  Edit Cron: {editingJob.name}
                </h3>
                <p className="text-xs text-muted font-mono">{editingJob.id}</p>
              </div>
              <button
                onClick={() => setEditingJob(null)}
                className="rounded-xl p-1.5 text-muted hover:bg-brand-lilac hover:text-brand-deep"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCron} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                  Cron Expression (Quartz or standard 5/6 fields)
                </label>
                <input
                  type="text"
                  value={cronDraft}
                  onChange={(e) => setCronDraft(e.target.value)}
                  className="w-full rounded-xl border border-brand-purple/20 px-3.5 py-2.5 font-mono text-sm text-brand-deep focus:border-brand-purple focus:outline-none focus:ring-4 focus:ring-brand-purple/15"
                  required
                />
                <p className="mt-1.5 text-xs text-muted">
                  Examples: <code className="bg-brand-lilac/40 px-1 rounded">0 0 8 * * ?</code> (Daily at 8am),{" "}
                  <code className="bg-brand-lilac/40 px-1 rounded">*/30 * * * * *</code> (Every 30s),{" "}
                  <code className="bg-brand-lilac/40 px-1 rounded">0 * * * * ?</code> (Every 1m).
                </p>
              </div>

              {cronError && (
                <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{cronError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-brand-purple/10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingJob(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={cronSaving || !cronDraft.trim()}
                >
                  {cronSaving ? "Saving…" : "Save Schedule"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
