export const SERVICE_APPLICATION_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type ServiceApplicationStatus =
  (typeof SERVICE_APPLICATION_STATUS)[keyof typeof SERVICE_APPLICATION_STATUS];

export const DOCUMENT_STATUS = {
  MISSING: 'MISSING',
  UPLOADED: 'UPLOADED',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;

export type DocumentStatus = (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

export const COMMISSION_STATUS = {
  PENDING: 'PENDING',
  RELEASED: 'RELEASED',
} as const;

export type CommissionStatus = (typeof COMMISSION_STATUS)[keyof typeof COMMISSION_STATUS];

export interface ServiceApplicationDocument {
  id: string;
  application_id: string;
  document_name: string;
  description: string | null;
  is_required: boolean | number;
  status: DocumentStatus;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  file_url: string | null;
  file_data?: string | null;
  uploaded_at: string | null;
  uploaded_by_user_id: string | null;
  uploaded_by_name?: string | null;
  verified_at: string | null;
  verified_by_user_id: string | null;
  verified_by_name?: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceApplication {
  id: string;
  application_number: string;
  franchise_id: string;
  franchise_name?: string;
  franchise_code?: string;
  client_id: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  service_id: string;
  service_name?: string;
  service_code?: string;
  status: ServiceApplicationStatus;
  status_reason: string | null;
  custom_fields: Record<string, any> | null;
  notes: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Financial & Commission Snapshots
  service_fee_snapshot: number;
  commission_value_snapshot: number;
  commission_notes_snapshot: string | null;

  // Lifecycle
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  submitted_by_name?: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name?: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  approved_by_name?: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  completed_by_name?: string | null;

  // Assignment
  assigned_to_user_id: string | null;
  assigned_to_name?: string | null;
  assigned_at: string | null;
  assigned_by_user_id: string | null;
  assigned_by_name?: string | null;
  assignment_notes: string | null;
  last_reassigned_at?: string | null;
  reassigned_count?: number;

  // SLA & Operations
  sla_due_at: string | null;
  sla_hours?: number;
  turnaround_days?: number;
  sla_remaining_hours?: number | null;
  sla_status?: SlaStatus;
  work_notes_count?: number;
  latest_work_note?: string | null;

  // Commission Release
  commission_status: CommissionStatus;
  commission_released_at: string | null;
  commission_released_by_user_id: string | null;
  ledger_entry_id: string | null;
  ledger_reference_id: string | null;

  // Phase 19: Efilingg & Government Filing References
  external_filing_id?: string | null;
  arn_number?: string | null;
  srn_number?: string | null;
  challan_number?: string | null;
  efilingg_status?: string | null;
  efilingg_synced_at?: string | null;
  efilingg_sync_error?: string | null;

  // Metadata
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;

  // Associated Documents
  documents?: ServiceApplicationDocument[];
}

export interface CreateServiceApplicationInput {
  franchise_id?: string; // If super_admin, can specify; otherwise user's organizationId
  client_id: string;
  service_id: string;
  status?: 'DRAFT' | 'SUBMITTED';
  custom_fields?: Record<string, any> | null;
  notes?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface UpdateServiceApplicationInput {
  custom_fields?: Record<string, any> | null;
  notes?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface AssignWorkInput {
  assigned_to_user_id: string;
  assignment_notes?: string | null;
  move_to_assigned_status?: boolean;
}

export interface UploadDocumentInput {
  file_name: string;
  file_type?: string | null;
  file_size?: number | null;
  file_url?: string | null;
  file_data?: string | null;
}

export interface RejectDocumentInput {
  rejection_reason: string;
}

export interface ServiceApplicationFilters {
  franchise_id?: string;
  client_id?: string;
  service_id?: string;
  status?: string;
  commission_status?: string;
  assigned_to_user_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ==========================================
// PHASE 16A: WORK ASSIGNMENT & OPERATIONS TYPES
// ==========================================

export type SlaStatus =
  | 'ON_TRACK'
  | 'APPROACHING_DEADLINE'
  | 'BREACHED'
  | 'COMPLETED_ON_TIME'
  | 'COMPLETED_OVERDUE'
  | 'NOT_APPLICABLE';

export interface ServiceApplicationWorkNote {
  id: string;
  application_id: string;
  author_user_id: string;
  author_name?: string | null;
  author_email?: string | null;
  author_role?: string | null;
  note_type: 'work_note' | 'status_change' | 'assignment' | 'reassignment' | 'system';
  note: string;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ReassignWorkInput {
  assigned_to_user_id: string;
  reassignment_notes?: string | null;
  move_to_assigned_status?: boolean;
}

export interface AddWorkNoteInput {
  note: string;
  note_type?: 'work_note' | 'status_change' | 'system';
}

export interface WorkQueueFilters {
  assignment_status?: 'all' | 'assigned' | 'unassigned';
  assigned_to_user_id?: string;
  priority?: 'all' | 'low' | 'normal' | 'high' | 'urgent';
  status?: string;
  sla_status?: 'all' | 'on_track' | 'approaching_deadline' | 'breached';
  search?: string;
  franchise_id?: string;
  service_id?: string;
  page?: number;
  limit?: number;
  sort_by?: 'created_at' | 'submitted_at' | 'sla_due_at' | 'priority' | 'status';
  sort_order?: 'asc' | 'desc';
}

export interface WorkQueueSummary {
  total_active_queue: number;
  unassigned_count: number;
  assigned_count: number;
  in_progress_count: number;
  completed_count: number;
  approaching_sla_count: number;
  breached_sla_count: number;
  by_priority: {
    urgent: number;
    high: number;
    normal: number;
    low: number;
  };
}

export interface AssigneeOption {
  id: string;
  name: string;
  email: string;
  role?: string;
  active_assigned_count: number;
}

