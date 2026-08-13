# audit

**MVP** — owns `AuditLog` (see `prisma/schema/audit.prisma`), append-only, written in the same transaction as the business action, per File 11 Part 03. Exports `AuditService.record(tx, params)` (File 12 Part 32.15) — first built out for provider-directory's verification workflow.
