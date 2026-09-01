import { Injectable, Logger } from '@nestjs/common';
import { OcrExtractorPort, OcrSuggestedItem } from '../application/ports/ocr-extractor.port';

/**
 * Placeholder `OcrExtractorPort` implementation: no OCR vendor is chosen
 * yet (`DEC-005`, File 10 Part 4/§9 — "MVP prescription flow works with
 * manual pharmacist entry if OCR isn't ready"). Never treat this as real
 * OCR.
 *
 * OPEN DECISION (not File-10/12-ratified — flagged here, not silently
 * assumed): this stub returns one fabricated free-text item per uploaded
 * file instead of the zero it originally returned, purely so
 * `POST /v1/pharmacy-orders` has something to broadcast in an environment
 * with no OCR AND no pharmacist-side reviewer to manually enter items
 * (`PATIENT_STAFF`'s own review endpoint is the documented real fallback,
 * but nothing in this codebase drives it end-to-end yet). Revert to
 * returning `[]` the moment either a real OCR vendor is chosen or a manual
 * review flow is exercised — a fabricated drug name reaching an order is
 * not acceptable outside local dev/QA.
 */
@Injectable()
export class NoOpOcrExtractor implements OcrExtractorPort {
  private readonly logger = new Logger(NoOpOcrExtractor.name);

  async extract(fileUrl: string): Promise<OcrSuggestedItem[]> {
    this.logger.warn(
      `[DEV-ONLY OCR] No OCR vendor configured (DEC-005 OPEN) — fabricating one placeholder item (undecided stopgap, see file comment) for ${fileUrl}`,
    );
    return [
      {
        drugNameFreeText: '[DEV PLACEHOLDER] Unidentified medication — no OCR vendor configured',
        dose: null,
        frequency: null,
        durationDays: null,
        quantity: 1,
      },
    ];
  }
}
