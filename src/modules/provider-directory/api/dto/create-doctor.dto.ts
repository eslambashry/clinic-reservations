import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsUrl } from 'class-validator';

/** File 12 Part 32.5: `userId` must already reference an existing `User`. */
export class CreateDoctorDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'CARDIOLOGY' })
  @IsString()
  specialtyCode: string;

  @ApiProperty({ example: 'EG-MED-12345' })
  @IsString()
  licenseNumber: string;

  @ApiPropertyOptional({ example: 'CAI' })
  @IsOptional()
  @IsString()
  regionCode?: string;

  @ApiPropertyOptional({ description: 'Pre-hosted image URL (File 12 Part 32.7 — no upload flow yet)' })
  @IsOptional()
  @IsUrl()
  photoUrl?: string;
}
