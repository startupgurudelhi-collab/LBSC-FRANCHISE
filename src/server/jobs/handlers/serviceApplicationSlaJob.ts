import { getDatabase } from '../../db/connection.js';
import { NotificationService } from '../../notifications/notificationService.js';
import { JobEngine } from '../jobEngine.js';
import { JOB_NAMES, type JobExecutionResult } from '../types.js';

export class ServiceApplicationSlaJob {
  static async run(
    options: { triggerType?: 'SYSTEM' | 'MANUAL' | 'SCHEDULED'; userId?: string } = {}
  ): Promise<JobExecutionResult> {
    return JobEngine.executeJob(
      JOB_NAMES.SERVICE_APPLICATION_SLA,
      {
        triggerType: options.triggerType || 'SYSTEM',
        runKey: JOB_NAMES.SERVICE_APPLICATION_SLA,
        userId: options.userId,
        lockTimeoutSeconds: 300,
      },
      async (_jobId) => {
        const db = getDatabase();

        // 1. Query active service applications (submitted, under_review, in_progress)
        const activeApps = await db.query<any>(
          `SELECT a.id, a.application_number, a.status, a.sla_due_at, a.submitted_at, 
                  a.created_at, a.franchise_id, a.assigned_to_user_id,
                  s.name as service_name, s.turnaround_days, s.sla_hours
           FROM service_applications a
           LEFT JOIN service_masters s ON a.service_id = s.id
           WHERE a.status IN ('submitted', 'under_review', 'in_progress')`
        );

        let approachingCount = 0;
        let breachedCount = 0;
        let onTrackCount = 0;
        let notificationsGenerated = 0;

        const nowMs = Date.now();

        for (const app of activeApps) {
          // Calculate SLA Due Time
          const slaHours = app.sla_hours
            ? Number(app.sla_hours)
            : app.turnaround_days
            ? Number(app.turnaround_days) * 24
            : 72;

          let slaDueAt = app.sla_due_at;
          if (!slaDueAt) {
            const baseMs = new Date(app.submitted_at || app.created_at).getTime();
            slaDueAt = new Date(baseMs + slaHours * 3600 * 1000).toISOString();
          }

          const dueMs = new Date(slaDueAt).getTime();
          const diffMs = dueMs - nowMs;
          const slaRemainingHours = Math.round((diffMs / (3600 * 1000)) * 10) / 10;

          const twentyFourHoursAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

          if (slaRemainingHours < 0) {
            // SLA BREACHED!
            breachedCount++;

            // Deduplication: check if 'sla_breached' notification was emitted for this application in the last 24h
            // Using standard parameterized timestamp comparison compatible with both SQLite and PostgreSQL
            const recentNotif = await db.query<any>(
              `SELECT id FROM notifications 
               WHERE entity_id = ? 
                 AND type = 'sla_breached'
                 AND created_at >= ?
               LIMIT 1`,
              [app.id, twentyFourHoursAgoIso]
            );

            if (recentNotif.length === 0) {
              notificationsGenerated++;
              const title = `SLA Breached: Application ${app.application_number}`;
              const message = `Service Application ${app.application_number} (${app.service_name}) has breached its fulfillment SLA deadline by ${Math.abs(slaRemainingHours)} hours.`;

              // Notify Super Admins
              await NotificationService.notifySuperAdmins({
                type: 'sla_breached',
                title,
                message,
                entityType: 'service_application',
                entityId: app.id,
                referenceData: {
                  applicationNumber: app.application_number,
                  slaRemainingHours,
                  status: app.status,
                },
              });

              // Also notify assigned staff member if present
              if (app.assigned_to_user_id) {
                await NotificationService.createNotification({
                  userId: app.assigned_to_user_id,
                  organizationId: app.franchise_id,
                  type: 'sla_breached',
                  title,
                  message,
                  entityType: 'service_application',
                  entityId: app.id,
                  referenceData: {
                    applicationNumber: app.application_number,
                    slaRemainingHours,
                    status: app.status,
                  },
                });
              }
            }
          } else if (slaRemainingHours <= 24) {
            // SLA APPROACHING DEADLINE (<= 24 hours remaining)
            approachingCount++;

            // Deduplication: check if 'sla_approaching' notification was emitted in last 24h
            // Using standard parameterized timestamp comparison compatible with both SQLite and PostgreSQL
            const recentNotif = await db.query<any>(
              `SELECT id FROM notifications 
               WHERE entity_id = ? 
                 AND type = 'sla_approaching'
                 AND created_at >= ?
               LIMIT 1`,
              [app.id, twentyFourHoursAgoIso]
            );

            if (recentNotif.length === 0) {
              notificationsGenerated++;
              const title = `SLA Approaching: Application ${app.application_number}`;
              const message = `Service Application ${app.application_number} (${app.service_name}) has ${slaRemainingHours} hours remaining before SLA deadline.`;

              // Notify Super Admins
              await NotificationService.notifySuperAdmins({
                type: 'sla_approaching',
                title,
                message,
                entityType: 'service_application',
                entityId: app.id,
                referenceData: {
                  applicationNumber: app.application_number,
                  slaRemainingHours,
                  status: app.status,
                },
              });

              // Notify assigned staff
              if (app.assigned_to_user_id) {
                await NotificationService.createNotification({
                  userId: app.assigned_to_user_id,
                  organizationId: app.franchise_id,
                  type: 'sla_approaching',
                  title,
                  message,
                  entityType: 'service_application',
                  entityId: app.id,
                  referenceData: {
                    applicationNumber: app.application_number,
                    slaRemainingHours,
                    status: app.status,
                  },
                });
              }
            }
          } else {
            onTrackCount++;
          }
          // IMPORTANT: Application status in database is NOT modified!
        }

        return {
          data: {
            scannedCount: activeApps.length,
            onTrackCount,
            approachingCount,
            breachedCount,
            notificationsGenerated,
          },
          summary: {
            scannedCount: activeApps.length,
            onTrackCount,
            approachingCount,
            breachedCount,
            notificationsGenerated,
          },
        };
      }
    );
  }
}
