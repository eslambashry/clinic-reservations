import { isUUID } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('seeded provider identifiers', () => {
  it('uses IDs accepted by the same UUID validator as order creation DTOs', () => {
    const seedSource = readFileSync(join(__dirname, 'seed.ts'), 'utf8');
    const demoRows = seedSource.slice(seedSource.indexOf('const demoPharmacies ='));
    const ids = new Set(demoRows.match(/00000000-0000-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []);

    expect(ids.size).toBeGreaterThan(30);
    for (const id of ids) {
      expect(isUUID(id, 'all')).toBe(true);
    }
  });
});
