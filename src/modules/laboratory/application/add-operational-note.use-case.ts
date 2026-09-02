import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderNoteRepository } from '../infrastructure/lab-order-note.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface AddOperationalNoteInput {
  body: string;
}

export interface AddOperationalNoteResult {
  labOrderId: string;
  status: string;
}

/** `POST /lab-orders/{orderId}/notes`, `LAB_STAFF` only — a free-text operational note, independent of the custody timeline it also appears in. */
@Injectable()
export class AddOperationalNoteUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabOrderNoteRepository) private readonly labOrderNotes: LabOrderNoteRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: AddOperationalNoteInput, actor: AccessTokenPayload): Promise<AddOperationalNoteResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active lab branch assignment.');
    }
    const body = input.body.trim();
    if (!body) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'Note body cannot be empty.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }

      await this.labOrderNotes.create(tx, labOrderId, actor.sub, body);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('NOTE_ADDED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: body.length > 48 ? `${body.slice(0, 48)}…` : body,
      });

      return { labOrderId, status: order.status };
    });
  }
}
