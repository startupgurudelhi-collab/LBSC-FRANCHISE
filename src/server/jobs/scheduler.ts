import { getDatabase } from '../db/connection.js';
import { env } from '../config/env.js';
import { CampaignDailyChargeJob } from './handlers/campaignDailyChargeJob.js';
import { LeadOpportunityExpiryJob } from './handlers/leadOpportunityExpiryJob.js';
import { ServiceApplicationSlaJob } from './handlers/serviceApplicationSlaJob.js';
import { JOB_NAMES } from './types.js';

export interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  intervals: {
    leadExpiryMinutes: number;
    slaCheckMinutes: number;
    dailyChargeSchedule: string;
  };
  lastRuns: {
    leadExpiry?: string;
    slaCheck?: string;
    campaignCharges?: string;
  };
  activeTimersCount: number;
}

export class BackgroundScheduler {
  private static isRunning = false;
  private static leadExpiryTimer: NodeJS.Timeout | null = null;
  private static slaCheckTimer: NodeJS.Timeout | null = null;
  private static dailyChargeTimer: NodeJS.Timeout | null = null;

  private static lastLeadExpiryRun: string | undefined;
  private static lastSlaCheckRun: string | undefined;
  private static lastCampaignChargeRun: string | undefined;

  /**
   * Helper to get current calendar date string (YYYY-MM-DD) in Asia/Kolkata timezone.
   */
  public static getKolkataDateString(now: Date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now); // Produces 'YYYY-MM-DD'
  }

  /**
   * Helper to get milliseconds remaining until the next 00:01:00 in Asia/Kolkata timezone.
   */
  public static getMillisecondsUntilNextKolkata0001(now: Date = new Date()): number {
    const kolkataDateStr = BackgroundScheduler.getKolkataDateString(now);
    // Parse midnight in Kolkata for today: 'YYYY-MM-DDT00:01:00+05:30'
    const todayTarget = new Date(`${kolkataDateStr}T00:01:00+05:30`);
    
    if (todayTarget.getTime() > now.getTime()) {
      return todayTarget.getTime() - now.getTime();
    }

    // Otherwise target tomorrow's 00:01:00 in Kolkata (+ 24 hours baseline, accounting for target date)
    const [year, month, day] = kolkataDateStr.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    const nextKolkataDateStr = BackgroundScheduler.getKolkataDateString(tomorrow);
    const tomorrowTarget = new Date(`${nextKolkataDateStr}T00:01:00+05:30`);
    return Math.max(1000, tomorrowTarget.getTime() - now.getTime());
  }

  /**
   * Helper to get milliseconds remaining until the next minute :05:00 of the hour.
   * e.g., if current minute is 3, runs at minute 5 (in 2 minutes).
   * if current minute is 12, runs at :05 of the next hour (in 53 minutes).
   */
  public static getMillisecondsUntilNextHourMinute05(now: Date = new Date()): number {
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();
    const currentMs = now.getMilliseconds();

    let minutesUntilTarget: number;
    if (currentMinutes < 5) {
      minutesUntilTarget = 5 - currentMinutes;
    } else {
      minutesUntilTarget = 60 - currentMinutes + 5;
    }

    const totalMs = minutesUntilTarget * 60 * 1000 - currentSeconds * 1000 - currentMs;
    return Math.max(1000, totalMs);
  }

  /**
   * Startup recovery for campaign daily charges:
   * Checks if today's calendar date in Asia/Kolkata has already had a successful daily charge run.
   * If not, and if current Kolkata time is past 00:01, executes the job immediately to catch up.
   */
  public static async checkAndRecoverDailyCharges(now: Date = new Date()): Promise<void> {
    const todayKolkata = BackgroundScheduler.getKolkataDateString(now);
    const runKey = `${JOB_NAMES.CAMPAIGN_DAILY_CHARGES}:${todayKolkata}`;
    const db = getDatabase();

    try {
      const existingSuccess = await db.query<any>(
        `SELECT id, status, completed_at 
         FROM background_jobs 
         WHERE run_key = ? AND status = 'COMPLETED'
         LIMIT 1`,
        [runKey]
      );

      if (existingSuccess.length > 0) {
        console.log(`[Scheduler] Daily campaign charges for ${todayKolkata} already completed. No startup catchup needed.`);
        BackgroundScheduler.lastCampaignChargeRun = existingSuccess[0].completed_at;
        return;
      }

      // Check current time in Kolkata: is it >= 00:01?
      const targetTimeToday = new Date(`${todayKolkata}T00:01:00+05:30`).getTime();
      if (now.getTime() >= targetTimeToday) {
        console.log(`[Scheduler] Startup catch-up detected for missed daily charges (${todayKolkata}). Triggering recovery run...`);
        const result = await CampaignDailyChargeJob.run(todayKolkata, {
          triggerType: 'SCHEDULED',
        });
        BackgroundScheduler.lastCampaignChargeRun = new Date().toISOString();
        console.log(`[Scheduler] Startup catch-up completed: ${result.status} (Job ID: ${result.jobId})`);
      }
    } catch (err) {
      console.error('[Scheduler] Error checking/recovering missed daily charges:', err);
    }
  }

  /**
   * Starts all automatic background timers if enabled.
   */
  public static async start(): Promise<void> {
    if (!env.ENABLE_BACKGROUND_SCHEDULER) {
      console.log('ℹ️  Background scheduler is DISABLED via ENABLE_BACKGROUND_SCHEDULER=false.');
      return;
    }

    if (BackgroundScheduler.isRunning) {
      console.log('ℹ️  Background scheduler is already running.');
      return;
    }

    BackgroundScheduler.isRunning = true;
    console.log('⏰ Starting LBSC Background Scheduler...');

    // 1. Startup recovery for missed daily charges
    await BackgroundScheduler.checkAndRecoverDailyCharges();

    // 2. Schedule Lead Opportunity Expiry: every 5 minutes (300,000 ms)
    // Runs an immediate initial pass or interval
    const LEAD_EXPIRY_INTERVAL_MS = 5 * 60 * 1000;
    BackgroundScheduler.leadExpiryTimer = setInterval(async () => {
      try {
        console.log('[Scheduler] Executing scheduled Lead Opportunity Expiry check...');
        const result = await LeadOpportunityExpiryJob.run({
          triggerType: 'SCHEDULED',
        });
        BackgroundScheduler.lastLeadExpiryRun = new Date().toISOString();
        console.log(`[Scheduler] Lead Opportunity Expiry check finished: ${result.status}`);
      } catch (err) {
        console.error('[Scheduler] Lead Opportunity Expiry error:', err);
      }
    }, LEAD_EXPIRY_INTERVAL_MS);

    // 3. Schedule Service Application SLA Checks: hourly at minute :05
    BackgroundScheduler.scheduleNextSlaCheck();

    // 4. Schedule Campaign Daily Charges: daily at 00:01 Asia/Kolkata
    BackgroundScheduler.scheduleNextDailyCharge();

    console.log('✅ LBSC Background Scheduler started successfully.');
    console.log('   - Lead Expiry: every 5 minutes');
    console.log('   - SLA Checks: hourly at minute :05');
    console.log('   - Campaign Charges: daily at 00:01 Asia/Kolkata');
  }

  /**
   * Helper to schedule the SLA check timer to fire at the next :05 mark,
   * then continuously re-schedule for the subsequent hour's :05.
   */
  private static scheduleNextSlaCheck(): void {
    if (!BackgroundScheduler.isRunning) return;

    const msUntilNext05 = BackgroundScheduler.getMillisecondsUntilNextHourMinute05();
    console.log(`[Scheduler] Next hourly SLA check in ${Math.round(msUntilNext05 / 1000)}s`);

    BackgroundScheduler.slaCheckTimer = setTimeout(async () => {
      try {
        console.log('[Scheduler] Executing scheduled Service Application SLA check...');
        const result = await ServiceApplicationSlaJob.run({
          triggerType: 'SCHEDULED',
        });
        BackgroundScheduler.lastSlaCheckRun = new Date().toISOString();
        console.log(`[Scheduler] Service Application SLA check finished: ${result.status}`);
      } catch (err) {
        console.error('[Scheduler] Service Application SLA check error:', err);
      } finally {
        // Schedule next hourly cycle
        BackgroundScheduler.scheduleNextSlaCheck();
      }
    }, msUntilNext05);
  }

  /**
   * Helper to schedule the Campaign Daily Charge timer to fire at the next 00:01 Asia/Kolkata,
   * then continuously re-schedule for the subsequent day's 00:01.
   */
  private static scheduleNextDailyCharge(): void {
    if (!BackgroundScheduler.isRunning) return;

    const msUntil0001 = BackgroundScheduler.getMillisecondsUntilNextKolkata0001();
    console.log(`[Scheduler] Next daily campaign charge in ${Math.round(msUntil0001 / 1000)}s`);

    BackgroundScheduler.dailyChargeTimer = setTimeout(async () => {
      try {
        const todayKolkata = BackgroundScheduler.getKolkataDateString();
        console.log(`[Scheduler] Executing scheduled Campaign Daily Charges for ${todayKolkata}...`);
        const result = await CampaignDailyChargeJob.run(todayKolkata, {
          triggerType: 'SCHEDULED',
        });
        BackgroundScheduler.lastCampaignChargeRun = new Date().toISOString();
        console.log(`[Scheduler] Campaign Daily Charges finished: ${result.status} (Job ID: ${result.jobId})`);
      } catch (err) {
        console.error('[Scheduler] Campaign Daily Charges error:', err);
      } finally {
        // Schedule next day's run
        BackgroundScheduler.scheduleNextDailyCharge();
      }
    }, msUntil0001);
  }

  /**
   * Cleanly stop all active timers and mark scheduler as stopped.
   */
  public static stop(): void {
    if (!BackgroundScheduler.isRunning) return;

    console.log('🛑 Stopping Background Scheduler timers...');

    if (BackgroundScheduler.leadExpiryTimer) {
      clearInterval(BackgroundScheduler.leadExpiryTimer);
      BackgroundScheduler.leadExpiryTimer = null;
    }

    if (BackgroundScheduler.slaCheckTimer) {
      clearTimeout(BackgroundScheduler.slaCheckTimer);
      BackgroundScheduler.slaCheckTimer = null;
    }

    if (BackgroundScheduler.dailyChargeTimer) {
      clearTimeout(BackgroundScheduler.dailyChargeTimer);
      BackgroundScheduler.dailyChargeTimer = null;
    }

    BackgroundScheduler.isRunning = false;
    console.log('✅ Background Scheduler stopped cleanly.');
  }

  /**
   * Get scheduler diagnostic status.
   */
  public static getStatus(): SchedulerStatus {
    let activeTimersCount = 0;
    if (BackgroundScheduler.leadExpiryTimer) activeTimersCount++;
    if (BackgroundScheduler.slaCheckTimer) activeTimersCount++;
    if (BackgroundScheduler.dailyChargeTimer) activeTimersCount++;

    return {
      enabled: env.ENABLE_BACKGROUND_SCHEDULER,
      running: BackgroundScheduler.isRunning,
      intervals: {
        leadExpiryMinutes: 5,
        slaCheckMinutes: 60,
        dailyChargeSchedule: '00:01 Asia/Kolkata',
      },
      lastRuns: {
        leadExpiry: BackgroundScheduler.lastLeadExpiryRun,
        slaCheck: BackgroundScheduler.lastSlaCheckRun,
        campaignCharges: BackgroundScheduler.lastCampaignChargeRun,
      },
      activeTimersCount,
    };
  }
}
