# Big Boss Finance development rules

## Scope and workflow

- Follow `docs/architecture.md` and the four-stage roadmap. Stage 4 is authorized: audit and fix verified defects, preserve the existing application/data, verify owner workflows and prepare a local release. Do not publish or deploy the application. See `docs/stage-1.md`, `docs/stage-2.md`, and `docs/stage-3.md` for preserved decisions.
- Critical v0.6 migration correction: the owner explicitly authorizes restoring the four exact names and 50% service commission from the supplied original HTML (Sale Product is not staff). Use the idempotent, recovery-backed Complete Legacy Migration service; link original Contract Labour records by stable stylist IDs without creating duplicate payments/expenses or fabricating missing earnings. Default historical reports must show provisional recorded figures, with classified accounting separate. See `docs/legacy-migration.md`.
- Latest owner correction: new businesses use separate local database profiles selected before entering the app. Do not restore a combined cross-profile All Locations default. Preserve the original database read-only during discovery and retain legacy multi-location backup support under advanced controls. See `docs/business-profiles.md`. Imported source-field totals must be visible without inventing classification, accounts or missing barbers.
- Use the existing checkout. Cloud tasks are isolated; do not create worktrees unless explicitly requested.
- Read the original HTML and JSON backup before finalizing migration mappings or legacy commission rules. Both have now been supplied and inspected read-only; see `docs/legacy-reference.md` for hashes, paths, formats, and calculation rules. Never change or overwrite originals.
- Clearly label incomplete features and unverified claims. Never use sample financial data as if it belonged to the business.

## Non-negotiable data rules

- Local-first, offline operation; no cloud database, hosted backend, automatic synchronization, or paid service dependency.
- React, TypeScript, Vite, Tailwind CSS, accessible reusable components, Dexie/IndexedDB, Recharts, Zod, and Vitest.
- Store money as integer CAD cents; validate safe integer bounds. Never use floating-point monetary arithmetic or silently round imported source amounts.
- Preserve source IDs, original fields, dates, descriptions, and unclassified records. Never invent missing amounts or force reconciliation.
- Every financial entity belongs to a stable shop ID. Scope reads and writes by shop. All Locations is a reporting scope, not a shop that owns records.
- Separate revenue and expenses from transfers, banking movements, financing, principal repayment, owner distributions, and opening balances. Never count bank receipts twice as revenue.
- Commission applies to eligible service revenue under explicit stylist rules, not automatically to product revenue. Historical rates must remain reproducible.
- IndexedDB writes affecting related financial records must be atomic. Schema changes need versioned migrations and preservation tests.
- Imports require validation and preview. Preserve conflicts; never silently overwrite divergent records. Replacement requires explicit confirmation and a recoverable backup.
- Stable identifiers, record revisions, deletion tombstones, and import history support repeatable manual JSON exchange. Importing the same file repeatedly must not duplicate records.
- Browser storage is not a backup. Provide downloadable backups and explain storage-clearance risk.
- Do not put credentials, private financial backups, or real financial fixtures in Git. Use synthetic test fixtures by default. The Stage 3 request explicitly authorizes the original 968-record backup as a required regression fixture in isolated test databases; read it from its private attachment path and never copy it into Git or live application storage.

## Development conventions

- Separate components, pages, domain models, calculations, reports, database repositories, validation, and import/export services.
- Use strict TypeScript, Zod at input boundaries, accessible labelled controls, Canadian currency formatting, and date-only business dates.
- Test meaningful financial and persistence behavior with Vitest; use an IndexedDB test implementation for database tests and browser tests for real persistence/offline behavior.
- Verify arithmetic, shop isolation, edits, duplicate prevention, import/export round trips, conflicts, date filtering, commissions, and reporting as implemented.
- The expected legacy record count is 968. Source totals supplied by the owner are regression references only, not verified profit or bank balances. Read-only inspection verified the real backup count and all five source totals; Stage 3 isolated tests verify import/repeated import/modern round-trip preservation; do not load the private reference into live storage without explicit owner action. See `docs/legacy-reference.md`.
- Document architectural changes, actual validation results, outstanding risks, and incomplete features. Keep generated output and dependencies out of Git.
