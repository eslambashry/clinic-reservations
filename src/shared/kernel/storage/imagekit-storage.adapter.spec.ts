const upload = jest.fn();
const buildSrc = jest.fn(() => 'signed-url');
jest.mock('@imagekit/nodejs', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ files: { upload }, helper: { buildSrc } })),
  toFile: jest.fn().mockResolvedValue('uploadable'),
}));

import { ImageKitStorageAdapter } from './imagekit-storage.adapter';

const cfg: Record<string, string> = { 'imagekit.urlEndpoint': 'https://ik.io/acc', 'imagekit.privateKey': 'pk' };
const make = () => new ImageKitStorageAdapter({ get: (k: string) => cfg[k] } as any);
const file = { buffer: Buffer.from('a'), originalName: 'a.png', mimeType: 'image/png', sizeBytes: 1 } as any;

describe('ImageKitStorageAdapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uploads and maps the response', async () => {
    upload.mockResolvedValue({ url: 'u', fileId: 'f', filePath: '/p' });
    expect(await make().upload(file, { folder: '/x', isPrivate: true })).toEqual({ url: 'u', fileId: 'f', filePath: '/p' });
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ file: 'uploadable', folder: '/x', isPrivateFile: true }));
  });

  it.each([{ fileId: 'f', filePath: '/p' }, { url: 'u', filePath: '/p' }, { url: 'u', fileId: 'f' }])('rejects incomplete response %p', async (resp) => {
    upload.mockResolvedValue(resp);
    await expect(make().upload(file, { folder: '/x', isPrivate: false })).rejects.toBeDefined();
  });

  it('wraps SDK failures', async () => {
    upload.mockRejectedValue(new Error('net'));
    await expect(make().upload(file, { folder: '/x', isPrivate: false })).rejects.toBeDefined();
  });

  it('strips the endpoint prefix when signing, keeps other urls', () => {
    const a = make();
    expect(a.getSignedUrl('https://ik.io/acc/f/x.png', 60)).toBe('signed-url');
    expect(buildSrc).toHaveBeenLastCalledWith(expect.objectContaining({ src: '/f/x.png', expiresIn: 60, signed: true }));
    a.getSignedUrl('/other.png');
    expect(buildSrc).toHaveBeenLastCalledWith(expect.objectContaining({ src: '/other.png' }));
  });
});
