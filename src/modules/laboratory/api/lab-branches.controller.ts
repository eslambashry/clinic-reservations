import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { GetLabBranchUseCase, LabBranchDetail } from '../application/get-lab-branch.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';

/**
 * Sibling resource to `lab-orders`/`lab-audit`, not nested — `LAB_STAFF`
 * only, self-branch-only (File 12 Part 48). Exists to back the real-auth
 * bridge's post-login branch display, mirroring
 * `medsuper-pharmacy-dashboard`'s own `GET /pharmacy-branches/{id}` call in
 * its `HttpAuthService.fetchSession`.
 */
@ApiTags('lab-branches')
@ApiBearerAuth()
@Controller('lab-branches')
export class LabBranchesController {
  constructor(@Inject(GetLabBranchUseCase) private readonly getLabBranch: GetLabBranchUseCase) {}

  @Roles(RoleContextType.LAB_STAFF)
  @Get(':branchId')
  @ApiOperation({ summary: "Branch display info — LAB_STAFF, caller's own branch only" })
  get(@Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: AccessTokenPayload): Promise<LabBranchDetail> {
    return this.getLabBranch.execute(branchId, user);
  }
}
