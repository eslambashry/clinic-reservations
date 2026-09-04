import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CreateAssistantUseCase } from '../application/create-assistant.use-case';
import { DeleteAssistantUseCase } from '../application/delete-assistant.use-case';
import { ListAssistantsUseCase } from '../application/list-assistants.use-case';
import { UpdateAssistantUseCase } from '../application/update-assistant.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { AssistantResponse, ProvisionedAssistantResponse } from '../domain/assistant-response.util';
import { CreateAssistantDto } from './dto/create-assistant.dto';
import { UpdateAssistantDto } from './dto/update-assistant.dto';

/**
 * Clinic Assistant management (`med-super/docs/assistant_feature_backend_integration.md`):
 * a Doctor provisions/manages `CLINIC_STAFF` accounts scoped to their own
 * `Doctor.id` (`RoleMembership.context_id`), never `User.id`. `@Roles(DOCTOR)`
 * at the class level covers every endpoint — this also blocks CLINIC_STAFF
 * callers from reaching their own management surface, not just other
 * doctors' assistants.
 */
@ApiTags('provider-assistants')
@ApiBearerAuth()
@Roles(RoleContextType.DOCTOR)
@Controller('provider/assistants')
export class AssistantsController {
  constructor(
    @Inject(ListAssistantsUseCase) private readonly listAssistants: ListAssistantsUseCase,
    @Inject(CreateAssistantUseCase) private readonly createAssistant: CreateAssistantUseCase,
    @Inject(UpdateAssistantUseCase) private readonly updateAssistant: UpdateAssistantUseCase,
    @Inject(DeleteAssistantUseCase) private readonly deleteAssistant: DeleteAssistantUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "The calling doctor's own clinic assistants" })
  async list(@CurrentUser() user: AccessTokenPayload): Promise<{ items: AssistantResponse[] }> {
    const items = await this.listAssistants.execute(user);
    return { items };
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Provision a new clinic assistant account — returns the one-time plaintext password' })
  create(@Body() dto: CreateAssistantDto, @CurrentUser() user: AccessTokenPayload): Promise<ProvisionedAssistantResponse> {
    return this.createAssistant.execute(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a clinic assistant — display name and/or ACTIVE/SUSPENDED status' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssistantDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AssistantResponse> {
    return this.updateAssistant.execute(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deactivate a clinic assistant — revokes their role membership, does not delete any row' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.deleteAssistant.execute(id, user);
  }
}
