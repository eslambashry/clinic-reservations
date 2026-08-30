import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  actorUserId?: string;
  actorRoleMembershipId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  subjectPatientId?: string;
  reasonCode?: string;
  correlationId?: string;
  sourceIp?: string;
}

@Injectable()
export class AuditLogRepository {
  create(db: Prisma.TransactionClient, params: CreateAuditLogParams): Promise<AuditLog> {
    return db.auditLog.create({
      data: {
        actor_user_id: params.actorUserId,
        actor_role_membership_id: params.actorRoleMembershipId,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        subject_patient_id: params.subjectPatientId,
        reason_code: params.reasonCode,
        correlation_id: params.correlationId,
        source_ip: params.sourceIp,
      },
    });
  }

  /**
   * Read side (2026-08-29, `medsuper-pharmacy-dashboard` §6 — first consumer
   * is `pharmacy-fulfillment`'s `ListPharmacyAuditUseCase`). Unpaginated by
   * design: callers own filtering/paging semantics for their own resource
   * (e.g. free-text search over an enriched projection this table knows
   * nothing about) — this method's only job is "every log row for these
   * resource ids," newest first.
   */
  findByResource(db: Prisma.TransactionClient, resourceType: string, resourceIds: string[]): Promise<AuditLog[]> {
    if (resourceIds.length === 0) {
      return Promise.resolve([]);
    }
    return db.auditLog.findMany({
      where: { resource_type: resourceType, resource_id: { in: resourceIds } },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
  }
}
