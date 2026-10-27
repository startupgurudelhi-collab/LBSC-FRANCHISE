import { randomUUID } from 'crypto';
import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { CommissionLedgerService } from '../commissions/commissionLedgerService.js';
import { LEDGER_CATEGORY, LEDGER_ENTRY_TYPE } from '../commissions/types.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import type { AuthenticatedUser as AuthUser, DatabaseAdapter } from '../types/index.js';
import {
  SERVICE_APPLICATION_STATUS,
  DOCUMENT_STATUS,
  COMMISSION_STATUS,
  type ServiceApplication,
  type ServiceApplicationDocument,
  type ServiceApplicationStatus,
  type CreateServiceApplicationInput,
  type UpdateServiceApplicationInput,
  type AssignWorkInput,
  type ReassignWorkInput,
  type AddWorkNoteInput,
  type ServiceApplicationWorkNote,
  type WorkQueueFilters,
  type WorkQueueSummary,
  type AssigneeOption,
  type SlaStatus,
  type UploadDocumentInput,
  type ServiceApplicationFilters,
} from './types.js';
import { validateAndSanitizeDocumentUpload } from './documentSecurity.js';

export class ServiceApplicationService {
  /**
   * Helper to verify if user has Super Admin role
   */
  private static isSuperAdmin(user: AuthUser): boolean {
    return user.roles.includes(SYSTEM_ROLES.SUPER_ADMIN);
  }

  /**
   * Generates a unique, professional application number:
   * Format: APP-YYYYMMDD-XXXX
   */
  private static generateApplicationNumber(): string {
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `APP-${ymd}-${rand}`;
  }

  /**
   * Helper to populate required documents from Service Master into Service Application
   */
  private static async populateRequiredDocuments(
    applicationId: string,
    requiredDocsDef: any,
    dbInstance?: DatabaseAdapter
  ): Promise<void> {
    const db = dbInstance || getDatabase();
    let docList: Array<{ name: string; description?: string | null; required?: boolean }> = [];

    if (Array.isArray(requiredDocsDef)) {
      docList = requiredDocsDef.map((item) => {
        if (typeof item === 'string') {
          return { name: item, description: null, required: true };
        }
        return {
          name: item.name || item.title || item.document_name || 'Required Document',
          description: item.description || null,
          required: item.required !== false,
        };
      });
    } else if (typeof requiredDocsDef === 'string') {
      try {
        const parsed = JSON.parse(requiredDocsDef);
        if (Array.isArray(parsed)) {
          docList = parsed.map((item) => {
            if (typeof item === 'string') {
              return { name: item, description: null, required: true };
            }
            return {
              name: item.name || item.title || item.document_name || 'Required Document',
              description: item.description || null,
              required: item.required !== false,
            };
          });
        }
      } catch {
        docList = [{ name: requiredDocsDef, description: null, required: true }];
      }
    }

    const isSqlite = db.getDialect() === 'sqlite';

    for (const doc of docList) {
      // Check if document already created for this application
      const existing = await db.query<any>(
        'SELECT id FROM service_application_documents WHERE application_id = ? AND document_name = ? LIMIT 1',
        [applicationId, doc.name]
      );

      if (existing.length === 0) {
        const docId = `doc_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
        await db.execute(
          `INSERT INTO service_application_documents (
            id, application_id, document_name, description, is_required, status
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            docId,
            applicationId,
            doc.name,
            doc.description || null,
            isSqlite ? (doc.required ? 1 : 0) : doc.required,
            DOCUMENT_STATUS.MISSING,
          ]
        );
      }
    }
  }

  /**
   * 1. Create a new Service Application
   */
  static async createApplication(
    input: CreateServiceApplicationInput,
    user: AuthUser
  ): Promise<ServiceApplication> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    // Determine target franchise organization
    let franchiseId: string;
    if (isSuper && input.franchise_id) {
      franchiseId = input.franchise_id;
    } else {
      if (!user.organizationId) {
        throw new ForbiddenError('User does not belong to a franchise organization');
      }
      franchiseId = user.organizationId;
    }

    // Verify franchise organization exists
    const franchise = await db.query<any>('SELECT id, name FROM organizations WHERE id = ? LIMIT 1', [franchiseId]);
    if (franchise.length === 0) {
      throw new NotFoundError(`Franchise organization '${franchiseId}' not found`);
    }

    // Verify client exists and belongs to this franchise
    const client = await db.query<any>('SELECT id, franchise_id, full_name FROM clients WHERE id = ? LIMIT 1', [
      input.client_id,
    ]);
    if (client.length === 0) {
      throw new NotFoundError(`Client with ID '${input.client_id}' not found`);
    }
    if (!isSuper && client[0].franchise_id !== franchiseId) {
      throw new ForbiddenError('Client does not belong to your franchise organization');
    }

    // Verify service master exists
    const service = await db.query<any>('SELECT * FROM service_masters WHERE id = ? LIMIT 1', [input.service_id]);
    if (service.length === 0) {
      throw new NotFoundError(`Service Master with ID '${input.service_id}' not found`);
    }
    const serviceMaster = service[0];
    const isServiceActive = serviceMaster.is_active === 1 || serviceMaster.is_active === true;
    if (!isServiceActive) {
      throw new BadRequestError(`Cannot create application for inactive service '${serviceMaster.name}'`);
    }

    const initialStatus = input.status === SERVICE_APPLICATION_STATUS.SUBMITTED ? 'SUBMITTED' : 'DRAFT';
    const applicationId = `app_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const applicationNumber = this.generateApplicationNumber();
    const priority = input.priority || 'normal';
    const customFieldsStr = input.custom_fields ? JSON.stringify(input.custom_fields) : null;

    // Snapshot fee & commission immediately if submitted, or set 0 for draft until submission
    let serviceFeeSnapshot = 0.0;
    let commissionValueSnapshot = 0.0;
    let commissionNotesSnapshot: string | null = null;
    let submittedAt: string | null = null;
    let submittedByUserId: string | null = null;

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    if (initialStatus === SERVICE_APPLICATION_STATUS.SUBMITTED) {
      serviceFeeSnapshot = Number(serviceMaster.service_fee || 0.0);
      commissionValueSnapshot = Number(serviceMaster.commission_value || 0.0);
      commissionNotesSnapshot = serviceMaster.commission_notes || null;
      submittedAt = nowIso;
      submittedByUserId = user.id;
    }

    await db.execute(
      `INSERT INTO service_applications (
        id, application_number, franchise_id, client_id, service_id, status,
        priority, custom_fields, notes, service_fee_snapshot, commission_value_snapshot,
        commission_notes_snapshot, submitted_at, submitted_by_user_id,
        commission_status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        applicationId,
        applicationNumber,
        franchiseId,
        input.client_id,
        input.service_id,
        initialStatus,
        priority,
        customFieldsStr,
        input.notes || null,
        serviceFeeSnapshot,
        commissionValueSnapshot,
        commissionNotesSnapshot,
        submittedAt,
        submittedByUserId,
        COMMISSION_STATUS.PENDING,
        user.id,
      ]
    );

    // Populate required documents from service master
    await this.populateRequiredDocuments(applicationId, serviceMaster.required_documents, db);

    // Record audit event
    await AuditService.log({
      userId: user.id,
      organizationId: franchiseId,
      action: 'SERVICE_APPLICATION_CREATED',
      entityType: 'SERVICE_APPLICATION',
      entityId: applicationId,
      newValues: {
        application_number: applicationNumber,
        status: initialStatus,
        client_id: input.client_id,
        service_id: input.service_id,
        service_fee_snapshot: serviceFeeSnapshot,
        commission_value_snapshot: commissionValueSnapshot,
      },
    });

    if (initialStatus === SERVICE_APPLICATION_STATUS.SUBMITTED) {
      await AuditService.log({
        userId: user.id,
        organizationId: franchiseId,
        action: 'SERVICE_APPLICATION_SUBMITTED',
        entityType: 'SERVICE_APPLICATION',
        entityId: applicationId,
        newValues: {
          submitted_at: submittedAt,
          service_fee_snapshot: serviceFeeSnapshot,
          commission_value_snapshot: commissionValueSnapshot,
        },
      });
    }

    return this.getApplicationById(applicationId, user);
  }

  /**
   * 2. Submit an application (DRAFT -> SUBMITTED or ACTION_REQUIRED -> SUBMITTED)
   * Snapshots service fee & commission value from Service Master.
   * Auto-populates required document checklist if not already present.
   */
  static async submitApplication(id: string, user: AuthUser): Promise<ServiceApplication> {
    const db = getDatabase();
    const existing = await this.getApplicationById(id, user);

    if (
      existing.status !== SERVICE_APPLICATION_STATUS.DRAFT &&
      existing.status !== SERVICE_APPLICATION_STATUS.ACTION_REQUIRED
    ) {
      throw new BadRequestError(
        `Cannot submit application in '${existing.status}' status. Only DRAFT or ACTION_REQUIRED applications can be submitted.`
      );
    }

    // Snapshot fee and commission value from Service Master at time of submission
    const service = await db.query<any>('SELECT * FROM service_masters WHERE id = ? LIMIT 1', [existing.service_id]);
    if (service.length === 0) {
      throw new NotFoundError(`Service master '${existing.service_id}' not found`);
    }
    const serviceMaster = service[0];
    const serviceFee = Number(serviceMaster.service_fee || 0.0);
    const commissionValue = Number(serviceMaster.commission_value || 0.0);
    const commissionNotes = serviceMaster.commission_notes || null;

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE service_applications
       SET status = ?,
           service_fee_snapshot = ?,
           commission_value_snapshot = ?,
           commission_notes_snapshot = ?,
           submitted_at = ?,
           submitted_by_user_id = ?,
           status_reason = NULL,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        SERVICE_APPLICATION_STATUS.SUBMITTED,
        serviceFee,
        commissionValue,
        commissionNotes,
        nowIso,
        user.id,
        id,
      ]
    );

    // Populate any new/missing required documents
    await this.populateRequiredDocuments(id, serviceMaster.required_documents, db);

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'SERVICE_APPLICATION_SUBMITTED',
      entityType: 'SERVICE_APPLICATION',
      entityId: id,
      oldValues: {
        status: existing.status,
        service_fee_snapshot: existing.service_fee_snapshot,
        commission_value_snapshot: existing.commission_value_snapshot,
      },
      newValues: {
        status: SERVICE_APPLICATION_STATUS.SUBMITTED,
        service_fee_snapshot: serviceFee,
        commission_value_snapshot: commissionValue,
        submitted_at: nowIso,
      },
    });

    return this.getApplicationById(id, user);
  }

  /**
   * 3. Update Status Flow
   * DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED
   * UNDER_REVIEW → ACTION_REQUIRED → SUBMITTED
   * UNDER_REVIEW → REJECTED
   */
  static async updateStatus(
    id: string,
    newStatus: ServiceApplicationStatus,
    reason: string | null | undefined,
    user: AuthUser
  ): Promise<ServiceApplication> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);
    const existing = await this.getApplicationById(id, user);

    // If moving to SUBMITTED from DRAFT or ACTION_REQUIRED, delegate to submitApplication
    if (newStatus === SERVICE_APPLICATION_STATUS.SUBMITTED) {
      return this.submitApplication(id, user);
    }

    // All subsequent transitions (UNDER_REVIEW, APPROVED, ACTION_REQUIRED, REJECTED, ASSIGNED, IN_PROGRESS, COMPLETED)
    // require administrative or assignment authorization
    if (!isSuper) {
      // Non-admins can only move ASSIGNED -> IN_PROGRESS or IN_PROGRESS -> COMPLETED if they are the assigned user
      const isAssigned = existing.assigned_to_user_id === user.id;
      if (!isAssigned) {
        throw new ForbiddenError(`Only Super Admin or the assigned specialist can perform status transition to '${newStatus}'`);
      }
      if (
        !(
          (existing.status === SERVICE_APPLICATION_STATUS.ASSIGNED && newStatus === SERVICE_APPLICATION_STATUS.IN_PROGRESS) ||
          (existing.status === SERVICE_APPLICATION_STATUS.IN_PROGRESS && newStatus === SERVICE_APPLICATION_STATUS.COMPLETED)
        )
      ) {
        throw new ForbiddenError(`Assigned user is not authorized to transition from '${existing.status}' to '${newStatus}'`);
      }
    }

    // Validate workflow transition matrix
    const current = existing.status;
    const allowed = this.isValidTransition(current, newStatus, isSuper);
    if (!allowed) {
      throw new BadRequestError(
        `Invalid status transition from '${current}' to '${newStatus}'. Workflow rules: ` +
          `DRAFT -> SUBMITTED -> UNDER_REVIEW -> (APPROVED | ACTION_REQUIRED | REJECTED), ` +
          `APPROVED -> ASSIGNED -> IN_PROGRESS -> COMPLETED, ` +
          `ACTION_REQUIRED -> SUBMITTED`
      );
    }

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    const updates: string[] = ['status = ?'];
    const params: any[] = [newStatus];

    if (reason !== undefined) {
      updates.push('status_reason = ?');
      params.push(reason || null);
    }

    if (newStatus === SERVICE_APPLICATION_STATUS.UNDER_REVIEW) {
      updates.push('reviewed_at = ?');
      updates.push('reviewed_by_user_id = ?');
      params.push(nowIso, user.id);
    } else if (newStatus === SERVICE_APPLICATION_STATUS.APPROVED) {
      updates.push('approved_at = ?');
      updates.push('approved_by_user_id = ?');
      params.push(nowIso, user.id);
    } else if (newStatus === SERVICE_APPLICATION_STATUS.COMPLETED) {
      updates.push('completed_at = ?');
      updates.push('completed_by_user_id = ?');
      params.push(nowIso, user.id);
    }

    updates.push(`updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`);
    params.push(id);

    await db.execute(
      `UPDATE service_applications SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'SERVICE_APPLICATION_STATUS_UPDATED',
      entityType: 'SERVICE_APPLICATION',
      entityId: id,
      oldValues: { status: current, status_reason: existing.status_reason },
      newValues: { status: newStatus, status_reason: reason || null },
    });

    return this.getApplicationById(id, user);
  }

  /**
   * Helper matrix to validate allowed workflow transitions
   */
  private static isValidTransition(
    current: ServiceApplicationStatus,
    target: ServiceApplicationStatus,
    isSuper: boolean
  ): boolean {
    if (current === target) return true;

    // Strict workflow rules:
    // DRAFT -> SUBMITTED
    if (current === SERVICE_APPLICATION_STATUS.DRAFT) {
      return target === SERVICE_APPLICATION_STATUS.SUBMITTED;
    }

    // SUBMITTED -> UNDER_REVIEW
    if (current === SERVICE_APPLICATION_STATUS.SUBMITTED) {
      return target === SERVICE_APPLICATION_STATUS.UNDER_REVIEW;
    }

    // UNDER_REVIEW -> APPROVED | ACTION_REQUIRED | REJECTED
    if (current === SERVICE_APPLICATION_STATUS.UNDER_REVIEW) {
      return (
        target === SERVICE_APPLICATION_STATUS.APPROVED ||
        target === SERVICE_APPLICATION_STATUS.ACTION_REQUIRED ||
        target === SERVICE_APPLICATION_STATUS.REJECTED
      );
    }

    // ACTION_REQUIRED -> SUBMITTED
    if (current === SERVICE_APPLICATION_STATUS.ACTION_REQUIRED) {
      return target === SERVICE_APPLICATION_STATUS.SUBMITTED;
    }

    // APPROVED -> ASSIGNED | IN_PROGRESS
    if (current === SERVICE_APPLICATION_STATUS.APPROVED) {
      return target === SERVICE_APPLICATION_STATUS.ASSIGNED || target === SERVICE_APPLICATION_STATUS.IN_PROGRESS;
    }

    // ASSIGNED -> IN_PROGRESS | COMPLETED
    if (current === SERVICE_APPLICATION_STATUS.ASSIGNED) {
      return target === SERVICE_APPLICATION_STATUS.IN_PROGRESS || target === SERVICE_APPLICATION_STATUS.COMPLETED;
    }

    // IN_PROGRESS -> COMPLETED
    if (current === SERVICE_APPLICATION_STATUS.IN_PROGRESS) {
      return target === SERVICE_APPLICATION_STATUS.COMPLETED;
    }

    // REJECTED / COMPLETED are terminal workflow states unless super admin intervenes
    if (isSuper) {
      // Super admin can re-open or correct if necessary
      return true;
    }

    return false;
  }

  /**
   * 4. Work Assignment for Approved Applications (Super Admin only)
   */
  static async assignWork(id: string, input: AssignWorkInput, user: AuthUser): Promise<ServiceApplication> {
    const db = getDatabase();
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can assign service application work');
    }

    const existing = await this.getApplicationById(id, user);

    // Verify assigned user exists
    const assignedUserRows = await db.query<any>('SELECT id, first_name, last_name, email FROM users WHERE id = ? LIMIT 1', [
      input.assigned_to_user_id,
    ]);
    if (assignedUserRows.length === 0) {
      throw new NotFoundError(`Assignee user with ID '${input.assigned_to_user_id}' not found`);
    }
    const assignee = assignedUserRows[0];
    const assigneeName = `${assignee.first_name} ${assignee.last_name || ''}`.trim();

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    let newStatus = existing.status;
    if (
      input.move_to_assigned_status ||
      existing.status === SERVICE_APPLICATION_STATUS.APPROVED ||
      existing.status === SERVICE_APPLICATION_STATUS.UNDER_REVIEW
    ) {
      newStatus = SERVICE_APPLICATION_STATUS.ASSIGNED;
    }

    // Compute SLA due date if not present
    let slaDueAt = existing.sla_due_at;
    if (!slaDueAt) {
      const svcRows = await db.query<any>('SELECT turnaround_days, sla_hours FROM service_masters WHERE id = ? LIMIT 1', [existing.service_id]);
      const slaH = svcRows[0]?.sla_hours ? Number(svcRows[0].sla_hours) : (svcRows[0]?.turnaround_days ? Number(svcRows[0].turnaround_days) * 24 : 72);
      slaDueAt = new Date(Date.now() + slaH * 3600 * 1000).toISOString();
    }

    await db.execute(
      `UPDATE service_applications
       SET assigned_to_user_id = ?,
           assigned_at = ?,
           assigned_by_user_id = ?,
           assignment_notes = ?,
           sla_due_at = COALESCE(sla_due_at, ?),
           status = ?,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        input.assigned_to_user_id,
        nowIso,
        user.id,
        input.assignment_notes || null,
        slaDueAt,
        newStatus,
        id,
      ]
    );

    // Record assignment in operational work history
    const noteId = `wn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const noteContent = input.assignment_notes
      ? `Work assigned to ${assigneeName}: ${input.assignment_notes}`
      : `Work assigned to ${assigneeName}`;

    await db.execute(
      `INSERT INTO service_application_work_notes (
        id, application_id, author_user_id, note_type, note, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, 'assignment', ?, ?, ?, ?)`,
      [
        noteId,
        id,
        user.id,
        noteContent,
        JSON.stringify({
          assigned_to_user_id: input.assigned_to_user_id,
          assigned_to_name: assigneeName,
          assignment_notes: input.assignment_notes || null,
        }),
        nowIso,
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'SERVICE_APPLICATION_ASSIGNED',
      entityType: 'SERVICE_APPLICATION',
      entityId: id,
      oldValues: {
        assigned_to_user_id: existing.assigned_to_user_id,
        assigned_to_name: existing.assigned_to_name,
        status: existing.status,
      },
      newValues: {
        assigned_to_user_id: input.assigned_to_user_id,
        assigned_to_name: assigneeName,
        status: newStatus,
        assignment_notes: input.assignment_notes || null,
      },
    });

    return this.getApplicationById(id, user);
  }

  /**
   * 4b. Reassign Work to a Different Specialist (Super Admin only)
   */
  static async reassignWork(id: string, input: ReassignWorkInput, user: AuthUser): Promise<ServiceApplication> {
    const db = getDatabase();
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can reassign service application work');
    }

    const existing = await this.getApplicationById(id, user);

    // Verify new assigned user exists
    const assignedUserRows = await db.query<any>('SELECT id, first_name, last_name, email FROM users WHERE id = ? LIMIT 1', [
      input.assigned_to_user_id,
    ]);
    if (assignedUserRows.length === 0) {
      throw new NotFoundError(`Assignee user with ID '${input.assigned_to_user_id}' not found`);
    }
    const newAssignee = assignedUserRows[0];
    const newAssigneeName = `${newAssignee.first_name} ${newAssignee.last_name || ''}`.trim();
    const previousAssigneeId = existing.assigned_to_user_id;
    const previousAssigneeName = existing.assigned_to_name || 'Unassigned';

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    let newStatus = existing.status;
    if (input.move_to_assigned_status || existing.status === SERVICE_APPLICATION_STATUS.APPROVED) {
      newStatus = SERVICE_APPLICATION_STATUS.ASSIGNED;
    }

    await db.execute(
      `UPDATE service_applications
       SET assigned_to_user_id = ?,
           assigned_at = ?,
           assigned_by_user_id = ?,
           assignment_notes = ?,
           last_reassigned_at = ?,
           reassigned_count = COALESCE(reassigned_count, 0) + 1,
           status = ?,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        input.assigned_to_user_id,
        nowIso,
        user.id,
        input.reassignment_notes || existing.assignment_notes,
        nowIso,
        newStatus,
        id,
      ]
    );

    // Insert reassignment note into work history
    const noteId = `wn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const noteContent = input.reassignment_notes
      ? `Work reassigned from ${previousAssigneeName} to ${newAssigneeName}: ${input.reassignment_notes}`
      : `Work reassigned from ${previousAssigneeName} to ${newAssigneeName}`;

    await db.execute(
      `INSERT INTO service_application_work_notes (
        id, application_id, author_user_id, note_type, note, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, 'reassignment', ?, ?, ?, ?)`,
      [
        noteId,
        id,
        user.id,
        noteContent,
        JSON.stringify({
          previous_assignee_id: previousAssigneeId,
          previous_assignee_name: previousAssigneeName,
          new_assignee_id: input.assigned_to_user_id,
          new_assignee_name: newAssigneeName,
          reassignment_notes: input.reassignment_notes || null,
        }),
        nowIso,
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'SERVICE_APPLICATION_REASSIGNED',
      entityType: 'SERVICE_APPLICATION',
      entityId: id,
      oldValues: {
        assigned_to_user_id: previousAssigneeId,
        assigned_to_name: previousAssigneeName,
      },
      newValues: {
        assigned_to_user_id: input.assigned_to_user_id,
        assigned_to_name: newAssigneeName,
        status: newStatus,
        reassignment_notes: input.reassignment_notes || null,
      },
    });

    return this.getApplicationById(id, user);
  }

  /**
   * 5. Explicit Commission Release by Super Admin
   * Rules:
   * - Commission is NOT credited automatically.
   * - Only Super Admin can explicitly release commission after completion.
   * - Application must be in COMPLETED status.
   * - Released commission must use the application's snapshotted commission value.
   * - Commission release must be idempotent and create the existing immutable ledger entry.
   */
  static async releaseCommission(
    id: string,
    user: AuthUser,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ application: ServiceApplication; ledgerEntryId: string; ledgerReferenceId: string; amount: number; alreadyReleased: boolean }> {
    const db = getDatabase();
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can explicitly release commission');
    }

    const application = await this.getApplicationById(id, user);

    // Rule 1: Application must be in COMPLETED status
    if (application.status !== SERVICE_APPLICATION_STATUS.COMPLETED) {
      throw new BadRequestError(
        `Commission cannot be released for application in '${application.status}' status. Only COMPLETED applications are eligible for commission release.`
      );
    }

    // Rule 2: Idempotency check. If already released, return without duplicating ledger transaction
    const expectedReferenceId = `TXN-COMM-APP-${application.application_number}`;

    if (
      application.commission_status === COMMISSION_STATUS.RELEASED &&
      application.ledger_reference_id
    ) {
      return {
        application,
        ledgerEntryId: application.ledger_entry_id || '',
        ledgerReferenceId: application.ledger_reference_id,
        amount: Number(application.commission_value_snapshot),
        alreadyReleased: true,
      };
    }

    // Rule 3: Must use snapshotted commission value
    const commissionAmount = Number(application.commission_value_snapshot || 0.0);
    if (commissionAmount <= 0) {
      throw new BadRequestError(
        `Application snapshotted commission value is ₹${commissionAmount.toFixed(2)}. Commission amount must be greater than zero.`
      );
    }

    // Rule 4: Post immutable ledger credit via CommissionLedgerService
    const ledgerTx = await CommissionLedgerService.postTransaction(
      {
        organizationId: application.franchise_id,
        entryType: LEDGER_ENTRY_TYPE.CREDIT,
        category: LEDGER_CATEGORY.COMMISSION_EARNED,
        amount: commissionAmount,
        referenceId: expectedReferenceId,
        externalReference: application.application_number,
        description: `Commission earned for completed service application ${application.application_number} (${application.service_name || 'Applied Service'})`,
        metadata: {
          application_id: application.id,
          application_number: application.application_number,
          client_id: application.client_id,
          client_name: application.client_name,
          service_id: application.service_id,
          service_name: application.service_name,
          service_fee_snapshot: application.service_fee_snapshot,
          commission_value_snapshot: application.commission_value_snapshot,
        },
      },
      {
        userId: user.id,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      }
    );

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    // Rule 5: Update commission status on application
    await db.execute(
      `UPDATE service_applications
       SET commission_status = ?,
           commission_released_at = ?,
           commission_released_by_user_id = ?,
           ledger_entry_id = ?,
           ledger_reference_id = ?,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        COMMISSION_STATUS.RELEASED,
        nowIso,
        user.id,
        ledgerTx.entry.id,
        expectedReferenceId,
        id,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: application.franchise_id,
      action: 'SERVICE_APPLICATION_COMMISSION_RELEASED',
      entityType: 'SERVICE_APPLICATION',
      entityId: id,
      newValues: {
        commission_status: COMMISSION_STATUS.RELEASED,
        amount: commissionAmount,
        ledger_entry_id: ledgerTx.entry.id,
        ledger_reference_id: expectedReferenceId,
        account_balance_after: ledgerTx.account.current_balance,
      },
    });

    const updatedApp = await this.getApplicationById(id, user);

    return {
      application: updatedApp,
      ledgerEntryId: ledgerTx.entry.id,
      ledgerReferenceId: expectedReferenceId,
      amount: commissionAmount,
      alreadyReleased: false,
    };
  }

  /**
   * 6. Document Tracking: Upload, Verify, Reject
   */
  static async uploadDocument(
    applicationId: string,
    documentId: string,
    input: UploadDocumentInput,
    user: AuthUser
  ): Promise<ServiceApplicationDocument> {
    const db = getDatabase();
    const application = await this.getApplicationById(applicationId, user);

    // Validate and sanitize document upload payload (magic bytes, MIME, size, schemes, etc.)
    const sanitized = validateAndSanitizeDocumentUpload(input);

    const docRows = await db.query<any>(
      'SELECT * FROM service_application_documents WHERE id = ? AND application_id = ? LIMIT 1',
      [documentId, applicationId]
    );
    if (docRows.length === 0) {
      throw new NotFoundError(`Document with ID '${documentId}' not found for application '${applicationId}'`);
    }
    const currentDoc = docRows[0];

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE service_application_documents
       SET status = ?,
           file_name = ?,
           file_type = ?,
           file_size = ?,
           file_url = ?,
           file_data = ?,
           uploaded_at = ?,
           uploaded_by_user_id = ?,
           rejection_reason = NULL,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [
        DOCUMENT_STATUS.UPLOADED,
        sanitized.file_name,
        sanitized.file_type || null,
        sanitized.file_size || null,
        sanitized.file_url || null,
        sanitized.file_data || null,
        nowIso,
        user.id,
        documentId,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: application.franchise_id,
      action: 'SERVICE_APPLICATION_DOCUMENT_UPLOADED',
      entityType: 'SERVICE_APPLICATION_DOCUMENT',
      entityId: documentId,
      oldValues: { status: currentDoc.status, file_name: currentDoc.file_name },
      newValues: { status: DOCUMENT_STATUS.UPLOADED, file_name: sanitized.file_name, file_size: sanitized.file_size },
    });

    return this.getDocumentById(applicationId, documentId, user);
  }

  static async verifyDocument(
    applicationId: string,
    documentId: string,
    user: AuthUser
  ): Promise<ServiceApplicationDocument> {
    const db = getDatabase();
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can verify application documents');
    }

    const application = await this.getApplicationById(applicationId, user);
    const docRows = await db.query<any>(
      'SELECT * FROM service_application_documents WHERE id = ? AND application_id = ? LIMIT 1',
      [documentId, applicationId]
    );
    if (docRows.length === 0) {
      throw new NotFoundError(`Document '${documentId}' not found for application '${applicationId}'`);
    }
    const currentDoc = docRows[0];

    if (currentDoc.status === DOCUMENT_STATUS.MISSING) {
      throw new BadRequestError('Cannot verify a document that has not been uploaded yet');
    }

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE service_application_documents
       SET status = ?,
           verified_at = ?,
           verified_by_user_id = ?,
           rejection_reason = NULL,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [DOCUMENT_STATUS.VERIFIED, nowIso, user.id, documentId]
    );

    await AuditService.log({
      userId: user.id,
      organizationId: application.franchise_id,
      action: 'SERVICE_APPLICATION_DOCUMENT_VERIFIED',
      entityType: 'SERVICE_APPLICATION_DOCUMENT',
      entityId: documentId,
      oldValues: { status: currentDoc.status },
      newValues: { status: DOCUMENT_STATUS.VERIFIED, verified_at: nowIso },
    });

    return this.getDocumentById(applicationId, documentId, user);
  }

  static async rejectDocument(
    applicationId: string,
    documentId: string,
    rejectionReason: string,
    user: AuthUser
  ): Promise<ServiceApplicationDocument> {
    const db = getDatabase();
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can reject application documents');
    }

    const application = await this.getApplicationById(applicationId, user);
    const docRows = await db.query<any>(
      'SELECT * FROM service_application_documents WHERE id = ? AND application_id = ? LIMIT 1',
      [documentId, applicationId]
    );
    if (docRows.length === 0) {
      throw new NotFoundError(`Document '${documentId}' not found for application '${applicationId}'`);
    }
    const currentDoc = docRows[0];

    const isSqlite = db.getDialect() === 'sqlite';
    const nowIso = new Date().toISOString();

    await db.execute(
      `UPDATE service_application_documents
       SET status = ?,
           verified_at = ?,
           verified_by_user_id = ?,
           rejection_reason = ?,
           updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}
       WHERE id = ?`,
      [DOCUMENT_STATUS.REJECTED, nowIso, user.id, rejectionReason, documentId]
    );

    await AuditService.log({
      userId: user.id,
      organizationId: application.franchise_id,
      action: 'SERVICE_APPLICATION_DOCUMENT_REJECTED',
      entityType: 'SERVICE_APPLICATION_DOCUMENT',
      entityId: documentId,
      oldValues: { status: currentDoc.status },
      newValues: { status: DOCUMENT_STATUS.REJECTED, rejection_reason: rejectionReason },
    });

    return this.getDocumentById(applicationId, documentId, user);
  }

  /**
   * 7. Fetch single document by ID
   */
  static async getDocumentById(
    applicationId: string,
    documentId: string,
    user: AuthUser,
    includeFileData = false
  ): Promise<ServiceApplicationDocument> {
    const db = getDatabase();
    // Verify access to application
    await this.getApplicationById(applicationId, user);

    const fileSelect = includeFileData ? ', d.file_data' : '';
    const rows = await db.query<any>(
      `SELECT d.id, d.application_id, d.document_name, d.description, d.is_required,
              d.status, d.file_name, d.file_type, d.file_size, d.file_url,
              d.uploaded_at, d.uploaded_by_user_id, d.verified_at, d.verified_by_user_id,
              d.rejection_reason, d.created_at, d.updated_at
              ${fileSelect},
              u_up.first_name as up_first, u_up.last_name as up_last,
              u_ver.first_name as ver_first, u_ver.last_name as ver_last
       FROM service_application_documents d
       LEFT JOIN users u_up ON u_up.id = d.uploaded_by_user_id
       LEFT JOIN users u_ver ON u_ver.id = d.verified_by_user_id
       WHERE d.id = ? AND d.application_id = ?
       LIMIT 1`,
      [documentId, applicationId]
    );

    if (rows.length === 0) {
      throw new NotFoundError(`Document '${documentId}' not found for application '${applicationId}'`);
    }

    const r = rows[0];
    return {
      id: r.id,
      application_id: r.application_id,
      document_name: r.document_name,
      description: r.description,
      is_required: Boolean(r.is_required),
      status: r.status,
      file_name: r.file_name,
      file_type: r.file_type,
      file_size: r.file_size ? Number(r.file_size) : null,
      file_url: r.file_url,
      file_data: includeFileData ? r.file_data : undefined,
      uploaded_at: r.uploaded_at,
      uploaded_by_user_id: r.uploaded_by_user_id,
      uploaded_by_name: r.up_first ? `${r.up_first} ${r.up_last || ''}`.trim() : null,
      verified_at: r.verified_at,
      verified_by_user_id: r.verified_by_user_id,
      verified_by_name: r.ver_first ? `${r.ver_first} ${r.ver_last || ''}`.trim() : null,
      rejection_reason: r.rejection_reason,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  /**
   * 8. Update Application Metadata (custom_fields, notes, priority)
   */
  static async updateApplication(
    id: string,
    input: UpdateServiceApplicationInput,
    user: AuthUser
  ): Promise<ServiceApplication> {
    const db = getDatabase();
    const existing = await this.getApplicationById(id, user);
    const isSuper = this.isSuperAdmin(user);

    // Franchise users can only edit metadata while in DRAFT or ACTION_REQUIRED status
    if (
      !isSuper &&
      existing.status !== SERVICE_APPLICATION_STATUS.DRAFT &&
      existing.status !== SERVICE_APPLICATION_STATUS.ACTION_REQUIRED
    ) {
      throw new ForbiddenError(
        `Cannot edit application in '${existing.status}' status. Only DRAFT or ACTION_REQUIRED applications can be modified.`
      );
    }

    const updates: string[] = [];
    const params: any[] = [];
    const isSqlite = db.getDialect() === 'sqlite';

    if (input.custom_fields !== undefined) {
      updates.push('custom_fields = ?');
      params.push(input.custom_fields ? JSON.stringify(input.custom_fields) : null);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes);
    }
    if (input.priority !== undefined) {
      updates.push('priority = ?');
      params.push(input.priority);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = ${isSqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'}`);
    params.push(id);

    await db.execute(`UPDATE service_applications SET ${updates.join(', ')} WHERE id = ?`, params);

    return this.getApplicationById(id, user);
  }

  /**
   * 9. List Applications with Filtering & Pagination
   */
  static async listApplications(
    filters: ServiceApplicationFilters,
    user: AuthUser
  ): Promise<{ applications: ServiceApplication[]; total: number }> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = [];
    const params: any[] = [];

    // Multi-tenant isolation: Franchise users can ONLY view applications from their franchise
    if (!isSuper) {
      if (!user.organizationId) {
        throw new ForbiddenError('User does not belong to a franchise organization');
      }
      conditions.push('a.franchise_id = ?');
      params.push(user.organizationId);
    } else {
      if (filters.franchise_id) {
        conditions.push('a.franchise_id = ?');
        params.push(filters.franchise_id);
      }
    }

    if (filters.client_id) {
      conditions.push('a.client_id = ?');
      params.push(filters.client_id);
    }

    if (filters.service_id) {
      conditions.push('a.service_id = ?');
      params.push(filters.service_id);
    }

    if (filters.status) {
      if (filters.status.includes(',')) {
        const statuses = filters.status.split(',').map((s) => s.trim());
        conditions.push(`a.status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      } else {
        conditions.push('a.status = ?');
        params.push(filters.status);
      }
    }

    if (filters.commission_status) {
      conditions.push('a.commission_status = ?');
      params.push(filters.commission_status);
    }

    if (filters.assigned_to_user_id) {
      conditions.push('a.assigned_to_user_id = ?');
      params.push(filters.assigned_to_user_id);
    }

    if (filters.search) {
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      conditions.push(
        `(LOWER(a.application_number) LIKE ? OR LOWER(c.full_name) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(s.name) LIKE ?)`
      );
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countSql = `
      SELECT COUNT(*) as count
      FROM service_applications a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN service_masters s ON s.id = a.service_id
      ${whereClause}
    `;
    const countResult = await db.query<any>(countSql, params);
    const total = Number(countResult[0]?.count || 0);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 50));
    const offset = (page - 1) * limit;

    const querySql = `
      SELECT a.*,
             c.full_name as client_name, c.email as client_email, c.phone as client_phone,
             s.name as service_name, s.code as service_code, s.turnaround_days, s.sla_hours,
             o.name as franchise_name, o.code as franchise_code,
             u_sub.first_name as sub_first, u_sub.last_name as sub_last,
             u_rev.first_name as rev_first, u_rev.last_name as rev_last,
             u_app.first_name as app_first, u_app.last_name as app_last,
             u_comp.first_name as comp_first, u_comp.last_name as comp_last,
             u_asgn.first_name as asgn_first, u_asgn.last_name as asgn_last,
             u_asgner.first_name as asgner_first, u_asgner.last_name as asgner_last,
             (SELECT COUNT(*) FROM service_application_work_notes wn WHERE wn.application_id = a.id) as work_notes_count,
             (SELECT wn.note FROM service_application_work_notes wn WHERE wn.application_id = a.id ORDER BY wn.created_at DESC LIMIT 1) as latest_work_note
      FROM service_applications a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN service_masters s ON s.id = a.service_id
      LEFT JOIN organizations o ON o.id = a.franchise_id
      LEFT JOIN users u_sub ON u_sub.id = a.submitted_by_user_id
      LEFT JOIN users u_rev ON u_rev.id = a.reviewed_by_user_id
      LEFT JOIN users u_app ON u_app.id = a.approved_by_user_id
      LEFT JOIN users u_comp ON u_comp.id = a.completed_by_user_id
      LEFT JOIN users u_asgn ON u_asgn.id = a.assigned_to_user_id
      LEFT JOIN users u_asgner ON u_asgner.id = a.assigned_by_user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.query<any>(querySql, [...params, limit, offset]);

    const applications = rows.map((r) => this.mapApplicationRow(r));
    return { applications, total };
  }

  /**
   * 10. Get Single Application by ID with full documents
   */
  static async getApplicationById(id: string, user: AuthUser): Promise<ServiceApplication> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const querySql = `
      SELECT a.*,
             c.full_name as client_name, c.email as client_email, c.phone as client_phone,
             s.name as service_name, s.code as service_code, s.turnaround_days, s.sla_hours,
             o.name as franchise_name, o.code as franchise_code,
             u_sub.first_name as sub_first, u_sub.last_name as sub_last,
             u_rev.first_name as rev_first, u_rev.last_name as rev_last,
             u_app.first_name as app_first, u_app.last_name as app_last,
             u_comp.first_name as comp_first, u_comp.last_name as comp_last,
             u_asgn.first_name as asgn_first, u_asgn.last_name as asgn_last,
             u_asgner.first_name as asgner_first, u_asgner.last_name as asgner_last,
             (SELECT COUNT(*) FROM service_application_work_notes wn WHERE wn.application_id = a.id) as work_notes_count,
             (SELECT wn.note FROM service_application_work_notes wn WHERE wn.application_id = a.id ORDER BY wn.created_at DESC LIMIT 1) as latest_work_note
      FROM service_applications a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN service_masters s ON s.id = a.service_id
      LEFT JOIN organizations o ON o.id = a.franchise_id
      LEFT JOIN users u_sub ON u_sub.id = a.submitted_by_user_id
      LEFT JOIN users u_rev ON u_rev.id = a.reviewed_by_user_id
      LEFT JOIN users u_app ON u_app.id = a.approved_by_user_id
      LEFT JOIN users u_comp ON u_comp.id = a.completed_by_user_id
      LEFT JOIN users u_asgn ON u_asgn.id = a.assigned_to_user_id
      LEFT JOIN users u_asgner ON u_asgner.id = a.assigned_by_user_id
      WHERE a.id = ?
      LIMIT 1
    `;

    const rows = await db.query<any>(querySql, [id]);
    if (rows.length === 0) {
      throw new NotFoundError(`Service application with ID '${id}' not found`);
    }

    const row = rows[0];

    // Multi-tenant check
    if (!isSuper && row.franchise_id !== user.organizationId) {
      throw new ForbiddenError('Access denied: You do not have permission to view this service application');
    }

    // Load associated documents
    const docRows = await db.query<any>(
      `SELECT d.id, d.application_id, d.document_name, d.description, d.is_required,
              d.status, d.file_name, d.file_type, d.file_size, d.file_url,
              d.uploaded_at, d.uploaded_by_user_id, d.verified_at, d.verified_by_user_id,
              d.rejection_reason, d.created_at, d.updated_at,
              u_up.first_name as up_first, u_up.last_name as up_last,
              u_ver.first_name as ver_first, u_ver.last_name as ver_last
       FROM service_application_documents d
       LEFT JOIN users u_up ON u_up.id = d.uploaded_by_user_id
       LEFT JOIN users u_ver ON u_ver.id = d.verified_by_user_id
       WHERE d.application_id = ?
       ORDER BY d.created_at ASC`,
      [id]
    );

    const documents: ServiceApplicationDocument[] = docRows.map((d) => ({
      id: d.id,
      application_id: d.application_id,
      document_name: d.document_name,
      description: d.description,
      is_required: Boolean(d.is_required),
      status: d.status,
      file_name: d.file_name,
      file_type: d.file_type,
      file_size: d.file_size ? Number(d.file_size) : null,
      file_url: d.file_url,
      uploaded_at: d.uploaded_at,
      uploaded_by_user_id: d.uploaded_by_user_id,
      uploaded_by_name: d.up_first ? `${d.up_first} ${d.up_last || ''}`.trim() : null,
      verified_at: d.verified_at,
      verified_by_user_id: d.verified_by_user_id,
      verified_by_name: d.ver_first ? `${d.ver_first} ${d.ver_last || ''}`.trim() : null,
      rejection_reason: d.rejection_reason,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));

    return this.mapApplicationRow(row, documents);
  }

  /**
   * Helper to map database row into ServiceApplication object
   */
  private static mapApplicationRow(
    row: any,
    documents?: ServiceApplicationDocument[]
  ): ServiceApplication {
    let customFields: Record<string, any> | null = null;
    if (row.custom_fields) {
      try {
        customFields = typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : row.custom_fields;
      } catch {
        customFields = null;
      }
    }

    const turnaroundDays = row.turnaround_days ? Number(row.turnaround_days) : undefined;
    const slaHours = row.sla_hours ? Number(row.sla_hours) : (turnaroundDays ? turnaroundDays * 24 : 72);

    let slaDueAt: string | null = row.sla_due_at || null;
    if (!slaDueAt && (row.submitted_at || row.created_at)) {
      const baseMs = new Date(row.submitted_at || row.created_at).getTime();
      slaDueAt = new Date(baseMs + (slaHours || 72) * 3600 * 1000).toISOString();
    }

    let slaStatus: SlaStatus = 'NOT_APPLICABLE';
    let slaRemainingHours: number | null = null;

    if (slaDueAt) {
      const dueTime = new Date(slaDueAt).getTime();
      if (row.status === SERVICE_APPLICATION_STATUS.COMPLETED) {
        if (row.completed_at && new Date(row.completed_at).getTime() > dueTime) {
          slaStatus = 'COMPLETED_OVERDUE';
        } else {
          slaStatus = 'COMPLETED_ON_TIME';
        }
      } else if (row.status === SERVICE_APPLICATION_STATUS.REJECTED || row.status === SERVICE_APPLICATION_STATUS.DRAFT) {
        slaStatus = 'NOT_APPLICABLE';
      } else {
        const diffMs = dueTime - Date.now();
        slaRemainingHours = Math.round((diffMs / (3600 * 1000)) * 10) / 10;
        if (slaRemainingHours < 0) {
          slaStatus = 'BREACHED';
        } else if (slaRemainingHours <= 24) {
          slaStatus = 'APPROACHING_DEADLINE';
        } else {
          slaStatus = 'ON_TRACK';
        }
      }
    }

    return {
      id: row.id,
      application_number: row.application_number,
      franchise_id: row.franchise_id,
      franchise_name: row.franchise_name,
      franchise_code: row.franchise_code,
      client_id: row.client_id,
      client_name: row.client_name,
      client_email: row.client_email,
      client_phone: row.client_phone,
      service_id: row.service_id,
      service_name: row.service_name,
      service_code: row.service_code,
      status: row.status,
      status_reason: row.status_reason,
      custom_fields: customFields,
      notes: row.notes,
      priority: row.priority || 'normal',

      service_fee_snapshot: Number(row.service_fee_snapshot || 0.0),
      commission_value_snapshot: Number(row.commission_value_snapshot || 0.0),
      commission_notes_snapshot: row.commission_notes_snapshot,

      submitted_at: row.submitted_at,
      submitted_by_user_id: row.submitted_by_user_id,
      submitted_by_name: row.sub_first ? `${row.sub_first} ${row.sub_last || ''}`.trim() : null,
      reviewed_at: row.reviewed_at,
      reviewed_by_user_id: row.reviewed_by_user_id,
      reviewed_by_name: row.rev_first ? `${row.rev_first} ${row.rev_last || ''}`.trim() : null,
      approved_at: row.approved_at,
      approved_by_user_id: row.approved_by_user_id,
      approved_by_name: row.app_first ? `${row.app_first} ${row.app_last || ''}`.trim() : null,
      completed_at: row.completed_at,
      completed_by_user_id: row.completed_by_user_id,
      completed_by_name: row.comp_first ? `${row.comp_first} ${row.comp_last || ''}`.trim() : null,

      assigned_to_user_id: row.assigned_to_user_id,
      assigned_to_name: row.asgn_first ? `${row.asgn_first} ${row.asgn_last || ''}`.trim() : null,
      assigned_at: row.assigned_at,
      assigned_by_user_id: row.assigned_by_user_id,
      assigned_by_name: row.asgner_first ? `${row.asgner_first} ${row.asgner_last || ''}`.trim() : null,
      assignment_notes: row.assignment_notes,
      last_reassigned_at: row.last_reassigned_at || null,
      reassigned_count: row.reassigned_count ? Number(row.reassigned_count) : 0,

      sla_due_at: slaDueAt,
      sla_hours: slaHours,
      turnaround_days: turnaroundDays,
      sla_remaining_hours: slaRemainingHours,
      sla_status: slaStatus,
      work_notes_count: row.work_notes_count !== undefined ? Number(row.work_notes_count) : undefined,
      latest_work_note: row.latest_work_note || null,

      commission_status: row.commission_status || COMMISSION_STATUS.PENDING,
      commission_released_at: row.commission_released_at,
      commission_released_by_user_id: row.commission_released_by_user_id,
      ledger_entry_id: row.ledger_entry_id,
      ledger_reference_id: row.ledger_reference_id,

      // Phase 19: Efilingg & Government Filing References
      external_filing_id: row.external_filing_id || null,
      arn_number: row.arn_number || null,
      srn_number: row.srn_number || null,
      challan_number: row.challan_number || null,
      efilingg_status: row.efilingg_status || null,
      efilingg_synced_at: row.efilingg_synced_at || null,
      efilingg_sync_error: row.efilingg_sync_error || null,

      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,

      documents,
    };
  }

  // ==========================================
  // PHASE 16A: OPERATIONAL WORK QUEUE & NOTES
  // ==========================================

  /**
   * 11. Operational Work Queue with Comprehensive Filters & SLA Visibility
   * Super Admin sees entire queue across franchises.
   * Franchise user sees only applications for its own organization.
   */
  static async getWorkQueue(
    filters: WorkQueueFilters,
    user: AuthUser
  ): Promise<{ applications: ServiceApplication[]; total: number }> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = [];
    const params: any[] = [];

    // RBAC Multi-tenant isolation: Franchise users can ONLY view applications from their franchise
    if (!isSuper) {
      if (!user.organizationId) {
        throw new ForbiddenError('User does not belong to a franchise organization');
      }
      conditions.push('a.franchise_id = ?');
      params.push(user.organizationId);
    } else {
      if (filters.franchise_id) {
        conditions.push('a.franchise_id = ?');
        params.push(filters.franchise_id);
      }
    }

    // Filter by Assignment Status (unassigned / assigned / all)
    if (filters.assignment_status === 'unassigned') {
      conditions.push('a.assigned_to_user_id IS NULL');
    } else if (filters.assignment_status === 'assigned') {
      conditions.push('a.assigned_to_user_id IS NOT NULL');
    }

    // Filter by specific Assignee User ID (or 'unassigned')
    if (filters.assigned_to_user_id) {
      if (filters.assigned_to_user_id === 'unassigned') {
        conditions.push('a.assigned_to_user_id IS NULL');
      } else {
        conditions.push('a.assigned_to_user_id = ?');
        params.push(filters.assigned_to_user_id);
      }
    }

    // Filter by Priority
    if (filters.priority && filters.priority !== 'all') {
      conditions.push('a.priority = ?');
      params.push(filters.priority);
    }

    // Filter by Status (single or comma-separated)
    if (filters.status && filters.status !== 'all') {
      if (filters.status.includes(',')) {
        const statuses = filters.status.split(',').map((s) => s.trim());
        conditions.push(`a.status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      } else {
        conditions.push('a.status = ?');
        params.push(filters.status);
      }
    }

    // Filter by Service ID
    if (filters.service_id) {
      conditions.push('a.service_id = ?');
      params.push(filters.service_id);
    }

    // Search across application number, client full name, client email, client phone, service name, service code
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim().toLowerCase()}%`;
      conditions.push(
        `(LOWER(a.application_number) LIKE ? OR LOWER(c.full_name) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(s.code) LIKE ?)`
      );
      params.push(term, term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching
    const countSql = `
      SELECT COUNT(*) as count
      FROM service_applications a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN service_masters s ON s.id = a.service_id
      ${whereClause}
    `;
    const countResult = await db.query<any>(countSql, params);
    const total = Number(countResult[0]?.count || 0);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 50));
    const offset = (page - 1) * limit;

    // Sorting
    let orderBy = 'a.created_at DESC';
    if (filters.sort_by === 'sla_due_at') {
      orderBy = `a.sla_due_at ${filters.sort_order === 'asc' ? 'ASC' : 'DESC'}`;
    } else if (filters.sort_by === 'submitted_at') {
      orderBy = `a.submitted_at ${filters.sort_order === 'asc' ? 'ASC' : 'DESC'}`;
    } else if (filters.sort_by === 'priority') {
      orderBy = `CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END ${
        filters.sort_order === 'desc' ? 'DESC' : 'ASC'
      }`;
    } else if (filters.sort_by === 'status') {
      orderBy = `a.status ${filters.sort_order === 'asc' ? 'ASC' : 'DESC'}`;
    }

    const querySql = `
      SELECT a.*,
             c.full_name as client_name, c.email as client_email, c.phone as client_phone,
             s.name as service_name, s.code as service_code, s.turnaround_days, s.sla_hours,
             o.name as franchise_name, o.code as franchise_code,
             u_sub.first_name as sub_first, u_sub.last_name as sub_last,
             u_rev.first_name as rev_first, u_rev.last_name as rev_last,
             u_app.first_name as app_first, u_app.last_name as app_last,
             u_comp.first_name as comp_first, u_comp.last_name as comp_last,
             u_asgn.first_name as asgn_first, u_asgn.last_name as asgn_last,
             u_asgner.first_name as asgner_first, u_asgner.last_name as asgner_last,
             (SELECT COUNT(*) FROM service_application_work_notes wn WHERE wn.application_id = a.id) as work_notes_count,
             (SELECT wn.note FROM service_application_work_notes wn WHERE wn.application_id = a.id ORDER BY wn.created_at DESC LIMIT 1) as latest_work_note
      FROM service_applications a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN service_masters s ON s.id = a.service_id
      LEFT JOIN organizations o ON o.id = a.franchise_id
      LEFT JOIN users u_sub ON u_sub.id = a.submitted_by_user_id
      LEFT JOIN users u_rev ON u_rev.id = a.reviewed_by_user_id
      LEFT JOIN users u_app ON u_app.id = a.approved_by_user_id
      LEFT JOIN users u_comp ON u_comp.id = a.completed_by_user_id
      LEFT JOIN users u_asgn ON u_asgn.id = a.assigned_to_user_id
      LEFT JOIN users u_asgner ON u_asgner.id = a.assigned_by_user_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const rows = await db.query<any>(querySql, [...params, limit, offset]);
    let applications = rows.map((r) => this.mapApplicationRow(r));

    // Dynamic SLA status filtering if requested
    if (filters.sla_status && filters.sla_status !== 'all') {
      const targetSla = filters.sla_status.toUpperCase();
      applications = applications.filter((app) => app.sla_status === targetSla);
    }

    return { applications, total };
  }

  /**
   * 12. Operational Work Queue KPI Summary Metrics
   */
  static async getWorkQueueSummary(user: AuthUser): Promise<WorkQueueSummary> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = [];
    const params: any[] = [];

    if (!isSuper) {
      if (!user.organizationId) {
        throw new ForbiddenError('User does not belong to a franchise organization');
      }
      conditions.push('a.franchise_id = ?');
      params.push(user.organizationId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN a.status NOT IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN a.assigned_to_user_id IS NULL AND a.status NOT IN ('COMPLETED', 'REJECTED', 'DRAFT') THEN 1 ELSE 0 END) as unassigned_count,
        SUM(CASE WHEN a.assigned_to_user_id IS NOT NULL AND a.status NOT IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 0 END) as assigned_count,
        SUM(CASE WHEN a.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN a.priority = 'urgent' AND a.status NOT IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 0 END) as urgent_count,
        SUM(CASE WHEN a.priority = 'high' AND a.status NOT IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 0 END) as high_count,
        SUM(CASE WHEN a.priority = 'normal' AND a.status NOT IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 0 END) as normal_count,
        SUM(CASE WHEN a.priority = 'low' AND a.status NOT IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 0 END) as low_count
      FROM service_applications a
      ${whereClause}
    `;

    const res = await db.query<any>(sql, params);
    const row = res[0] || {};

    // For SLA status calculation across active applications
    const activeApps = await db.query<any>(
      `
      SELECT a.id, a.status, a.sla_due_at, a.submitted_at, a.created_at, a.completed_at,
             s.turnaround_days, s.sla_hours
      FROM service_applications a
      LEFT JOIN service_masters s ON s.id = a.service_id
      ${whereClause ? whereClause + ' AND' : 'WHERE'} a.status NOT IN ('COMPLETED', 'REJECTED')
    `,
      params
    );

    let approachingCount = 0;
    let breachedCount = 0;
    const now = Date.now();

    for (const app of activeApps) {
      const slaH = app.sla_hours ? Number(app.sla_hours) : app.turnaround_days ? Number(app.turnaround_days) * 24 : 72;
      const dueAtTime = app.sla_due_at
        ? new Date(app.sla_due_at).getTime()
        : new Date(app.submitted_at || app.created_at).getTime() + slaH * 3600 * 1000;

      const remainingMs = dueAtTime - now;
      const remainingH = remainingMs / (3600 * 1000);
      if (remainingH < 0) {
        breachedCount++;
      } else if (remainingH <= 24) {
        approachingCount++;
      }
    }

    return {
      total_active_queue: Number(row.active_count || 0),
      unassigned_count: Number(row.unassigned_count || 0),
      assigned_count: Number(row.assigned_count || 0),
      in_progress_count: Number(row.in_progress_count || 0),
      completed_count: Number(row.completed_count || 0),
      approaching_sla_count: approachingCount,
      breached_sla_count: breachedCount,
      by_priority: {
        urgent: Number(row.urgent_count || 0),
        high: Number(row.high_count || 0),
        normal: Number(row.normal_count || 0),
        low: Number(row.low_count || 0),
      },
    };
  }

  /**
   * 13. List Work Notes / Operational History for an Application
   * Franchise users can only view notes for their own applications.
   */
  static async getWorkNotes(applicationId: string, user: AuthUser): Promise<ServiceApplicationWorkNote[]> {
    const db = getDatabase();
    // Validate permission to view application
    await this.getApplicationById(applicationId, user);

    const rows = await db.query<any>(
      `SELECT n.id, n.application_id, n.author_user_id, n.note_type, n.note, n.metadata,
              n.created_at, n.updated_at,
              u.first_name, u.last_name, u.email,
              r.code as role_code, r.name as role_name
       FROM service_application_work_notes n
       LEFT JOIN users u ON u.id = n.author_user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE n.application_id = ?
       ORDER BY n.created_at DESC`,
      [applicationId]
    );

    return rows.map((r) => {
      let metadata: Record<string, any> | null = null;
      if (r.metadata) {
        try {
          metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
        } catch {
          metadata = null;
        }
      }
      return {
        id: r.id,
        application_id: r.application_id,
        author_user_id: r.author_user_id,
        author_name: r.first_name ? `${r.first_name} ${r.last_name || ''}`.trim() : 'System',
        author_email: r.email || null,
        author_role: r.role_name || r.role_code || null,
        note_type: r.note_type,
        note: r.note,
        metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  }

  /**
   * 14. Add an Operational Work Note
   * Franchise Owner / Staff are strictly READ-ONLY.
   * Only Super Admin and assigned specialists can add work notes.
   */
  static async addWorkNote(
    applicationId: string,
    input: AddWorkNoteInput,
    user: AuthUser
  ): Promise<ServiceApplicationWorkNote> {
    const db = getDatabase();
    const existing = await this.getApplicationById(applicationId, user);
    const isSuper = this.isSuperAdmin(user);
    const isAssigned = Boolean(existing.assigned_to_user_id && existing.assigned_to_user_id === user.id);
    const isFranchiseUser =
      user.roles.includes(SYSTEM_ROLES.FRANCHISE_OWNER) ||
      user.roles.includes(SYSTEM_ROLES.FRANCHISE_STAFF) ||
      Boolean(user.organizationId);

    // Franchise Owner / Staff are strictly READ-ONLY for work notes
    if (isFranchiseUser) {
      throw new ForbiddenError('Franchise users are read-only and cannot add work notes');
    }

    if (!isSuper && !isAssigned) {
      throw new ForbiddenError('Only Super Admin or the assigned specialist can add work notes');
    }

    if (!input.note || !input.note.trim()) {
      throw new BadRequestError('Work note content cannot be empty');
    }

    const noteId = `wn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowIso = new Date().toISOString();

    await db.execute(
      `INSERT INTO service_application_work_notes (
        id, application_id, author_user_id, note_type, note, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        noteId,
        applicationId,
        user.id,
        input.note_type || 'work_note',
        input.note.trim(),
        nowIso,
        nowIso,
      ]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      organizationId: existing.franchise_id,
      action: 'SERVICE_APPLICATION_WORK_NOTE_ADDED',
      entityType: 'SERVICE_APPLICATION',
      entityId: applicationId,
      newValues: {
        note_id: noteId,
        note_type: input.note_type || 'work_note',
        preview: input.note.trim().substring(0, 100),
      },
    });

    const notes = await this.getWorkNotes(applicationId, user);
    return (
      notes.find((n) => n.id === noteId) || {
        id: noteId,
        application_id: applicationId,
        author_user_id: user.id,
        author_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        author_email: user.email,
        note_type: input.note_type || 'work_note',
        note: input.note.trim(),
        metadata: null,
        created_at: nowIso,
        updated_at: nowIso,
      }
    );
  }

  /**
   * 15. List Available Assignees / Specialists (Super Admin only)
   */
  static async getAssignees(user: AuthUser): Promise<AssigneeOption[]> {
    const db = getDatabase();
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Admin can list assignees');
    }

    const rows = await db.query<any>(`
      SELECT u.id, u.first_name, u.last_name, u.email,
             r.name as role_name,
             (SELECT COUNT(*) FROM service_applications sa 
              WHERE sa.assigned_to_user_id = u.id 
                AND sa.status NOT IN ('COMPLETED', 'REJECTED')
             ) as active_assigned_count
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.status = 'active'
      ORDER BY u.first_name ASC
    `);

    return rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name || ''}`.trim(),
      email: r.email,
      role: r.role_name || undefined,
      active_assigned_count: Number(r.active_assigned_count || 0),
    }));
  }
}

