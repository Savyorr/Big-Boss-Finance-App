> Historical v1.0 implementation record. The dashboard, themes, source linking and backup format are extended by [v1.1](comprehensive-update.md).

# Faithful recreation — implementation and acceptance

## Branch and source of truth

The owner explicitly requested a clean recreation of the original HTML application on a separate branch. `faithful-recreation` preserves the preceding version on `main`. The prior source is also retained here, but the active entry loads `src/faithful/App.tsx` and its own styles. The previous account-classification interface is not part of the new application bundle.

Both supplied originals were read completely and left unchanged. Their SHA-256 hashes are:

- HTML: `fcea5106b30636ab2ecf17d108642ce12b5d9c4011083aca8f640520a5f3f31d`.
- Original JSON: `97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a`.

Read-only reference locations are recorded in the older `legacy-reference.md`. Actual records, original HTML, expected private totals and financial screenshots are excluded from Git and release files. Only the explicitly approved four-name roster and commission defaults are bundled.

## Source-to-replacement mapping

| Original workflow | Replacement |
| --- | --- |
| `buildDay`, `calcDay`, `loadDay`, save/edit/delete | Daily Sales table, select date to load, service/product/card/cash/notes, recent days, confirmation on delete |
| `norm`, `SUBS`, `TCATS`, `xUpdate`, `editTx`, add/delete | Expenses & Bank form, original categories/sub-accounts and transfer directions, five preserved source amount fields, search/month filtering, corrections and retained deletions |
| `renderPay`, `perKey`, `perEnd`, adjustments | Commissions Summary, Payments, Adjustments, Barbers; original earning/payment cutoffs and signed adjustment semantics |
| `renderRep` | Monthly Profit & loss, expense categories/sub-accounts, stylist commissions and chequing movement; print/PDF |
| `renderBal`, `bankAt`, `olBal`, `saveBal` | Settings statement balances; Show bank balances in Expenses & Bank; no bank statistics on dashboard |
| Original workbook monthly-sheet/Journal reader | Offline bundled Excel import in Data & Backup, including source-based stable row IDs |
| Show backup text / restore text | Downloadable complete JSON plus original backup-text restore |
| Owner-requested additions | Separate profile databases; revision-aware manual JSON exchange; previous-month three-card dashboard |

The active source separates page components, shared UI, calculations/schemas (`model.ts`), persistence/merge (`store.ts`) and import adapters (`import.ts`). React/TypeScript/Vite/Tailwind/Dexie/Zod are reused. The original XLSX dependency is bundled locally for the existing workbook workflow; it makes no CDN request during application use.

## Financial behavior

Money uses integer CAD cents, decimal lexemes and BigInt-safe totals/commission multiplication. Invalid sub-cent precision and overflow fail validation instead of rounding imported amounts. Original zero-value records and all source fields remain supported.

Daily total is service rows plus Sale Product; cash is total minus card receipts. Negative calculated cash is allowed as in the original. Product has no commission. Commission rounds the aggregate numerator once, preserving the original half-cent aggregate behavior. Saved days retain applied rates when a barber is renamed, deactivated or has a rate change. Missing original individual service allocations are never fabricated.

Service periods split after the 15th. Payments/adjustments split after the 22nd and count once their associated period end is reached. Recorded paid follows the original Contract Labour expense field, not guessed bank settlement evidence. Difference is earned minus paid minus signed adjustments. Historical differences remain unavailable when the source lacks the daily earnings; newly saved daily earnings are still visible separately. Payments remain editable, and period corrections can create the original positive/negative adjustments.

Reports and dashboard use recorded expense fields, including Contract Labour once. For legacy transaction-only files, recorded income supplies historical revenue directly. Saved daily totals and transaction income on the same date do not automatically add together. Until an owner chooses in Reports, only that date's ledger income counts. Each date's daily/ledger/both decision is retained in synchronized settings and can be changed later.

The dashboard computes the previous completed month from local `getFullYear`/`getMonth`, including January's preceding December. It renders exactly Revenue, Expenses and Profit, without charts, bank figures, alerts or date-selection controls. Reports provide other months and detailed banking figures.

Original category/sub-account recognition is derived for reporting without modifying original raw category/payee/details. Loan Credit/Loan Payment movement stays outside expense calculations. Opening balances come from an actual full backup or owner input; transaction-only imports show recorded movements and explain the absent opening balance rather than inventing a reconciled account balance. The source HTML's private embedded account balances are not shipped as defaults.

## Profiles, persistence and synchronization

The profile registry is `bigboss-faithful-profiles`; each business owns a separate `bigboss-faithful-<local-profile-ID>` database. Each contains records, business identity, source snapshots and recovery backups. No query combines unrelated profiles. The opening screen always offers the chooser; switching returns to the selected business dashboard. Settings renames a profile, and removal requires a downloaded backup plus an exact-name confirmation.

A business ID travels with an export, while its local profile/database ID stays device-local. First restoration into an empty profile can adopt the export's business identity, including an untouched default Big Boss roster. A nonempty unrelated business rejects that file. The preceding v0.6 databases are not modified or automatically interpreted; retain the old app and its backups for any v0.6-only entries.

Each entity has a stable ID, revision ID, complete known ancestor set and deletion flag. Exports contain every entity, including deleted records, settings and immutable raw source snapshots. New records union by ID. An incoming ancestor is skipped; an incoming descendant can update; independent edits conflict even if one timestamp is later. An explicit conflict choice creates a revision descending from both branches. An old file cannot silently restore a deletion. Two different saved-day IDs with the same date are rejected for correction rather than silently overwriting a day.

Original unversioned imports use stable content revisions; repeat originals do not duplicate or revert newer descendants. Original roster names retain aliases so renaming/deactivation does not create a second barber on repeat import. Unversioned balance changes cannot prove ancestry: a repeated known file leaves corrected settings alone, and divergent old balance snapshots require an explicit choice.

Import validation checks the candidate graph before writes. The apply transaction rechecks the preview baseline against actual current records. Concurrent changes abort; financial records and sources commit atomically. A recovery snapshot is committed separately first, so a failed apply still leaves recovery available. Explicit replacement requires typing REPLACE and replaces only the selected database. Export JSON and Download Backup share the same complete format and restore into a clean profile.

Original transaction JSON, original full HTML-app backup JSON/text, new faithful JSON and the original Excel/Journal workflow are supported. Workbook preview defaults to the original replacement workflow, retains adjustments/barber configuration/balances, and requires a recovery backup plus typed REPLACE confirmation. Unknown or corrupt formats fail visibly. Imported monetary input is never coerced through floating-point rounding. The original 968 records preserve all five source sums exactly.

## Honest limits

- The supplied transaction-only JSON does not contain the old browser's daily barber journal or opening balances. Four staff names can be restored from the HTML, but missing individual historical earnings and commission liabilities cannot be recovered from payment records alone.
- Local profiles are separate workspaces, not authentication or password protection. Browser storage is not a backup.
- Previous v0.6 native exports are not this replacement's format. Preserve that version for entries created only there. This replacement restores the original files and its new faithful format without rewriting prior databases.
- Native Windows execution and whether the father recognizes the recreation need review on the intended Windows computer. This environment can test the extracted Node server and Chromium on Linux, not a signed Windows installer.
- Screenshots with actual original financial records stay private. Browser checks use isolated local copies, not the owner's computer profile.

## Verification record

Final application version: **1.0.0**. No deployment or merge to main was performed.

- Production TypeScript/Vite/PWA build passed; 11 application resources are precached, including the offline workbook reader. The release contains 15 CRC-checked ZIP entries.
- `npm test -- --reporter=dot`: **103 passed**, seven suites, zero failed/skipped; final run 41.50 seconds.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium npm run test:browser`: **4 passed**, zero failed/skipped; final full run 28.2 seconds. These are substantial end-to-end scenarios, not four isolated assertions.
- ZIP extracted to a fresh temporary folder and run using its own Node server at the actual launcher address. `npm run test:release` passed against that extracted folder: original 968-record import and all five sums, complete JSON export, original Excel preview under packaged CSP, full browser AND server shutdown/restart, unchanged data and offline export.
- Fourteen actual application screenshots under ignored `private/faithful-browser/` were inspected separately from assertions. Required scenes: chooser, exactly-three-card September dashboard, four original barbers at 50%, imported ledger, daily sales, original-style report, import preview/success, fresh restore, owner conflict, January/December boundary, mobile dark theme, packaged dashboard, offline packaged dashboard after restart. Packaged before/after dashboard PNGs are byte-identical, confirming the same rendered financial view after restart/offline operation.
- Actual original source raw fields match the 968 exported records; all five expected totals are checked from the private expectations file. Repeat import preserves records without duplicates. All 85 Contract Labour associations use the correct original barber identities. Product is excluded from the roster/commission. The old HTML itself was opened in a separate real browser context and its daily/card/cash calculation compared with the replacement.
- New daily entry, correction/deletion, expense and transfer entry, payment/adjustment, original full backup text, Excel Journal, new-format fresh restore, independent edit resolution, old-file deletion preservation, profile rename/isolation/removal, local month boundary, themes, mobile layout and accessibility passed. Forced stale/write checks retain recovery and prevent partial changes. The 100+20 merge case yields 120 unique transactions.
- Original HTML and JSON checksums remain unchanged. No private financial records, original attachments, credentials or actual financial screenshots are included in source control or the release.

The environment's system Debian Chromium **154.0.8037.57** crashed natively on the second persistent-session download. An isolated static page without finance code reproduced the crash. Changing the application to a data URL did not solve the browser crash, so standard Blob downloads were retained. Official Playwright browser CDN download was blocked by the environment's network policy. A separate local Chromium **153.0.8010.0** headless binary supplied by `@sparticuz/chromium` through npm was used as a development tool outside the repository; all final browser/release checks, including full process restart and downloads, passed with it. It is not a production dependency or part of the Windows ZIP. The test runner retains its full assertions and supports executable override. Native Windows execution remains untested here.

ZIP: `release/Big-Boss-Finance-Windows-local.zip`, **309,519 bytes**. SHA-256: `126f8f2b758a42a22cbe0fffdbfd1a5652c35e248a20f605b2646c8dc3f6e343`.

The preceding project is retained on main at `cb735c820269d5952c1eece63753e262b7bbe69a`. The owner still needs to try the recreation on the intended Windows computer and confirm that the workflow is familiar; no automated check can make that personal acceptance decision.
