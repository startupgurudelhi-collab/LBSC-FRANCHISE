/**
 * Types & Domain Definitions for Advertisement Requests (Phase 17A)
 * Strictly decoupled from Campaign Management.
 */

export const ADVERTISEMENT_REQUEST_STATUS = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;

export type AdvertisementRequestStatus =
  (typeof ADVERTISEMENT_REQUEST_STATUS)[keyof typeof ADVERTISEMENT_REQUEST_STATUS];

export const ADVERTISING_TYPE = {
  GOOGLE_SEARCH: 'google_search',
  SOCIAL_MEDIA: 'social_media',
  META_ADS: 'meta_ads',
  PRINT_NEWSPAPER: 'print_newspaper',
  LOCAL_HOARDING: 'local_hoarding',
  FLYERS_BROCHURES: 'flyers_brochures',
  RADIO_FM: 'radio_fm',
  DIGITAL_DISPLAY: 'digital_display',
  OTHER: 'other',
} as const;

export type AdvertisingType = (typeof ADVERTISING_TYPE)[keyof typeof ADVERTISING_TYPE] | string;

export interface AdvertisementRequest {
  id: string;
  request_number: string;
  franchise_id: string;
  franchise_name?: string;
  franchise_code?: string;
  created_by_user_id: string;
  created_by_name?: string;
  created_by_email?: string;
  title: string;
  description: string;
  advertising_type: string;
  service_id: string | null;
  service_name?: string | null;
  service_code?: string | null;
  target_audience: string | null;
  target_location: string | null;
  preferred_timeline: string | null;
  notes: string | null;
  reference_details: string | null;
  status: AdvertisementRequestStatus;
  rejection_reason: string | null;
  admin_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  approved_by_user_id: string | null;
  approved_by_name?: string | null;
  approved_at: string | null;
  completed_by_user_id: string | null;
  completed_by_name?: string | null;
  completed_at: string | null;
  rejected_by_user_id: string | null;
  rejected_by_name?: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvertisementRequestHistory {
  id: string;
  request_id: string;
  author_user_id: string;
  author_name?: string;
  author_role?: string;
  action_type:
    | 'created'
    | 'under_review'
    | 'approved'
    | 'rejected'
    | 'in_progress'
    | 'completed'
    | 'status_change'
    | 'admin_note';
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface CreateAdvertisementRequestInput {
  franchise_id?: string;
  title: string;
  description: string;
  advertising_type: string;
  service_id?: string | null;
  target_audience?: string | null;
  target_location?: string | null;
  preferred_timeline?: string | null;
  notes?: string | null;
  reference_details?: string | null;
}

export interface ReviewAdvertisementRequestInput {
  notes?: string | null;
}

export interface ApproveAdvertisementRequestInput {
  admin_notes?: string | null;
}

export interface RejectAdvertisementRequestInput {
  rejection_reason: string;
  admin_notes?: string | null;
}

export interface UpdateAdvertisementStatusInput {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'UNDER_REVIEW';
  notes?: string | null;
}

export interface AddAdvertisementNoteInput {
  note: string;
}

export interface AdvertisementRequestFilters {
  franchise_id?: string;
  status?: string;
  advertising_type?: string;
  service_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'created_at' | 'updated_at' | 'title' | 'status';
  sort_order?: 'asc' | 'desc';
}

export interface AdvertisementRequestSummary {
  total: number;
  pending: number;
  under_review: number;
  approved: number;
  in_progress: number;
  completed: number;
  rejected: number;
}
