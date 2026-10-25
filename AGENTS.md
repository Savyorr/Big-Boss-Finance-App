# Big Boss Finance — main branch

The owner requested one maintained branch: `main`. The verified v1.1.2 faithful application has been merged into main. Use `main` for all future updates unless the owner explicitly requests another branch. Preserve earlier source/history. Do not publish or deploy the application.

## Functional source of truth

- Read the unchanged original HTML and original 968-transaction JSON before changing calculations. Reference paths/hashes are in `docs/legacy-reference.md`. Never modify those files or commit private financial fixtures/screenshots.
- The active replacement is `src/faithful/`, entered by `src/main.tsx`. The older `src/app`, `src/pages`, `src/services` code is preserved for comparison; its accounting workflows do not define this replacement. Only the exact money/JSON utilities and approved original roster configuration are reused.
- Match original daily service/product/card/cash calculations, allowing negative calculated cash when card receipts exceed sales. Product sales have no commission. Defaults: Steven Hirmiz, Waseem Saleem, Aeden Kajo, Mattew Burns at 50%.
- Original commission earnings periods split after the 15th. Payments/adjustments split after the 22nd and are included through their associated period end. Paid means recorded Contract Labour expense; difference = earned − paid − adjustments. Do not fabricate absent historical service revenue or liabilities.
- Original reports use recorded expenses, including Contract Labour once, and revenue from saved daily totals. Legacy transaction-only income supplies revenue when daily details are absent. Overlapping sources require a per-date owner choice; do not sum them silently.
- The latest comprehensive update supersedes the earlier no-chart dashboard rule. Exact section order: Daily Income Graph, Expense Breakdown, Monthly Financial Statistics (Revenue, Expenses, Profit), Historical Monthly Performance. Default to the current local calendar month (v1.1.1 owner correction); preserve navigation to earlier months. Shared revenue resolution must prevent linked historical breakdowns from duplicating either income or bank receipts. Missing records differ from confirmed zero days. The owner requested continuous visual lines: draw dashed connectors across missing dates, explicitly labelled as visual continuity rather than recorded values; retain null data and solid recorded segments.

## Data and synchronization

- Independent IndexedDB database per local business profile. No combined unrelated-business reporting, cloud database, authentication or automatic synchronization.
- Integer CAD cents, BigInt-safe arithmetic, exact input/import precision. Preserve IDs, all five original amount fields, zero records, notes and immutable raw source snapshots.
- Atomic related writes/imports; recovery snapshot before replacement/import. Conflict detection uses revision ancestry, not timestamp order. Preserve tombstones; old files cannot silently resurrect deletions. Conflicting edits require an explicit owner choice.
- Backup, export and original reference data stay out of Git. `private/`, `attachments/` and arbitrary JSON files are ignored. Only approved four-name configuration may be bundled; never ship real balances or financial records.
- Do not seed the owner's live browser. Original-file tests and screenshots use isolated browser contexts/databases. Explicitly distinguish those from the owner's computer.

## Validation and release

Run `npm test`, `npm run test:browser`, `npm run release:local`. Active browser tests are `tests/faithful/`; previous browser tests remain in `tests/` as historical version coverage. Inspect actual screenshots under ignored `private/faithful-browser/` separately from assertions. Required actual references must fail if missing, not silently skip.

Keep components, calculations, import adapters and persistence separate. Document workflows, merge rules, honest source-data limits and actual validation results. Prepare a complete Windows ZIP with the existing local launcher/server; Node is a documented prerequisite. Verify extracted-server operation on Linux and disclose that Windows execution requires a Windows machine. Do not claim the father recognizes the recreation until he reviews it.
