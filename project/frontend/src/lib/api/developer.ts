import { request } from "./client";

export type BusinessDateState = {
  is_simulated: boolean;
  simulated_date: string | null;
  system_date: string;
  effective_date: string;
  effective_now: string;
  timezone: string;
};

export type SchedulerJob = {
  id: string;
  name: string;
  group: string;
  description: string;
  cron_expression: string;
  is_active: boolean;
  status: "IDLE" | "RUNNING" | "PAUSED" | "ERROR";
  last_run_at: string | null;
  next_run_at: string | null;
  last_duration_ms: number | null;
  last_status: "SUCCESS" | "FAILURE" | null;
};

export type SchedulerJobLog = {
  id: string;
  job_id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: "SUCCESS" | "FAILURE" | "RUNNING";
  simulated_business_date: string | null;
  triggered_by: string;
  output_summary: string | null;
  error_message: string | null;
};

export async function getBusinessDateState(): Promise<BusinessDateState> {
  return request<BusinessDateState>("/admin/developer/business-date", undefined, true);
}

export async function setBusinessDate(dateStr: string | null): Promise<BusinessDateState> {
  return request<BusinessDateState>("/admin/developer/business-date", {
    method: "POST",
    body: JSON.stringify({ date: dateStr }),
  }, true);
}

export async function advanceBusinessDate(days = 1): Promise<BusinessDateState> {
  return request<BusinessDateState>("/admin/developer/business-date/advance", {
    method: "POST",
    body: JSON.stringify({ days }),
  }, true);
}

export async function getSchedulerJobs(): Promise<SchedulerJob[]> {
  return request<SchedulerJob[]>("/admin/developer/scheduler/jobs", undefined, true);
}

export async function triggerSchedulerJob(jobId: string): Promise<{ status: string; output: string; duration_ms: number }> {
  return request<{ status: string; output: string; duration_ms: number }>(`/admin/developer/scheduler/jobs/${encodeURIComponent(jobId)}/run`, {
    method: "POST",
  }, true);
}

export async function updateSchedulerJob(jobId: string, payload: { is_active?: boolean; cron_expression?: string }): Promise<Partial<SchedulerJob>> {
  return request<Partial<SchedulerJob>>(`/admin/developer/scheduler/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, true);
}

export async function getSchedulerJobLogs(jobId: string, limit = 15): Promise<SchedulerJobLog[]> {
  return request<SchedulerJobLog[]>(`/admin/developer/scheduler/jobs/${encodeURIComponent(jobId)}/logs?limit=${limit}`, undefined, true);
}

