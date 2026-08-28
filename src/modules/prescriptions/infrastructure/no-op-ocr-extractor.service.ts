import { Injectable, Logger } from '@nestjs/common';
import { OcrExtractorPort, OcrSuggestedItem } from '../application/ports/ocr-extractor.port';

/**
 * Placeholder `OcrExtractorPort` implementation: always returns zero
 * suggestions, since no OCR vendor is chosen yet (`DEC-005`, File 10 Part
 * 4/§9 — "MVP prescription flow works with manual pharmacist entry if OCR
 * isn't ready"). Never treat this as real OCR; it exists so the upload flow
 * is genuinely runnable while the pharmacist enters items manually at
 * review time.
 */
@Injectable()
export class NoOpOcrExtractor implements OcrExtractorPort {
  private readonly logger = new Logger(NoOpOcrExtractor.name);

  async extract(fileUrl: string): Promise<OcrSuggestedItem[]> {
    this.logger.warn(
      `[DEV-ONLY OCR] No OCR vendor configured (DEC-005 OPEN) — returning zero suggestions for ${fileUrl}`,
    );
    return [];
  }
}
