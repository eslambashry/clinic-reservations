import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

/** Same pattern as `RequestOtpDto`/`LoginWithPasswordDto`/`CreateAssistantDto` — redeclared locally, not shared, per this codebase's convention. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * Walk-in booking (Part 49.7 extension): exactly one of `patientId` (an
 * existing patient) or `patientPhone` (find-or-create by phone, same as
 * `VerifyOtpUseCase`'s self-registration path) must be present.
 */
@ValidatorConstraint({ name: 'exactlyOnePatientIdentifier', async: false })
class ExactlyOnePatientIdentifierConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as CreateClinicStaffAppointmentDto;
    return Boolean(obj.patientId) !== Boolean(obj.patientPhone);
  }

  defaultMessage(): string {
    return 'حدِّد المريض برقم المريض أو برقم الهاتف، وليس كلاهما أو لا شيء منهما.';
  }
}

export class CreateClinicStaffAppointmentDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional()
  @Matches(E164_PATTERN, { message: 'phone must be a valid E.164 phone number, e.g. +201001234567' })
  patientPhone?: string;

  @ApiPropertyOptional({ example: 'Sara' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  patientName?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  @Validate(ExactlyOnePatientIdentifierConstraint)
  slotId!: string;
}
