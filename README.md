# Big Boss Finance

A faithful local recreation of the original Big Boss Hair Salon Finance application, with independent business profiles and manual JSON synchronization. React, TypeScript, Vite, Tailwind CSS and IndexedDB. No registration, cloud database, subscription or public hosting.

This replacement lives on **`faithful-recreation`**. The preceding version remains on **`main`** and its source remains in this branch for comparison. The active application is `src/faithful/`; it does not use the previous accounting classification interface.

## Windows

Download `release/Big-Boss-Finance-Windows-local.zip` from this branch. Install Node.js 24 LTS once, extract the entire ZIP, then double-click **Start Big Boss Finance.cmd**. Keep its helper running. Routine use requires no terminal commands. See the included READ ME FIRST and [owner guide](docs/faithful-owner-guide.md).

## Everyday use

1. Choose a business or create one. Original Big Boss names restore the four barbers automatically; other new businesses start empty.
2. Dashboard opens on the previous completed local calendar month: **Daily Income Graph → Expense Breakdown → Monthly Financial Statistics → Historical Monthly Performance**. Select earlier months, inspect exact CAD values, and distinguish missing days from confirmed zeros.
3. Daily Sales records each barber, Sale Product, card receipts, calculated cash and notes. Select a saved date to edit.
4. Expenses & Bank adds expenses, transfers and recorded income without account classification. Edit/search/filter the original transaction history here.
5. Commissions keeps the original half-month earnings/payment rules, payments, adjustments and barber roster.
6. Reports provides monthly profit & loss, categories/sub-accounts, commissions and chequing movement, with printing/PDF.
7. Data & Backup provides **Import JSON**, **Export Full Backup**, **Download Backup**, original backup-text restore and Excel workbook import.

Keep a downloaded backup outside browser storage. Clearing site data, using incognito, or switching browsers does not preserve this browser's records. Each business profile has its own database, records, financial settings and recovery backups. Local profiles are not online accounts or password protection.

## Compatibility and data safety

Import the original 968-record transaction backup directly, original HTML app backups (`days`, `tx`, `staff`, `adj`, `open`, `bal`), or new faithful exports. The original workbook/Journal workflow is also available under the Excel disclosure. The JSON source preserves IDs, all original fields and five monetary totals without rounding or classification requirements.

The supplied historical JSON has no daily barber sales or opening balances. The app restores the source HTML's four-name roster but does not invent those missing financial figures. The original HTML's private embedded account balances are not bundled. See [implementation and source rules](docs/faithful-recreation.md).

Export Full Backup and Download Backup use the same complete, independently restorable format. Exchange files yourself. Revision ancestry detects conflicting edits; resolve them explicitly. Reimporting unchanged files does not duplicate records, and older exports do not silently undo deletions. Imports are atomic and retain a local recovery snapshot.

Previous v0.6 browser databases are left untouched. This replacement uses a new database namespace and does not automatically convert that accounting model. Preserve the previous app and its backup. Restore the original supplied JSON/full original backup here; use the old application to retain access to v0.6-only entries. Do not remove old storage until all needed records have been checked.

## Development

Node.js >=22.12 (24 LTS recommended):

```sh
npm ci
npm run dev
npm test
npm run build
npm run test:browser
npm run release:local
npm run test:release
```

Browser checks use production assets; build before running them. System Chromium is used if available; select another installed build with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The final verification here used local Chromium 153 headless; system Chromium 154 crashed during downloads after process restart even on a minimal page without application code. No assertion was disabled. Actual private reference paths are configurable with `BIG_BOSS_LEGACY_FIXTURE`, `BIG_BOSS_LEGACY_HTML` and `BIG_BOSS_LEGACY_EXPECTED`. Missing required fixtures fail checks. They and actual financial screenshots must never enter Git or the ZIP.

The replacement's browser checks live in `tests/faithful/`. Earlier browser tests remain as preserved historical version coverage. Unit checks include earlier calculation infrastructure as well as the replacement's source fidelity, synchronization and preservation tests.

No application deployment is part of this repository workflow. The Windows launcher is prepared here; Windows-specific execution must be checked on Windows.

See the [v1.1 comprehensive update and verification](docs/comprehensive-update.md) for source linking, full backup contents, actual test evidence and limitations.
