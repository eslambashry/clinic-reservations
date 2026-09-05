import { Injectable } from '@nestjs/common';
import { OtpRequest, Prisma } from '@prisma/client';

@Injectable()
export class OtpRequestRepository {
  create(
    db: Prisma.TransactionClient,
    params: { phone: string; codeHash: string; purpose: string; expiresAt: Date },
  ): Promise<OtpRequest> {
    return db.otpRequest.create({
      data: {
        phone: params.phone,
        code_hash: params.codeHash,
        purpose: params.purpose,
        expires_at: params.expiresAt,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<OtpRequest | null> {
    return db.otpRequest.findUnique({ where: { id } });
  }

  incrementAttempts(db: Prisma.TransactionClient, id: string): Promise<OtpRequest> {
    return db.otpRequest.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  markConsumed(db: Prisma.TransactionClient, id: string): Promise<OtpRequest> {
    return db.otpRequest.update({ where: { id }, data: { consumed_at: new Date() } });
  }

  markVerified(db: Prisma.TransactionClient, id: string): Promise<OtpRequest> {
    return db.otpRequest.update({
      where: { id },
      data: { verified_at: new Date() },
    });
  }
}
