import { getDatabase } from '../../db/connection.js';
import { LeadDistributionService } from '../../leads/leadDistributionService.js';
import { NotificationService } from '../../notifications/notificationService.js';
import { JobEngine } from '../jobEngine.js';
import { JOB_NAMES, type JobExecutionResult } from '../types.js';

export class LeadOpportunityExpiryJob {
  static async run(
    options: { triggerType?: 'SYSTEM' | 'MANUAL' | 'SCHEDULED'; userId?: string } = {}
  ): Promise<JobExecutionResult> {
    return JobEngine.executeJob(
      JOB_NAMES.LEAD_OPPORTUNITY_EXPIRY,
      {
        triggerType: options.triggerType || 'SYSTEM',
        runKey: JOB_NAMES.LEAD_OPPORTUNITY_EXPIRY,
        userId: options.userId,
        lockTimeoutSeconds: 300,
      },
      async (_jobId) => {
        const db = getDatabase();

        // 1. Query all pending opportunities whose 1-hour acceptance window has passed
        const expiredOpportunities = await db.query<{
          id: string;
          lead_id: string;
          franchise_id: string;
          campaign_id: string;
        }>(
          `SELECT id, lead_id, franchise_id, campaign_id 
           FROM lead_opportunities 
           WHERE status = 'pending' 
             AND expires_at <= CURRENT_TIMESTAMP`
        );

        let expiredCount = 0;
        let reroutedToNextCount = 0;
        let reroutedToOwnLeadCenterCount = 0;
        const details: any[] = [];

        for (const opp of expiredOpportunities) {
          try {
            // Atomic release & re-routing (checks status = 'pending' inside transaction)
            const releaseResult = await LeadDistributionService.releaseExpiredOpportunity(
              opp.id,
              { userId: options.userId || 'system_job_runner' }
            );

            expiredCount++;

            // 1. Notify the franchise whose opportunity expired
            await NotificationService.notifyOrganization(opp.franchise_id, {
              type: 'opportunity_expired',
              title: 'Lead Opportunity Expired',
              message: `The 1-hour window to accept Lead (${opp.lead_id}) has expired. The lead has been re-allocated.`,
              entityType: 'lead',
              entityId: opp.lead_id,
              referenceData: { opportunityId: opp.id },
            });

            // 2. Check next routing destination
            const routing = releaseResult.nextRouting;
            if (routing?.status === 'offered' && routing.franchiseId) {
              reroutedToNextCount++;

              // Notify the new recipient franchise
              await NotificationService.notifyOrganization(routing.franchiseId, {
                type: 'lead_opportunity',
                title: 'New Lead Opportunity Available',
                message: `A new matched lead has been assigned to your campaign. You have 1 hour to accept this lead.`,
                entityType: 'lead',
                entityId: opp.lead_id,
                referenceData: { opportunityId: routing.opportunityId },
              });
            } else if (routing?.status === 'unassigned') {
              reroutedToOwnLeadCenterCount++;

              // Notify Super Admins that lead entered Own Lead Center pool
              await NotificationService.notifySuperAdmins({
                type: 'lead_unassigned',
                title: 'Lead Moved to Own Lead Center Pool',
                message: `Lead (${opp.lead_id}) exhausted campaign routing and is now available in Own Lead Center.`,
                entityType: 'lead',
                entityId: opp.lead_id,
              });
            }

            details.push({
              opportunityId: opp.id,
              leadId: opp.lead_id,
              previousFranchise: opp.franchise_id,
              nextRoutingStatus: routing?.status,
              nextFranchise: routing?.franchiseId || null,
            });
          } catch (err: any) {
            // If already accepted/expired concurrently by another thread, safely skip
            console.error(`Error processing expired opportunity ${opp.id}:`, err?.message);
          }
        }

        return {
          data: { details },
          summary: {
            scannedCount: expiredOpportunities.length,
            expiredCount,
            reroutedToNextCount,
            reroutedToOwnLeadCenterCount,
          },
        };
      }
    );
  }
}
