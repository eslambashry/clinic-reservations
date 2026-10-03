import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLabBranchDto } from '../../../laboratory/api/dto/create-lab-branch.dto';
import { CreatePharmacyBranchDto } from './create-pharmacy-branch.dto';
import { UpdatePharmacyBranchDto } from './update-pharmacy-branch.dto';

const options = { whitelist: true, forbidNonWhitelisted: true };
const address = { line1: '5 Zamalek Ave', city: 'Cairo', regionCode: 'CAI', countryCode: 'EG' };
const branch = { phone: '+201001234567', ianaTimezone: 'Africa/Cairo' };

function nestedErrorProperties(errors: Awaited<ReturnType<typeof validate>>): string[] {
  return errors.flatMap((error) => (error.children ?? []).map((child) => child.property));
}

describe.each([
  ['CreatePharmacyBranchDto', CreatePharmacyBranchDto],
  ['CreateLabBranchDto', CreateLabBranchDto],
])('%s address coordinates', (_name, Dto) => {
  it('accepts a branch whose address has coordinates', async () => {
    const dto = plainToInstance(Dto, { ...branch, address: { ...address, geoLat: 30.0626, geoLng: 31.2197 } });

    await expect(validate(dto, options)).resolves.toHaveLength(0);
  });

  it('rejects a branch without coordinates, which proximity search could never return', async () => {
    const dto = plainToInstance(Dto, { ...branch, address });

    const errors = await validate(dto, options);

    expect(errors.map((error) => error.property)).toEqual(['address']);
    expect(nestedErrorProperties(errors).sort()).toEqual(['geoLat', 'geoLng']);
  });

  it('rejects out-of-range coordinates', async () => {
    const dto = plainToInstance(Dto, { ...branch, address: { ...address, geoLat: 120, geoLng: 31.2 } });

    const errors = await validate(dto, options);

    expect(nestedErrorProperties(errors)).toEqual(['geoLat']);
  });
});

describe('UpdatePharmacyBranchDto address', () => {
  it('still allows a partial address update without coordinates', async () => {
    const dto = plainToInstance(UpdatePharmacyBranchDto, { address: { line1: '7 Zamalek Ave' } });

    const errors = await validate(dto, options);

    expect(nestedErrorProperties(errors)).not.toContain('geoLat');
  });
});
