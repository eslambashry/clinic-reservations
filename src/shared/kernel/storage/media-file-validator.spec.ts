import { assertValidMediaFiles } from './media-file-validator';

const f = (o: Partial<any> = {}) => ({ buffer: Buffer.from('a'), originalName: 'a', mimeType: 'image/png', sizeBytes: 10, ...o }) as any;
const rules = { allowedMimeTypes: ['image/png'], maxFileSizeBytes: 100 };
const code = (fn: () => void) => {
  try {
    fn();
  } catch (e: any) {
    return e.code;
  }
  return null;
};

describe('assertValidMediaFiles', () => {
  it('accepts valid files', () => expect(code(() => assertValidMediaFiles([f()], rules))).toBeNull());
  it('requires min count (default 1, custom)', () => {
    expect(code(() => assertValidMediaFiles([], rules))).toBe('FILE_REQUIRED');
    expect(code(() => assertValidMediaFiles([f()], { ...rules, minFileCount: 2 }))).toBe('FILE_REQUIRED');
  });
  it('caps max count', () => expect(code(() => assertValidMediaFiles([f(), f()], { ...rules, maxFileCount: 1 }))).toBe('TOO_MANY_FILES'));
  it('rejects mime, size and empty', () => {
    expect(code(() => assertValidMediaFiles([f({ mimeType: 'x/y' })], rules))).toBe('UNSUPPORTED_FILE_TYPE');
    expect(code(() => assertValidMediaFiles([f({ sizeBytes: 101 })], rules))).toBe('FILE_TOO_LARGE');
    expect(code(() => assertValidMediaFiles([f({ sizeBytes: 0 })], rules))).toBe('EMPTY_FILE');
  });
});
