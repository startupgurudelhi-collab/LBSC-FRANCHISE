import { CampaignService } from '../../campaigns/campaignService.js';
import { NotificationService } from '../../notifications/notificationService.js';
import { JobEngine } from '../jobEngine.js';
import { JOB_NAMES, type JobExecutionResult } from '../types.js';

export class CampaignDailyChargeJob {
  static async run(
    targetDate?: string,
    options: { triggerType?: 'SYSTEM' | 'MANUAL' | 'SCHEDULED'; userId?: string } = {}
  ): Promise<JobExecutionResult> {
    const dateToProcess = targetDate ? targetDate.trim() : new Date().toISOString().split('T')[0];
    const runKey = `${JOB_NAMES.CAMPAIGN_DAILY_CHARGES}:${dateToProcess}`;

    return JobEngine.executeJob(
      JOB_NAMES.CAMPAIGN_DAILY_CHARGES,
      {
        triggerType: options.triggerType || 'SYSTEM',
        runKey,
        userId: options.userId,
        lockTimeoutSeconds: 300,
      },
      async (_jobId) => {
        // Execute existing Campaign daily charge logic with full idempotency & 3-day grace enforcement
        const chargeSummary = await CampaignService.processDailyCharges(dateToProcess, {
          userId: options.userId || 'system_job_runner',
        });

        // Generate in-app notifications based on charge results
        for (const item of chargeSummary.results) {
          if (item.status === 'success') {
            await NotificationService.notifyOrganization(item.franchise, {
              type: 'campaign_charge',
              title: 'Daily Campaign Fee Processed',
              message: `Standard ₹100 daily fee deducted for date ${dateToProcess}. ${item.message}`,
              entityType: 'campaign',
              entityId: item.campaignId,
              referenceData: { chargeDate: dateToProcess, status: item.status },
            });
          } else if (
            item.status === 'paused_after_charge' ||
            item.status === 'paused_due_to_grace_exhausted'
          ) {
            // Notify Franchise of campaign pause
            await NotificationService.notifyOrganization(item.franchise, {
              type: 'campaign_paused',
              title: 'Campaign Auto-Paused (Zero Balance Grace Exhausted)',
              message: `Your campaign has been paused. Reason: 3-day negative balance grace exhausted. Please top up your commission ledger to reactivate.`,
              entityType: 'campaign',
              entityId: item.campaignId,
              referenceData: { chargeDate: dateToProcess, status: item.status },
            });

            // Notify Super Admin of pause event
            await NotificationService.notifySuperAdmins({
              type: 'campaign_paused',
              title: 'Franchise Campaign Auto-Paused',
              message: `Franchise campaign (${item.campaignId}) was auto-paused due to exhausted grace period.`,
              entityType: 'campaign',
              entityId: item.campaignId,
              referenceData: { franchiseId: item.franchise, chargeDate: dateToProcess },
            });
          }
        }

        return {
          data: chargeSummary,
          summary: {
            targetDate: chargeSummary.targetDate,
            totalActiveCampaigns: chargeSummary.totalActiveCampaigns,
            processedCount: chargeSummary.processedCount,
            successfulCharges: chargeSummary.successfulCharges,
            autoPausedCount: chargeSummary.autoPausedCount,
            alreadyChargedCount: chargeSummary.alreadyChargedCount,
            skippedCount: chargeSummary.skippedCount,
          },
        };
      }
    );
  }
}
