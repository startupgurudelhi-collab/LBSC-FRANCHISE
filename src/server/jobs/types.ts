export const JOB_NAMES = {
  CAMPAIGN_DAILY_CHARGES: 'campaign_daily_charges',
  LEAD_OPPORTUNITY_EXPIRY: 'lead_opportunity_expiry',
  SERVICE_APPLICATION_SLA: 'service_application_sla',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export type JobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export type JobTriggerType = 'SYSTEM' | 'MANUAL' | 'SCHEDULED';

export interface BackgroundJobModel {
  id: string;
  job_name: JobName | string;
  status: JobStatus;
  trigger_type: JobTriggerType;
  run_key?: string | null;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  summary?: Record<string, any> | null;
  error_message?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
}

export interface JobExecutionOptions {
  triggerType?: JobTriggerType;
  runKey?: string;
  userId?: string;
  lockTimeoutSeconds?: number;
}

export interface JobExecutionResult<T = any> {
  jobId: string;
  jobName: string;
  status: JobStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  data?: T;
  summary?: Record<string, any>;
  error?: string;
}
