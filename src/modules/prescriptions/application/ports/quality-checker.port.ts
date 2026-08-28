export const QUALITY_CHECKER = Symbol('QUALITY_CHECKER');

export interface QualityCheckResult {
  passed: boolean;
  blurScore: number | null;
}

/**
 * No image-quality vendor is chosen (File 12 Part 37.2 — no source doc names
 * one; File 10 §7.3 only says "blur/glare/crop heuristic score computed
 * server-side" without specifying how). This port lets the upload flow stay
 * correct and testable now; swap the DI binding for a real heuristic/vendor
 * (`infrastructure/`) the moment that decision resolves, with zero use-case
 * changes — same shape as `OtpSenderPort` (identity-auth).
 */
export interface QualityCheckerPort {
  check(fileUrl: string): Promise<QualityCheckResult>;
}
