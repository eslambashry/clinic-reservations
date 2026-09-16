import { Inject, Injectable } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { AddressInput, AddressRepository } from '../infrastructure/address.repository';

/**
 * The application-layer seam over `addresses`, which this module owns (File
 * 12 Part 05). `laboratory` needs to create/update the address behind a
 * `LabBranch` inside its own transaction, and File 12 Part 05 forbids it
 * touching another module's table — so it calls through here rather than
 * importing `AddressRepository`, the same shape as `payments` calling
 * `GetAffiliationBillingInfoUseCase` with its own `tx`.
 */
@Injectable()
export class ManageAddressUseCase {
  constructor(@Inject(AddressRepository) private readonly addresses: AddressRepository) {}

  create(tx: Prisma.TransactionClient, input: AddressInput): Promise<Address> {
    return this.addresses.create(tx, input);
  }

  update(
    tx: Prisma.TransactionClient,
    addressId: string,
    currentVersion: number,
    input: Partial<AddressInput>,
  ): Promise<void> {
    return this.addresses.update(tx, addressId, currentVersion, input);
  }
}
