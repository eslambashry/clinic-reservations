import { Injectable, Logger } from '@nestjs/common';
import { QualityCheckerPort, QualityCheckResult } from '../application/ports/quality-checker.port';

/**
 * Placeholder `QualityCheckerPort` implementation: always reports PASSED,
 * since no blur/glare/crop heuristic or vendor is chosen yet (File 12 Part
 * 37.2). This makes the upload flow genuinely runnable end-to-end without
 * pretending a real quality check exists — never treat this as the
 * authoritative check File 10 §7.3 actually requires.
 */
@Injectable()
export class PassthroughQualityChecker implements QualityCheckerPort {
  private readonly logger = new Logger(PassthroughQualityChecker.name);

  async check(fileUrl: string): Promise<QualityCheckResult> {
    this.logger.warn(
      `[DEV-ONLY QUALITY CHECK] No quality-check vendor configured (File 12 Part 37.2) — passing ${fileUrl} through unchecked`,
    );
    return { passed: true, blurScore: null };
  }
}
