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
}
