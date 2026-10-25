# Big Boss Finance: proposed architecture

Status: original HTML and transaction backup now inspected read-only; see `legacy-reference.md` for verified formats, source totals, and legacy calculation rules. Stage 3 exchange/recovery now extends the existing foundation and financial system; see `stage-3.md` for current interchange and synchronization contracts; see `stage-2.md` for current models and accounting assumptions; see `stage-1.md` for actual schema decisions and validation.

## Evidence and required inputs

At initial inspection, the repository was empty. The master instructions describe daily sales, expenses, banking transactions, commissions, reports, and backup functionality; these are requirements, not independently inspected legacy features.

The owner subsequently supplied `Big Boss Hair Salon – Finance.html` and `Big_Boss_Finance_Backup_2026-10-23.json`. Both remain unchanged outside tracked source. Inspection confirms distinct HTML-state and transaction-envelope backup structures. See `legacy-reference.md`; both adapters were implemented in Stage 3 and verified in isolated unit/browser workflows. Stage 4 audit and the static local release are documented in `stage-4.md`.

Owner-provided regression references:

| Source field  |  CAD total |
| ------------- | ---------: |
| Income        | [private financial reference] |
| Expenses      | [private financial reference] |
| Bank credits  | [private financial reference] |
| Bank deposits | [private financial reference] |
| Bank debits   | [private financial reference] |

Expected transaction count: 968. These totals must survive import and export exactly, independently of accounting classifications. They do not establish business profit or reconciled balances.

## Application structure

Use React with strict TypeScript and Vite, Tailwind CSS with Radix UI primitives wrapped in shared accessible components, Dexie for IndexedDB, Recharts, Zod, and Vitest. Bundle assets locally; no runtime CDN, web font, remote analytics, or network API dependency. Add a versioned service worker for production offline loading, with an explicit update prompt and no automatic destructive storage cleanup. A local static development server is tooling, not a business backend.

Planned modules:

```text
src/
  app/                 routing, providers, error boundary, application shell
  components/          reusable accessible controls, tables, dialogs, charts
  pages/               dashboard, sales, transactions, stylists, banking,
                       reports, data management, settings
  domain/              models, money, business dates, accounting, commissions
  db/                  Dexie schema, migrations, shop-scoped repositories
  services/            workflows, backups, import preview/apply, conflict resolution
  validation/          versioned Zod schemas and form validation
  reports/             pure aggregations and consolidated reporting
  test/                synthetic fixtures, IndexedDB setup, integration tests
```

UI calls services, services use scoped repositories, and pure calculation/report functions operate on validated data. Keep database and browser APIs out of financial calculations so a future desktop wrapper can reuse them.

## Proposed database schema

Financial records use UUIDs, immutable `shopId`, UTC creation/update timestamps, an opaque revision ID, parent revision information, and an optional deletion timestamp. Business dates are validated `YYYY-MM-DD` strings and are not shifted by timezone conversion. IDs are transportable across browser installations. Schema is provisional until source inspection.

| Table             | Principal fields and purpose                                                                                                                              | Proposed indexes                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| shops             | id, name, location details, currency CAD, revision metadata                                                                                               | id, name                                                    |
| transactions      | id, shopId, businessDate, kind, amountCents, categoryId, accountId, counterparty, description, sourceRef, linkedEventId, review status, revision metadata | id, shopId, [shopId+businessDate], [shopId+kind], sourceRef |
| dailySales        | id, shopId, date, service and product cents, cash/card receipts, stylist allocations, linked transaction IDs, revision metadata                           | id, [shopId+date]                                           |
| stylists          | id, shopId, name, active status, revision metadata                                                                                                        | id, shopId                                                  |
| commissionRules   | id, shopId, stylistId, effective dates, rate in basis points, eligible revenue basis, rounding policy                                                     | id, [shopId+stylistId]                                      |
| commissionEntries | id, shopId, stylistId, saleId, applied rule snapshot, earned/payment/adjustment kind, amountCents, linked transaction ID, revision metadata               | id, [shopId+stylistId], saleId                              |
| accounts          | id, shopId, name, account type, opening date, opening balance cents, revision metadata                                                                    | id, shopId                                                  |
| categories        | id, shopId, name, classification, revision metadata                                                                                                       | id, shopId                                                  |
| reconciliations   | id, shopId, accountId, statement date/balance, matched transaction IDs, unresolved difference                                                             | id, [shopId+accountId]                                      |
| sourceRecords     | id, source format/version, original record ID, source fingerprint, raw payload, normalized record links                                                   | id, source fingerprint                                      |
| revisions         | revisionId, entity type/id, parent revisions, immutable payload or payload hash, device provenance                                                        | revisionId, [entityType+entityId]                           |
| importHistory     | id, file digest, importedAt, shop mappings, counts, conflict summary, backupId                                                                            | id, file digest                                             |
| backups           | id, createdAt, reason, schemaVersion, complete export payload                                                                                             | id, createdAt                                               |
| settings          | key, value; preferences and schema metadata, no credentials                                                                                               | key                                                         |

Financial amount signs and account direction must be explicit per transaction kind; do not infer them solely from labels or negate amounts during migration without a validated mapping. Transfers reference both account legs through one event ID. Cross-shop transfers carry an explicit shared transfer ID and counterpart shop/account references. Apply linked writes in one Dexie transaction. Validate ownership of every referenced account, stylist, and category, not just the primary record.

Daily sales and commission entries must link to their canonical accounting events: reports must not add the same sale or commission twice through different tables. Opening balances are balance inputs, never operating revenue. Reconciliation records report differences without generating balancing entries.

## Shop isolation and reporting

All mutation services require one concrete shop ID. Repository methods require that scope and reject cross-shop references. Global reporting explicitly aggregates selected shop scopes; it cannot write transactions. All Locations excludes both sides of identified internal transfers from profit and net consolidated cash movement, while individual account reports retain the legs. Do not match transfers merely by amount/date. Unmatched or ambiguous movements remain visible for review.

Use date filters consistently across lists, totals, and charts. Define revenue, operating expense, accrued commission cost, and cash movement independently. Commission payments settle liabilities rather than recording a second commission expense when accrual reporting is used. Select and document the supported accounting basis after legacy inspection.

## Manual JSON exchange

Native export envelope: `format`, `schemaVersion`, `exportId`, `exportedAt`, selected shop IDs, entity collections, revision ancestry, tombstones, and source records. Export one complete shop or all shops with referenced entities; preserve original source fields alongside normalized records. Validate size, structure, dates, safe integer cents, referential integrity, duplicate IDs, and schema version before any write.

Preview is read-only. Show new, unchanged, updated, deleted, conflicting, invalid, and unclassified records, plus per-shop source totals. Require an explicit shop mapping for legacy records without location identity; never assign them to the currently selected shop silently.

For native records: identical ID/revision/payload is unchanged; an incoming descendant revision can update the local ancestor; an older ancestor is skipped; divergent revisions are conflicts. Equal revision IDs with unequal payloads are invalid. Unknown ancestry is a conflict, not an automatic last-write-wins decision. Resolve by retaining one version or an explicit user-edited revision with both parents. Keep tombstones so deletion cannot be undone by an older backup. Do not prune ancestry or tombstones without a separately designed retention protocol.

For legacy files: preserve source identifiers and namespace them consistently. A deterministic fingerprint supports repeat imports of identical source records. Matching by amount/date alone is unsafe because legitimate transactions can be identical. Files without reliable IDs or provenance require a documented ambiguity review; exact deduplication guarantees cannot be assumed before inspecting the legacy data.

Apply a reviewed plan with optimistic revision checks. If data changed after preview, require a new preview. Persist a full recoverable pre-import snapshot and all mutations atomically; on quota or validation failure, abort without applying the import. Also offer a downloadable backup before changes because an internal snapshot cannot survive browser storage clearance. Replace mode must state its selected-shop scope, show affected counts, require explicit confirmation, and record tombstones/revisions rather than silently deleting history. Restore follows the same validation and preview path. Import history and export round-trip tests establish traceability.

## Financial rules and unresolved questions

- Parse decimal source money exactly to cents; reject unsupported precision for review. Use safe integer checks on every aggregate. Commission multiplication should use exact integer intermediates and a documented rounding rule.
- Product sales do not automatically earn commissions. Preserve historical rate snapshots; rate changes must not recalculate past earnings silently.
- Deposits, withdrawals, credit-card settlements, loan proceeds/principal, owner draws, transfers, and opening balances have distinct classifications. Interest and fees may be expenses; principal is not.
- Separate bank evidence from sales recognition to avoid counting receipts twice. Legacy links, if absent, require review rather than inferred matches.
- Unknown: original field meanings, amount sign conventions, tax/tip/refund handling, commission bases and rounding, historical stylist rules, account opening dates, transaction ID quality, location identity, deletion representation, and backup variants.
- Preserve uncertain source data and surface review warnings. Until source inspection resolves these questions, do not implement migration assumptions or certify accounting totals.

## Four-stage roadmap

1. **Foundation and UI:** scaffold the specified tools; establish modules, shell, all eight navigation sections, location selector including All Locations, theme, responsive accessible controls, versioned database foundation, shop management, and honest empty/incomplete states. Verify app startup, production build, shop persistence and isolation, theme behavior, and production offline loading. No invented business data or claim of completed accounting/import workflows.
2. **Financial management:** validated transaction entry/editing, daily sales, stylists and effective commission rules, accounts and transfers, reconciliation, date filters, dashboard and reports. Test integer calculations, historical rates, canonical event links, shop isolation, accounting exclusions, persistence, and report aggregation.
3. **Import/export and exchange:** implement inspected legacy adapters and native versioned backups, preview, deterministic identity mapping, conflict handling, tombstones, atomic merge/confirmed replace, recovery, and import history. Test repeated imports, both backup structures, conflicts, quota/rollback failures, and exact 968-record source-total preservation with the supplied backup.
4. **Verification and polish:** browser persistence/offline checks, complete round-trip and recovery tests, financial regression coverage, accessibility and responsive review, storage/update failure handling, and simple backup/restore guidance. Keep failed, skipped, unrun, and passed checks distinct.

## Current validation

Stages 1–3 are implemented under subsequent authorization. See `stage-2.md` for current validation and `stage-1.md` for historical checks. Read-only source inspection now verifies the real backup count and source-field totals. The real backup now passes isolated import/export regression; financial behavior and exchange/recovery are covered by automated and browser checks; see `legacy-reference.md`.
