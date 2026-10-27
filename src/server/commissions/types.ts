/**
 * Phase 5: Commission Account & Ledger Types
 * 
 * Rules:
 * - Negative commission balance is allowed.
 * - Never edit or delete historical ledger entries.
 * - Corrections must use reversal/adjustment entries.
 * - Balance-changing operations must use database transactions and concurrency-safe logic.
 */

export const LEDGER_ENTRY_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit',
} as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPE)[keyof typeof LEDGER_ENTRY_TYPE];

export const LEDGER_CATEGORY = {
  COMMISSION_EARNED: 'commission_earned',
  MANUAL_ADJUSTMENT_CREDIT: 'manual_adjustment_credit',
  MANUAL_ADJUSTMENT_DEBIT: 'manual_adjustment_debit',
  PAYOUT_TRANSFER: 'payout_transfer',
  CORRECTION_REVERSAL: 'correction_reversal',
  CAMPAIGN_DAILY_CHARGE: 'campaign_daily_charge',
  BUY_LEAD: 'BUY_LEAD',
} as const;

export type LedgerCategory = (typeof LEDGER_CATEGORY)[keyof typeof LEDGER_CATEGORY];

export interface FranchiseCommissionAccountModel {
  id: string;
  organization_id: string;
  current_balance: number;
  currency: string;
  version: number; // Concurrency version
  zero_balance_buy_count?: number; // Count of buy leads purchased while balance <= 0 (max 3)
  created_at: string;
  updated_at: string;
}

export interface CommissionLedgerEntryModel {
  id: string;
  account_id: string;
  organization_id: string;
  entry_type: LedgerEntryType; // credit | debit
  category: LedgerCategory;
  amount: number; // Positive float
  balance_before: number;
  balance_after: number;
  reference_id: string; // Unique idempotency/transaction reference
  external_reference?: string | null;
  description: string;
  metadata?: string | null; // JSON
  created_by_user_id: string | null;
  created_at: string;
}

export interface FranchiseCommissionAccountDetail extends FranchiseCommissionAccountModel {
  franchise_code?: string;
  operating_name?: string;
  total_credit_count?: number;
  total_debit_count?: number;
}

// ==========================================
// Phase 21A: Settlement Statement Types
// ==========================================
export interface SettlementStatementPeriod {
  startDate: string | null;
  endDate: string | null;
}

export interface SettlementStatementSummary {
  openingBalance: number;
  earnedCommissions: number;
  campaignDeductions: number;
  buyLeadDeductions: number;
  manualAdjustments: number; // net manual adjustment (credits - debits)
  manualCredits: number;
  manualDebits: number;
  payouts: number;
  reversals: number;
  closingBalance: number;
  netChange: number;
}

export interface SettlementStatementFranchiseInfo {
  organizationId: string;
  franchiseCode: string;
  operatingName: string;
  legalName?: string;
  city?: string;
  district?: string;
  state?: string;
  currency: string;
  currentAccountBalance: number;
}

export interface SettlementStatementEntry {
  id: string;
  date: string;
  category: string;
  entryType: 'credit' | 'debit';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string;
  externalReference?: string | null;
  description: string;
}

export interface SettlementStatementResult {
  openingBalance: number;
  earnedCommissions: number;
  campaignDeductions: number;
  buyLeadDeductions: number;
  manualAdjustments: number;
  payouts: number;
  closingBalance: number;
  opening_balance?: number;
  earned_commissions?: number;
  campaign_deductions?: number;
  buy_lead_deductions?: number;
  manual_adjustments?: number;
  closing_balance?: number;
  franchise: SettlementStatementFranchiseInfo;
  period: SettlementStatementPeriod;
  summary: SettlementStatementSummary;
  entries: SettlementStatementEntry[];
  totalEntriesCount: number;
  generatedAt: string;
}

