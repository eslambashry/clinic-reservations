import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { UpdateAffiliationUseCase } from '../application/update-affiliation.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { UpdateAffiliationDto } from './dto/update-affiliation.dto';

@ApiTags('affiliations')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('affiliations')
export class AffiliationsController {
  constructor(private readonly updateAffiliation: UpdateAffiliationUseCase) {}

  @Patch(':affiliationId')
  @ApiOperation({ summary: 'Admin: pause/reactivate an affiliation or update its fee' })
  async update(
    @Param('affiliationId', ParseUUIDPipe) affiliationId: string,
    @Body() dto: UpdateAffiliationDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateAffiliation.execute(affiliationId, dto, user);
  }
}
