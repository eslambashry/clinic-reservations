import { Injectable } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface AddressInput {
  line1: string;
  city: string;
  regionCode: string;
  countryCode: string;
  geoLat?: number;
  geoLng?: number;
}

@Injectable()
export class AddressRepository {
  create(db: Prisma.TransactionClient, input: AddressInput): Promise<Address> {
    return db.address.create({
      data: {
        line1: input.line1,
        city: input.city,
        region_code: input.regionCode,
        country_code: input.countryCode,
        geo_lat: input.geoLat,
        geo_lng: input.geoLng,
      },
    });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: Partial<AddressInput>,
  ): Promise<void> {
    await updateWithOptimisticLock(db.address, id, currentVersion, {
      ...(input.line1 !== undefined && { line1: input.line1 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.regionCode !== undefined && { region_code: input.regionCode }),
      ...(input.countryCode !== undefined && { country_code: input.countryCode }),
      ...(input.geoLat !== undefined && { geo_lat: input.geoLat }),
      ...(input.geoLng !== undefined && { geo_lng: input.geoLng }),
    });
  }
}
