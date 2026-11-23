import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceFee, ServiceFeeReader } from './service-fee.reader';

/** `GET /v1/service-fee` — any authenticated user (no `@Roles`), so every app/dashboard can display the current fee. */
@ApiTags('service-fee')
@ApiBearerAuth()
@Controller('service-fee')
export class ServiceFeeController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ServiceFeeReader) private readonly serviceFee: ServiceFeeReader,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current flat service fee' })
  get(): Promise<ServiceFee> {
    return this.serviceFee.get(this.prisma);
  }
}
