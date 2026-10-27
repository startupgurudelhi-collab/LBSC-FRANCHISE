/**
 * Phase 4: Service Management Types & Definitions
 * Cleaned up: Service Master with category, fee, single configurable commission value,
 * required documents, timeline/processing info, and active/inactive status.
 */

export interface ServiceCategoryModel {
  id: string;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RequiredDocumentItem {
  code: string;
  name: string;
  description?: string;
  is_mandatory: boolean;
  document_type?: string;
}

export interface ServiceMasterModel {
  id: string;
  category_id: string;
  code: string;
  name: string;
  description: string | null;
  
  // Single Service Fee
  service_fee: number;

  // Single configurable service-wise commission value
  commission_value: number;
  commission_notes: string | null;

  // Required documents (JSON array of RequiredDocumentItem)
  required_documents: string;

  // Timeline / Processing Information
  turnaround_days: number;
  sla_hours: number;
  timeline_description: string | null;

  // Status
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

export interface ServiceMasterDetail extends Omit<ServiceMasterModel, 'required_documents'> {
  required_documents: RequiredDocumentItem[];
  category_name?: string;
  category_code?: string;
}
