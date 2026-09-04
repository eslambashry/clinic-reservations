import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationError } from '@nestjs/common';
import {
  AR_ERROR_MESSAGES,
  AR_FALLBACK_MESSAGE,
  AR_RESOURCE_NAMES,
  arErrorMessage,
  arNotFoundMessage,
  containsArabic,
} from './error-messages.ar';
import { toArabicValidationMessages } from '../validation/validation-messages.ar';

/**
 * These tests exist to keep MedSuper's Arabic-only guarantee from rotting.
 * The last block is the important one: it reads the real source tree, so a
 * new error code or a new English `throw` fails here rather than shipping an
 * English sentence to a patient.
 */

const SRC_ROOT = join(__dirname, '..', '..', '..');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('Arabic error catalog', () => {
  it('has an Arabic sentence for every code', () => {
    const notArabic = Object.entries(AR_ERROR_MESSAGES).filter(([, message]) => !containsArabic(message));
    expect(notArabic).toEqual([]);
  });

  it('has an Arabic noun for every resource type', () => {
    const notArabic = Object.entries(AR_RESOURCE_NAMES).filter(([, noun]) => !containsArabic(noun));
    expect(notArabic).toEqual([]);
  });

  it('keeps an Arabic message written at the throw site', () => {
    const specific = 'هذا الموعد محجوز مؤقتًا لمريض آخر. اختر موعدًا آخر.';
    expect(arErrorMessage('SLOT_ALREADY_HELD', specific)).toBe(specific);
  });

  it('replaces a non-Arabic message with the catalog entry for that code', () => {
    expect(arErrorMessage('SLOT_ALREADY_BOOKED', 'This slot is no longer open.')).toBe(
      AR_ERROR_MESSAGES.SLOT_ALREADY_BOOKED,
    );
  });

  it('falls back to the generic Arabic line for an unknown code', () => {
    expect(arErrorMessage('SOMETHING_NOBODY_MAPPED', 'Internal server explosion')).toBe(AR_FALLBACK_MESSAGE);
  });

  it('names the resource in Arabic on a 404, and stays Arabic for an unmapped type', () => {
    expect(arNotFoundMessage('Appointment')).toBe('الموعد غير موجود.');
    expect(containsArabic(arNotFoundMessage('SomeFutureEntity'))).toBe(true);
  });
});

describe('Arabic validation messages', () => {
  const error = (property: string, constraints: Record<string, string>): ValidationError =>
    ({ property, constraints }) as ValidationError;

  it('translates a type constraint and uses the Arabic field label', () => {
    expect(toArabicValidationMessages([error('phone', { isString: 'phone must be a string' })])).toEqual([
      'رقم الهاتف يجب أن يكون نصًا.',
    ]);
  });

  it('recovers numeric bounds from the English original', () => {
    expect(toArabicValidationMessages([error('limit', { max: 'limit must not be greater than 50' })])).toEqual([
      'عدد النتائج يجب ألا يزيد عن 50.',
    ]);
  });

  it('translates a rejected unknown property (forbidNonWhitelisted)', () => {
    const messages = toArabicValidationMessages([
      error('sneaky', { whitelistValidation: 'property sneaky should not exist' }),
    ]);
    expect(messages.every(containsArabic)).toBe(true);
  });

  it('recurses into nested DTOs', () => {
    const parent = {
      property: 'items',
      children: [{ property: 'quantity', constraints: { isInt: 'quantity must be an integer number' } }],
    } as unknown as ValidationError;
    expect(toArabicValidationMessages([parent])).toEqual(['الكمية يجب أن يكون رقمًا صحيحًا.']);
  });

  it('never emits an English sentence, even for a constraint it does not know', () => {
    const messages = toArabicValidationMessages([
      error('mystery', { someFutureConstraint: 'mystery must satisfy the future' }),
    ]);
    expect(messages.every(containsArabic)).toBe(true);
  });
});

describe('source tree', () => {
  const files = tsFiles(SRC_ROOT).filter((f) => !f.includes('error-messages.ar'));

  it('maps every error code thrown anywhere in src', () => {
    const codes = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /new\s+(?:ConflictError|BusinessRuleError)\s*\(\s*'([A-Z0-9_]+)'/g,
      )) {
        codes.add(match[1]);
      }
      for (const match of source.matchAll(/new\s+DomainError\s*\(\s*\d+\s*,\s*'([A-Z0-9_]+)'/g)) {
        codes.add(match[1]);
      }
    }

    expect(codes.size).toBeGreaterThan(50); // the scan actually found throw sites
    const unmapped = [...codes].filter((code) => !(code in AR_ERROR_MESSAGES)).sort();
    expect(unmapped).toEqual([]);
  });

  it('has no English message left at any AppError throw site', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /new\s+(?:ConflictError|BusinessRuleError|DomainError|UnauthenticatedError|ForbiddenError)\s*\(([\s\S]{0,400}?)\)\s*[;,]/g,
      )) {
        for (const literal of match[1].matchAll(/(['`])((?:[^'`\\]|\\.)*?)\1/g)) {
          const value = literal[2];
          // Skip codes (SCREAMING_SNAKE) and short identifiers — only real
          // sentences are user-facing copy.
          if (value.length < 12 || /^[A-Z0-9_]+$/.test(value)) continue;
          if (!containsArabic(value)) offenders.push(`${file}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
