export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TicketCategory =
  | 'technical'
  | 'commission_billing'
  | 'lead_dispute'
  | 'service_inquiry'
  | 'general';

export const TICKET_CATEGORIES: { id: TicketCategory; label: string; description: string }[] = [
  { id: 'technical', label: 'Technical & Portal Support', description: 'System bugs, login issues, software defects' },
  { id: 'commission_billing', label: 'Commission & Wallet Billing', description: 'Payout discrepancies, wallet balance, deductions' },
  { id: 'lead_dispute', label: 'Lead Allocation & Dispute', description: 'Territory overlaps, non-responsive leads, duplicate leads' },
  { id: 'service_inquiry', label: 'Service Catalog & Documentation', description: 'Statutory requirements, government filing delays, SLA queries' },
  { id: 'general', label: 'General Operational Query', description: 'Franchise governance, training, other inquiries' },
];

export interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_internal: number; // 0 for public/franchise, 1 for internal admin note
  created_at: string;
  // Augmented user info
  author_name?: string;
  author_email?: string;
  author_role?: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  organization_id: string;
  created_by_user_id: string;
  assigned_to_user_id: string | null;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  // Augmented fields from joins
  organization_name?: string;
  franchise_code?: string;
  city?: string;
  creator_name?: string;
  creator_email?: string;
  assignee_name?: string;
  assignee_email?: string;
  message_count?: number;
  last_message_at?: string;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  organizationId?: string; // Optional for Super Admin if raising on behalf
}

export interface AddMessageInput {
  message: string;
  is_internal?: boolean;
}

export interface TicketFilterCriteria {
  status?: string;
  priority?: string;
  category?: string;
  franchiseId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  urgent: number;
}
