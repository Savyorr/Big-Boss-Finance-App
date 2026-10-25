# Stage 1 implementation notes

Historical record: Stage 2 now extends this foundation. See `stage-2.md` for current financial behavior and schema version 2.

## Boundaries

Stage 1 implements profile persistence and the UI foundation. The original HTML and legacy JSON were not available for inspection. They were subsequently supplied and inspected read-only without rebuilding Stage 1; see `legacy-reference.md`. Source count and totals are verified, while import/export regression remains deferred to Stage 3. No financial records are seeded or imported.

## Decisions Stage 2 must preserve

- UUID shop identity is immutable. All Locations is a query scope, never record ownership. Archived shops remain in consolidated/history data but are removed from the active-entry selector. If the selected shop is archived, application context falls back to All Locations.
- Profile ownership cannot be reassigned during editing. Create a separate profile at another location to preserve existing financial history. Database services check active shop ownership inside the write transaction.
- Amounts are integer cents, with strict decimal-string parsing and safe-integer checks. Commission percentages are integer basis points. No revenue, earnings, current account balance, or operating profit is fabricated from profile values.
- Account opening balance is currently authoritative on the account profile; the openingBalances table is reserved for future accounting integration. Stage 2 must define a single posting/linking rule and must not count both representations twice.
- The five legacy transaction fields remain independent optional cent fields (`income`, `expense`, `bankCredit`, `bankDeposit`, `bankDebit`), with a raw source envelope. This model is a compatibility provision, not a verified legacy adapter. Never use the generic amount to reconstruct or replace those fields.
- Profile changes and revision snapshots commit atomically. Editing requires the revision originally read, preventing silent lost updates across tabs. Revision models support multiple parents for future conflict resolution; the current local profile chain has one parent.
- Account/stylist archival or deactivation is a reversible status change. Shop removal is intentionally archival, with explicit confirmation, rather than destructive deletion.
- Zod schemas validate persisted profile writes. Future financial writers must validate their matching schemas and referenced ownership. The database class exposes typed tables for reads and migrations; UI financial writes must go through services, not directly through tables.
- All assets are bundled locally. Hash routing supports a local static host without server route rewrites. A production service worker precaches the shell and lazy chart code. Users are prompted to reload for updates; never delete IndexedDB during cache updates.
- Shared UI follows the locally owned shadcn/ui pattern using Radix primitives. `components.json` and the `@/` alias support future component additions. Native labelled controls remain keyboard usable and inherit light/dark variables.

## Schema and migration policy

Dexie schema version 1 declares shops, stylists, dailySales, transactions, accounts, commissionRules, commissionPayments, adjustments, openingBalances, settings, importHistory, revisions, tombstones, and backups. Shop-owned tables index shopId; financial activity has compound date/type indexes where needed.

Never change a shipped schema version in place. Add the next `version(n).stores(...)` declaration and an explicit upgrade only when required. Test upgrades from a populated prior schema, preserve IDs and original fields, and keep related writes atomic. No reset/delete database utility is shipped. Do not use Dexie table clear/delete to hide migration errors.

## Validation

Validation results are recorded after executing the final build and test suites. Browser tests cover actual Chromium IndexedDB use and app reloads; fake-indexeddb tests cover transaction failure and isolated repository behavior. A Windows launcher is provided but cannot be executed in this Linux machine.

## Deferred functionality

Stage 2: financial writes/calculations, real report aggregation, commission payments, reconciliation, category/preferences integration, transaction search/edit/delete against real records.

Stage 3: actual JSON parsing/validation previews, legacy adapters, backups, merge/replace, conflicts, tombstones, and recoverable restore. Data Management file selection stores only the selected File reference in UI state; it reports no successful processing.

Stage 4: broad financial regression, complete accessibility and cross-platform review, and final production reliability work. Stage 1 checks do not certify future accounting behavior.

## Executed results

- `npm ci --cache /workspace/.npm-cache`: succeeded using the project lockfile (no dependency resolution changes).
- `npm run build`: passed strict TypeScript checking and production/PWA generation. A nonfatal warning remains for the approximately 581 kB main JavaScript chunk; chart code is split into a separate lazy chunk. No checks were disabled.
- `npm run test`: **11 passed**, covering schema initialization, create/edit/archive/restore, revision protection, preferences, database reopening, shop isolation, ownership checks, archived-shop restrictions, transactional rollback, money parsing, required validation and independent legacy fields.
- `npm run test:browser`: **3 passed** in Chromium against the production build. Covers profile create/edit across reloads, shop switching and dashboard scoping, archive/restore, all eight routes, persisted themes, mobile navigation/keyboard dismissal, validation, disabled future-stage actions, and production offline reload.
- Desktop dashboard, mobile Settings, and dark profile screenshots were captured and visually inspected. Full accessibility certification and Windows execution were not performed.
- Reinstalled dependencies were tested before the final build. The development server was restarted after installation to avoid stale Vite dependency cache entries.

Initial browser failures identified a form label association issue and first-load service-worker control behavior; both were corrected. The reload checks wait for save completion, rather than aborting pending database work by refreshing immediately after a click. Final browser results above are from the corrected run.
