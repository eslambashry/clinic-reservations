import { Module } from '@nestjs/common';
import { IdentityAuthModule } from '../identity-auth/identity-auth.module';
import { DoctorRequestsController } from './api/doctor-requests.controller';
import { CreateDoctorRequestUseCase } from './application/create-doctor-request.use-case';
import {
  GetAdminDoctorRequestUseCase,
  ListAdminDoctorRequestsUseCase,
  ListMyDoctorRequestsUseCase,
} from './application/doctor-request-queries.use-cases';
import { UpdateDoctorRequestStatusUseCase } from './application/update-doctor-request-status.use-case';
import { DoctorRequestRepository } from './infrastructure/doctor-request.repository';

/**
 * Patient requests for doctors not yet on the platform. Owns `doctor_requests`.
 * Reads admin recipients only through `identity-auth`'s exported use-case.
 */
@Module({
  imports: [IdentityAuthModule],
  controllers: [DoctorRequestsController],
  providers: [
    DoctorRequestRepository,
    CreateDoctorRequestUseCase,
    ListMyDoctorRequestsUseCase,
    ListAdminDoctorRequestsUseCase,
    GetAdminDoctorRequestUseCase,
    UpdateDoctorRequestStatusUseCase,
  ],
})
export class DoctorRequestsModule {}
