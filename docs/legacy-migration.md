# v0.6 — original business migration correction

The previous implementation preserved the JSON but failed to integrate the supplied HTML configuration. That left the original barber directory empty and default accounting reports at zero. A separate raw-history panel in v0.5 did not adequately replace useful default historical reporting. This update fixes the existing application and retains separate business databases.

## Verified original sources

The unchanged HTML's initial staff configuration contains Steven Hirmiz, Waseem Saleem, Aeden Kajo and Mattew Burns, followed by Sale Product. `NOCOM` excludes Sale Product and `rate` returns 50% for services. `src/config/original-business.ts` bundles only these owner-authorized defaults and the HTML's integrity hash. It does not bundle private transactions, bank balances or the HTML's embedded financial defaults.

The unchanged JSON identifies `Big Boss Hair Salon Finance` and contains 968 transactions. Exactly 85 have category Contract Labour and the following exact payees:

| Barber | Original linked records |
| --- | ---: |
| Waseem Saleem | 28 |
| Aeden Kajo | 27 |
| Steven Hirmiz | 26 |
| Mattew Burns | 4 |

The JSON contains no Journal category or structured daily barber allocations. The other name references are Share Profit records; those are preserved, but are not converted into commission payments. Aggregate income, expenses and bank fields can be reported by day/month. Per-barber historical revenue, service/product allocation, confirmed daily card/cash receipts, earned commissions and opening outstanding commission cannot be reconstructed from this file. The static HTML has no saved trading days; its browser-local journal/full state backup is the missing source. Actual account opening balances/statements are also needed before bank reconciliation can be verified.

## Migration and preservation

`prepareLegacyMigration` selects only transactions proven to come from the original Big Boss source document through the existing source mappings. It builds a candidate without writing. The target is one shop within the currently selected independent database; unrelated businesses and shops are untouched.

For each original name, it matches one existing profile or uses a deterministic ID scoped to the target. It preserves configured profiles, statuses and existing effective-dated rates; newly restored profiles get the historical 50% service rate. No product stylist is created. Ambiguous matches, different existing associations and previously deleted profiles cause an explicit error instead of merging people or silently resurrecting a deletion.

Only existing transaction `stylistId` associations and audited revision metadata change. Canonical transaction IDs, original source IDs, dates, descriptions, raw fields, exact preserved cents and bank postings are retained. The original five monetary totals are invariant. This service adds no financial transaction, daily sale, earning, account, opening balance or commission-payment record. Repeating it is a no-op once completed. Original-file merge sees linked revisions as descendants, preserving associations without duplicates.

A full recovery snapshot commits before the write transaction. The write rechecks the preview baseline under lock, writes related roster/rules/mappings/revisions/associations atomically, validates the full result, and verifies candidate state and source totals. A failed or stale apply leaves business records unchanged and the recovery snapshot available. Import history records the migration result. Old pre-migration backups and modern migrated exports remain restorable.

Fresh original-file imports offer the roster restoration with a checked, explicit option during review. Financial import and roster completion are two recoverable steps; if the second step fails, the UI states that the financial import succeeded and offers completion later. Existing imports have Complete Legacy Migration on the dashboard/barber/data pages; they do not require deletion, a new profile or reimport. The original transaction-only file uses Merge: replacing a complete business from that incomplete format is rejected to protect saved barbers and newer daily sales. Native complete-backup replacement remains available with its existing confirmation.

## Historical payment evidence

All 85 identifiable Contract Labour records are linked. Payment evidence is deliberately independent of verified settlement or account posting:

- 18 records have equal positive expense/bank debit with no contradictory cash description.
- 7 explicitly state cash plus bank amounts that match both expense and bank fields.
- 1 explicitly states a cash amount equal to expense with no bank debit.
- The remaining 59 require settlement review: 20 bank-movement cases, 16 contradictory/incomplete split cases, and 23 expense-only cases.

Thus 26 have supporting original payment evidence; none is automatically treated as a verified commission settlement. An expense alone is not proof of payment. Missing cash is never inferred as expense minus debit. Owed/unpaid language and contradictory figures remain review items. Exact textual payment amounts are parsed without rounding; unsupported numeric precision/range cannot become a guessed amount.

History beside each barber shows original linked records, expense and bank fields, evidence status and the legacy payroll period. Period assignment uses the original payment cutoff (day 22), separate from service earning halves (day 15). Missing historical earnings/opening liability remain explicitly unavailable. New posted earnings/payments/adjustments use the existing commission ledger and are not reduced by provisional historical evidence. No commission is charged twice or invented to force an outstanding balance.

## Useful provisional reporting

`recordedHistory` counts each active original once using its preserved income/expense fields, whether still unreviewed or subsequently classified. Only classified *non-legacy* new entries are added alongside them; classified original fields are not added a second time. Bank credits, deposits and withdrawals stay separate from revenue/expense. Deleted/out-of-scope/out-of-period records are excluded. Original financial figures remain private regression references; no real monetary totals are published in this document.

Dashboard and Reports default to recorded history when present. Recorded Revenue, Recorded Expenses, source bank movements and Unreviewed Historical Records are visible, together with monthly trends and provisional recorded difference. This is not verified profit, tax reporting or a reconciled bank balance. Verified/classified accounting remains an explicit separate view with the existing operating/accrual calculations. Daily Sales also exposes recorded original totals by date without manufacturing per-barber allocations or editable daily-sale records.

The primary workflow hides advanced synchronization options and technical histories. File selection prepares a preview automatically; confirmation/conflict/recovery protections remain. Export business JSON downloads the independent business in one click. The original files remain read-only and are not packaged or committed.

Populated mobile history tables exposed a keyboard-accessibility defect that empty-page checks did not: horizontally scrollable tables were not focusable. Shared table regions now have keyboard focus, accessible labels and a visible focus ring; the populated mobile migration/history flow is included in automated WCAG checks.

## Final verification and release

- Release version: **0.6.0**; existing application and IndexedDB schema version 3 retained.
- `npm run test`: **84 passed**, six suites, zero failed/skipped (49.77 seconds in the full run).
- `npm run test:browser`: **19 passed**, zero failed/skipped in the final full run (4.0 minutes, system Chromium). This includes the real original migration for an existing profile, fresh automatic roster restoration, the visible completion result, all raw fields/five totals, repeat import, 85 links, native export/restore, old backups, new sales/product exclusion, separated profiles, offline operations, and populated mobile accessibility.
- Production TypeScript/Vite/PWA build passed. All 34 assets are locally precached; no oversized-chunk warning. Exact packaged-server financial persistence across browser/server restart remains verified on Linux Chromium.
- ZIP after visual-review corrections: `release/Big-Boss-Finance-Windows-local.zip`, 402,889 bytes; SHA-256 `81e8a7ddf438bed895079ddbe4d110b6f531846f4a9a50fb5ca0f9a1118bffe6`. ZIP CRC/integrity passed. Privacy scan included expanded archive contents; original financial records, backups and credentials are excluded. The owner-authorized four-name roster is bundled configuration.
- Original HTML/JSON integrity hashes remain unchanged. Real references were used only in isolated tests; no live business database was seeded or reset.
- The static Windows launcher is prepared but was not executed on Windows in this Linux environment. This is not a signed native installer. No application hosting, deployment or cloud synchronization was introduced.

For the existing business: download a backup, close the old helper, extract/launch the updated release at the same address/browser profile, accept Update & reload if offered, open the saved Big Boss business and select **Complete Legacy Migration**. The app confirms four original barbers and 85 historical links. Existing financial imports remain in place.
