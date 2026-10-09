/** Bump when the Terms or Privacy Policy text changes materially so users are re-prompted. */
export const LEGAL_VERSION = '1.0';
export const LEGAL_CONSENT_TYPES = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'] as const;

/** Self-service deletion is offered to patients and doctors only; staff/admin accounts are managed by their organisation. */
export const SELF_DELETABLE_ROLE_CODES = ['PATIENT', 'DOCTOR'];
