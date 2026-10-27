import { getDatabase } from '../db/connection.js';
import { ConflictError } from '../errors/AppError.js';
import type {
  JobName,
  JobStatus,
  JobTriggerType,
  BackgroundJobModel,
  JobExecutionOptions,
  JobExecutionResult,
} from './types.js';

export class JobEngine {
  /**
   * 1. Acquire durable database lock for a job run
   */
  static async acquireLock(
    lockName: string,
    lockedBy: string,
    timeoutSeconds: number = 300
  ): Promise<boolean> {
    const db = getDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutSeconds * 1000).toISOString();
    const nowIso = now.toISOString();

    // Check existing lock
    const existing = await db.query<any>(
      `SELECT lock_name, locked_by, locked_at, expires_at 
       FROM job_locks 
       WHERE lock_name = ? LIMIT 1`,
      [lockName]
    );

    if (existing.length > 0) {
      const lockRow = existing[0];
      const expiryTime = new Date(lockRow.expires_at).getTime();

      if (expiryTime > Date.now()) {
        // Lock is active and unexpired!
        throw new ConflictError(
          `Job '${lockName}' is currently running with an active lock held by execution '${lockRow.locked_by}'.`
        );
      }

      // Lock is expired: claim it atomically using compare-and-swap (CAS) semantics
      // Only one concurrent worker matching the exact observed expires_at will succeed
      const updateResult = await db.execute(
        `UPDATE job_locks 
         SET locked_by = ?, locked_at = ?, expires_at = ? 
         WHERE lock_name = ? AND expires_at = ?`,
        [lockedBy, nowIso, expiresAt, lockName, lockRow.expires_at]
      );

      if (updateResult.rowsAffected === 0) {
        throw new ConflictError(
          `Concurrent execution detected: Failed to acquire expired lock for '${lockName}' (acquired by another worker).`
        );
      }
      return true;
    }

    // Try to insert new lock
    try {
      await db.execute(
        `INSERT INTO job_locks (lock_name, locked_by, locked_at, expires_at) 
         VALUES (?, ?, ?, ?)`,
        [lockName, lockedBy, nowIso, expiresAt]
      );
      return true;
    } catch (err: any) {
      // Caught concurrent insert conflict
      throw new ConflictError(
        `Concurrent execution detected: Job '${lockName}' was locked by another process.`
      );
    }
  }

  /**
   * 2. Release durable database lock
   */
  static async releaseLock(lockName: string, lockedBy?: string): Promise<void> {
    const db = getDatabase();
    try {
      if (lockedBy) {
        await db.execute(
          `DELETE FROM job_locks WHERE lock_name = ? AND locked_by = ?`,
          [lockName, lockedBy]
        );
      } else {
        await db.execute(`DELETE FROM job_locks WHERE lock_name = ?`, [lockName]);
      }
    } catch (err: any) {
      console.error(`Failed to release lock for ${lockName}:`, err?.message);
    }
  }

  /**
   * 3. Record job start in background_jobs table
   */
  static async recordJobStart(
    id: string,
    jobName: string,
    triggerType: JobTriggerType = 'SYSTEM',
    runKey?: string | null,
    userId?: string | null
  ): Promise<void> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();

    await db.execute(
      `INSERT INTO background_jobs (
        id, job_name, status, trigger_type, run_key, started_at, created_by_user_id, created_at
      ) VALUES (?, ?, 'RUNNING', ?, ?, ?, ?, ?)`,
      [id, jobName, triggerType, runKey || null, nowIso, userId || null, nowIso]
    );
  }

  /**
   * 4. Record job completion in background_jobs table
   */
  static async recordJobSuccess(
    id: string,
    summary: Record<string, any>,
    durationMs: number
  ): Promise<void> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE background_jobs 
       SET status = 'COMPLETED', completed_at = ?, duration_ms = ?, summary = ? 
       WHERE id = ?`,
      [nowIso, durationMs, JSON.stringify(summary), id]
    );
  }

  /**
   * 5. Record job failure in background_jobs table
   */
  static async recordJobFailure(
    id: string,
    errorMsg: string,
    durationMs: number
  ): Promise<void> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE background_jobs 
       SET status = 'FAILED', completed_at = ?, duration_ms = ?, error_message = ? 
       WHERE id = ?`,
      [nowIso, durationMs, errorMsg, id]
    );
  }

  /**
   * 6. Master Job Execution Wrapper with automatic locking, tracking, and error handling
   */
  static async executeJob<T = any>(
    jobName: string,
    options: JobExecutionOptions = {},
    taskFn: (jobId: string) => Promise<{ data?: T; summary?: Record<string, any> }>
  ): Promise<JobExecutionResult<T>> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const lockKey = options.runKey || jobName;
    const triggerType = options.triggerType || 'SYSTEM';
    const startTime = Date.now();
    const startedAtIso = new Date(startTime).toISOString();

    // Acquire lock to guarantee run protection & prevent duplicate concurrent execution
    await this.acquireLock(lockKey, jobId, options.lockTimeoutSeconds || 300);

    // Record job start
    await this.recordJobStart(jobId, jobName, triggerType, options.runKey, options.userId);

    try {
      // Execute the task
      const result = await taskFn(jobId);
      const durationMs = Date.now() - startTime;
      const completedAtIso = new Date().toISOString();
      const summary = result.summary || {};

      await this.recordJobSuccess(jobId, summary, durationMs);

      return {
        jobId,
        jobName,
        status: 'COMPLETED',
        startedAt: startedAtIso,
        completedAt: completedAtIso,
        durationMs,
        data: result.data,
        summary,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const completedAtIso = new Date().toISOString();
      const errorMsg = err.message || 'Job execution failed with an unexpected error';

      await this.recordJobFailure(jobId, errorMsg, durationMs);

      throw err;
    } finally {
      // Always release lock
      await this.releaseLock(lockKey, jobId);
    }
  }

  /**
   * 7. Query background job run history
   */
  static async getJobHistory(filters: {
    jobName?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: BackgroundJobModel[]; total: number }> {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.jobName) {
      conditions.push('job_name = ?');
      params.push(filters.jobName);
    }
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM background_jobs ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.cnt || 0);

    const limit = Math.max(1, Math.min(100, filters.limit || 50));
    const offset = Math.max(0, filters.offset || 0);

    const rows = await db.query<any>(
      `SELECT * FROM background_jobs 
       ${whereClause} 
       ORDER BY started_at DESC 
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const jobs: BackgroundJobModel[] = rows.map((r: any) => ({
      id: r.id,
      job_name: r.job_name,
      status: r.status,
      trigger_type: r.trigger_type,
      run_key: r.run_key || null,
      started_at: r.started_at,
      completed_at: r.completed_at || null,
      duration_ms: r.duration_ms !== null ? Number(r.duration_ms) : null,
      summary: r.summary ? JSON.parse(r.summary) : null,
      error_message: r.error_message || null,
      created_by_user_id: r.created_by_user_id || null,
      created_at: r.created_at,
    }));

    return { jobs, total };
  }

  /**
   * 8. Check active locks and running status
   */
  static async getActiveLocks(): Promise<Array<{ lock_name: string; locked_by: string; locked_at: string; expires_at: string }>> {
    const db = getDatabase();
    return db.query(
      `SELECT lock_name, locked_by, locked_at, expires_at 
       FROM job_locks 
       WHERE expires_at > CURRENT_TIMESTAMP`
    );
  }
}
