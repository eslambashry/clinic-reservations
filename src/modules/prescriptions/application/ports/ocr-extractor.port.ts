export const OCR_EXTRACTOR = Symbol('OCR_EXTRACTOR');

export interface OcrSuggestedItem {
  drugNameFreeText: string;
  dose: string | null;
  frequency: string | null;
  durationDays: number | null;
  quantity: number | null;
}

/**
 * `DEC-005` (OCR vendor, File 10 Part 4/§9) is `OPEN` — "MVP prescription
 * flow works with manual pharmacist entry if OCR isn't ready" is File 10's
 * own stated fallback, not an engineering shortcut. This port lets the
 * upload flow stay correct and testable now; swap the DI binding for a real
 * OCR adapter (`infrastructure/`) once a vendor is chosen, with zero
 * use-case changes — same shape as `OtpSenderPort` (identity-auth).
 *
 * Whatever a real implementation returns, `drug_code` must never be
 * populated here (File 10 §7.3's hard rule) — only free-text suggestions;
 * the DB trigger on `prescription_items` would reject a populated
 * `drug_code` before any `prescription_reviews` row exists anyway.
 */
export interface OcrExtractorPort {
  extract(fileUrl: string): Promise<OcrSuggestedItem[]>;
}
