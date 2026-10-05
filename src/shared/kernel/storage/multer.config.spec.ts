import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import request from 'supertest';
import { buildMemoryMulterOptions } from './multer.config';

/** Exercise the installed Express/Multer/Busboy parser, before controller/DTO validation. */
describe('shared in-memory multipart limits', () => {
  const fileSizeLimit = 64; // Tiny file fixtures; never allocate production-sized documents.
  const providerFields = {
    patientId: 'a318ac1b-ae60-4692-80cc-7803e9d8e82',
    documentType: 'PRESCRIPTION',
    appointmentId: '3c4f10cc-c8bc-4859-8089-8eb287b72f71',
    notes: 'ملاحظات'.repeat(60),
  };

  function setup(singleFile = false) {
    const app = express();
    const upload = multer(buildMemoryMulterOptions(fileSizeLimit) as multer.Options);
    const handler = jest.fn((req: Request, res: Response) => {
      res.status(201).json({ fields: req.body, fileCount: singleFile ? Number(!!req.file) : (req.files as Express.Multer.File[]).length });
    });
    app.post('/upload', singleFile ? upload.single('file') : upload.array('files', 5), handler);
    app.use((error: multer.MulterError, _req: Request, res: Response, _next: NextFunction) => {
      // Test fixture exposes the parser code; production Nest interceptors map
      // these through the existing standard error envelope.
      res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ code: error.code });
    });
    return { app, handler };
  }

  it('accepts all nine provider-upload parts: four metadata fields and five files', async () => {
    const { app, handler } = setup();
    let upload = request(app).post('/upload');
    for (const [key, value] of Object.entries(providerFields)) upload = upload.field(key, value);
    for (let index = 0; index < 5; index++) upload = upload.attach('files', Buffer.from('PDF fixture'), `document-${index}.pdf`);
    const response = await upload.expect(201);
    expect(response.body).toEqual({ fields: providerFields, fileCount: 5 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'patient prescription', fields: { notes: 'ملاحظات'.repeat(60) }, files: 5 },
    { name: 'lab result', fields: { itemId: providerFields.patientId, fileLabel: 'نتيجة'.repeat(50), sizeKb: '1' }, files: 5 },
  ])('preserves the $name upload contract', async ({ fields, files }) => {
    const { app } = setup();
    let upload = request(app).post('/upload');
    for (const [key, value] of Object.entries(fields)) upload = upload.field(key, value as string);
    for (let index = 0; index < files; index++) upload = upload.attach('files', Buffer.from('PDF'), `result-${index}.pdf`);
    await upload.expect(201);
  });

  it('preserves one verification file with all three verification metadata fields', async () => {
    const { app } = setup(true);
    const response = await request(app).post('/upload')
      .field('providerType', 'DOCTOR').field('providerId', providerFields.patientId).field('docType', 'MEDICAL_LICENSE')
      .attach('file', Buffer.from('PDF'), 'verification.pdf').expect(201);
    expect(response.body.fileCount).toBe(1);
  });

  it.each(['distinct', 'repeated'])('rejects a fifth text field (%s names) before the business handler', async (names) => {
    const { app, handler } = setup();
    let upload = request(app).post('/upload');
    for (let index = 0; index < 5; index++) upload = upload.field(names === 'repeated' ? 'notes' : `metadata-${index}`, 'small field');
    const response = await upload.attach('files', Buffer.from('PDF'), 'document.pdf').expect(400);
    expect(response.body.code).toBe('LIMIT_FIELD_COUNT');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a field larger than the retained one-MiB value limit', async () => {
    const { app, handler } = setup();
    const response = await request(app).post('/upload').field('notes', 'x'.repeat(1024 * 1024 + 1))
      .attach('files', Buffer.from('PDF'), 'document.pdf').expect(400);
    expect(response.body.code).toBe('LIMIT_FIELD_VALUE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a field name exceeding 100 characters in the actual multipart parser', async () => {
    const { app, handler } = setup();
    const response = await request(app).post('/upload').field('x'.repeat(101), 'small')
      .attach('files', Buffer.from('PDF'), 'document.pdf').expect(400);
    expect(response.body.code).toBe('LIMIT_FIELD_KEY');
    expect(handler).not.toHaveBeenCalled();
  });

  it('caps file parts before buffering an unexpected sixth file', async () => {
    const { app, handler } = setup();
    let upload = request(app).post('/upload');
    for (let index = 0; index < 6; index++) upload = upload.attach('files', Buffer.from('PDF'), `document-${index}.pdf`);
    const response = await upload.expect(400);
    expect(response.body.code).toBe('LIMIT_FILE_COUNT');
    expect(handler).not.toHaveBeenCalled();
  });

  it('retains the stricter single-file route count', async () => {
    const { app, handler } = setup(true);
    const response = await request(app).post('/upload')
      .attach('file', Buffer.from('PDF'), 'first.pdf').attach('file', Buffer.from('PDF'), 'second.pdf').expect(400);
    expect(response.body.code).toBe('LIMIT_UNEXPECTED_FILE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('retains the streaming file-size backstop', async () => {
    const { app, handler } = setup();
    const response = await request(app).post('/upload').attach('files', Buffer.alloc(fileSizeLimit + 1), 'oversized.pdf').expect(413);
    expect(response.body.code).toBe('LIMIT_FILE_SIZE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('counts skipped non-form-data parts too and rejects the tenth total part', async () => {
    const { app, handler } = setup();
    const boundary = 'multipart-boundary-fixture';
    // Busboy skips parts with a non-form-data disposition. They consume parser
    // work, so an attacker cannot bypass fields/files caps using these parts.
    const ignoredPart = `--${boundary}\r\nContent-Disposition: attachment\r\n\r\nsmall\r\n`;
    const body = Buffer.from(ignoredPart.repeat(10) + `--${boundary}--\r\n`);
    const response = await request(app).post('/upload').set('Content-Type', `multipart/form-data; boundary=${boundary}`).send(body).expect(400);
    expect(response.body.code).toBe('LIMIT_PART_COUNT');
    expect(handler).not.toHaveBeenCalled();
  });
});
