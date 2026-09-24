import { Injectable, Logger } from '@nestjs/common';
import { OcrExtractorPort, OcrSuggestedItem } from '../application/ports/ocr-extractor.port';

/**
 * Placeholder `OcrExtractorPort` implementation: no OCR vendor is chosen
 * yet (`DEC-005`, File 10 Part 4/§9 — "MVP prescription flow works with
 * manual pharmacist entry if OCR isn't ready"). Never treat this as real
 * OCR.
 *
 * OCR is intentionally unavailable until a vendor is selected. Keep the
 * uploaded prescription image as the source of truth; never invent a drug
 * name to make an order appear populated. Orders may still be created from
 * the image and priced by the pharmacist.
 */
@Injectable()
export class NoOpOcrExtractor implements OcrExtractorPort {
  private readonly logger = new Logger(NoOpOcrExtractor.name);

  async extract(_fileUrl: string): Promise<OcrSuggestedItem[]> {
    this.logger.warn(
      'No OCR vendor configured; uploaded prescription image will be reviewed manually.',
    );
    return [];
  }
}
