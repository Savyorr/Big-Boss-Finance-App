# Stage 4 — audit and local release

Audit date: 2026-10-25. Existing Stage 1–3 application preserved. No public hosting, cloud functionality, live-data seeding or reference-file modification. Version 0.4.0. No new IndexedDB migration: additive version 3 and prior migrations retained.

## Verified defects and fixes

1. Monthly reports at December 9999 advanced through invalid years and generated 1,200 bogus months. Month traversal now uses integer month ordinals and explicit Gregorian month ends, including leap years.
2. Ranges longer than 100 years silently truncated at 1,200 months. Reports/dashboard now explain the limit and decline the range rather than presenting partial results. Valid From/To checks remain visible.
3. Reconciliation could appear current when saved cleared totals were inconsistent with its account/movements. Currentness now recomputes the balance and difference and verifies the exact cleared-key/revision set. Native import independently verifies stored figures against available immutable historical account/event revisions; legitimate historical stale reconciliations remain reviewable.
4. Native validation accepted an active classified movement referencing a deleted account. Import now rejects it with an explicit restore/resolve instruction.
5. The stylist profile form always supplied a new effective date on every edit. After scheduling a future rate, a name-only save could introduce that rate today. It now supplies a date only for a new stylist or an explicit rate/date change. Existing historical earnings snapshots are preserved.
6. Stylist profiles displayed the latest entered rate as today's rate even when scheduled in the future. The table now shows today's applicable rate and the upcoming date/rate. Daily Sales now explains missing applicable rates and disables saving instead of previewing a profile fallback that the financial service would reject.
7. Automated WCAG AA checks exposed low-contrast muted text in light mode across explanatory copy, table headings, badges and footer. The shared muted color is darker; mobile icon/dialog controls now have 44-pixel targets. All eight empty workspaces pass axe checks in both themes; this is not a claim of a complete manual screen-reader audit.
8. Exact currency rendering avoids rounding safe-integer cents through a floating-point dollars conversion; integer whole-dollar grouping and explicit fractional cents preserve the stored amount.

The first four defects were reproduced by failing regressions before implementation; all now pass. The commission form regression is covered by actual browser edits and exported effective-rule assertions. Existing financial tests retain their original assertions.

## Financial integrity

Amounts use checked integer cents and half-up commissions per stylist per day. Service commission excludes product revenue. Earned commissions create the expense/liability; payments settle it without another expense. Signed explained adjustments do not create extra cash. Bank deposits, transfers, loan advances/principal, card repayments and distributions remain separate from operating revenue/expenses. Opening balances are explicit known balances. Shop ownership and aggregate writes remain atomic and revision checked.

Original HTML inspected read-only: its two half-month cutoffs differ for earnings versus payments/adjustments. Historical imported summaries do not fabricate stylist allocations or confirmed bank balances. The actual JSON contains 968 unique IDs, including zero-value records and identical-content/different-ID records that must remain separate. All are retained as Needs review until classified.

Required reference SHA-256 values remain:

- HTML: `fcea5106b30636ab2ecf17d108642ce12b5d9c4011083aca8f640520a5f3f31d`
- JSON: `97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a`

| Original source field | Preserved CAD total |
| --- | ---: |
| Income | [private financial reference] |
| Expense | [private financial reference] |
| Bank credit | [private financial reference] |
| Bank deposit | [private financial reference] |
| Bank debit | [private financial reference] |

[Actual category audit](legacy-category-audit.md) lists every original category and all five source-field sums. Of bank-debit records, 277 have zero expense, totaling CAD [private financial reference]. This is not proof of their classifications. Bank Account, Contract Labour, Share Profit, tax/fee and mixed monetary-field records require supporting evidence. Never treat CAD [private financial reference] as operating expense or derive an opening balance to force reconciliation.

The actual private original is read from its attachment path or `BIG_BOSS_LEGACY_FIXTURE`, checksum checked, and used only in isolated fake IndexedDB/browser contexts. It is not copied into source, public assets or release archives. Missing fixtures fail explicitly. Browser original round trip verifies all source fields by canonical digest, all 968 IDs, all five sums, pagination, Needs review warning, clean restore and repeated original import. No private-record screenshots are created by that test.

## Build and performance

Original warning investigated: all page modules (including import/planning/validation) were eagerly reachable from the entry bundle. Routes now load lazily; chart loading remains lazy; Zod validation and Dexie storage have explicit shared bundles using Vite 8/Rolldown's supported groups. No warning threshold was raised. Workbox precaches every produced route/library/worker chunk for offline navigation.

Measured using byte lengths and Python gzip consistently before/after:

| Bundle | Before bytes / gzip bytes | After bytes / gzip bytes |
| --- | ---: | ---: |
| Entry | 709,022 / 211,447 | 348,687 / 110,535 |
| Chart | 352,867 / 100,932 | 352,982 / 100,977 |
| Database shared | included in entry | 106,855 / 33,955 |
| Validation shared | included in entry | 90,147 / 25,232 |

The entry is 50.8% smaller; total initial page transfer includes imported shared bundles, so this is not a claim that total first-load transfer halved. Total production precache is approximately 1.2 MiB. No >500 kB build warning remains. Import parsing stays in a bundled worker. Lists have bounded visible pagination; full ledger calculations and backup history loading remain in memory, so extremely large multi-year datasets need further profiling. The supported JSON limit remains 25 MB. No performance thresholds are invented from this small reference dataset.

## Local release design

Output: `release/Big-Boss-Finance-Windows-local.zip`, extracted folder `release/Big Boss Finance`. Contains production assets, a builtin-Node static host, Windows launcher and short user guide. No development dependencies, private fixtures, source maps, runtime CDN or external backend. ZIP CRC/integrity and file list inspected.

Normal Windows flow: Node.js 24 LTS one-time prerequisite, extract ZIP, double-click `Start Big Boss Finance.cmd`. The helper opens the default browser and stays running. This uses production files, never npm/Vite in normal use. Static host binds only 127.0.0.1:47831, validates Host, denies non-read methods and path traversal, serves only app assets and sets a restrictive self-only CSP. It reads/writes no financial data: IndexedDB remains in the browser. Duplicate launch reuses the identified existing server; a foreign port occupant causes a clear failure without silently changing origin or killing another program.

The fixed port/browser profile preserves origin across release folders and server restarts. Old 5173/4173 data must be exported and imported deliberately. Backup before replacing release files. Browser storage clearance, incognito mode and switching browsers/profiles are not data migration methods. The user guide explains recovery and separate downloaded backups.

Tauri/Rust and Windows execution tools are unavailable here. A native/signed `.exe` or `.msi` was not built. The alternative avoids adding an untested native toolchain, but Node is required. The Windows `.cmd` remains unexecuted on Windows: its first-run/prerequisite/path-with-spaces/error behavior must be checked there. Linux Chromium can verify the exact packaged production server, offline navigation, downloads and persistence across closing/reopening both server and persistent browser profile. This does not certify Windows or every browser.

## Validation and release checklist

Final command results and checklist are recorded after the final verification run below. The app is a candidate for controlled local use after the intended Windows computer's launch/persistence/restore check. It is not certified accounting advice; historical profit/bank reports remain incomplete until legacy records, opening balances and commission allocations are reviewed by the owner/accountant. Downloaded daily backups remain essential.

Coverage and checklist (Linux Chromium unless stated):

- [x] Production application/local host launches; exact packaged server responds and serves the app, with traversal/non-read method checks and repeat launch.
- [x] All eight pages navigate and load offline, including lazy chunks not previously visited.
- [x] Multi-shop profiles, immutable ownership, individual scope and consolidated reports (unit and browser).
- [x] Daily sales, cash/card receipt validation, product exclusion from commission, half-up rounding and edits/deletion (unit and browser).
- [x] Earned commissions, effective dates/snapshots, payments, adjustments and remaining liability (unit and browser).
- [x] Expenses, revenue, loan/card/transfer/distribution separation and bank balances (unit and browser).
- [x] Reports, date ranges, cash flow, reconciliation and current/stale detection (unit and browser).
- [x] Original 968-row JSON: source IDs, raw field digest, dates and all five sums retained through actual browser import/export/fresh restore/re-import; no duplicate addition.
- [x] Original category breakdown and zero-expense bank-debit analysis documented without invented classifications.
- [x] Independent owner additions, three initial shops, conflicting edits, explicit choice, missing ancestry and deletions; older import does not resurrect deletion (browser plus broader unit scenarios).
- [x] Native full/shop export, dependency scope, full backup restoration, confirmed scoped replacement, durable recovery, rejected malformed/overflow/ancestry input and interrupted write rollback (unit; browser full exchange and restore confirmation).
- [x] Versioned IndexedDB migration/preservation (unit); actual financial record/balance survives closing/reopening both persistent browser profile and packaged host (browser).
- [x] Offline file preview/import/export/download and local persistence (browser).
- [x] Light/dark theme persistence; desktop/tablet/mobile no document overflow; mobile menu/dialog keyboard behavior (browser).
- [x] Automated WCAG A/AA/2.1 AA rules: all eight empty workspaces in both themes and a mobile profile dialog (axe). Manual visual inspection of synthetic dark desktop/mobile screenshots.
- [x] Production build and release ZIP integrity verified; references unchanged and excluded from archive.
- [ ] Native Windows installer: not built; no Rust/Cargo or Windows execution environment here.
- [ ] Execute the prepared Windows launcher on the actual target computer, including Node-missing message, extracted paths with spaces, fixed-address restart, financial backup/restore, and offline reopen. This is the remaining platform acceptance check.
- [ ] Complete manual screen-reader and populated-form accessibility audit across all financial states and Windows browsers. Automated checks are a useful boundary, not universal certification.
- [ ] Owner/accountant acceptance of legacy classifications, opening balances, historical rate/allocation assumptions, tax treatment and reconciliation against real statements.

No public hosting, deployment, cloud synchronization, account creation or paid service was introduced. Setup instructions were saved in the cloud environment configuration draft for future development; draft persistence does not publish the app or snapshot the environment automatically.

Final executed results:

- `npm run test`: **73 passed**, 4 suites, zero failed/skipped (17.42 seconds in the final unit run).
- `npm run test:browser`: **16 passed**, zero failed/skipped (2.2 minutes in the final full run, system Chromium). Includes the prior ten browser scenarios, actual-private-original round trip, commission scheduling, all-route offline/responsive checks, independent-owner exchange, packaged persistent-profile restart and axe checks.
- `npm run release:local`: TypeScript and production Vite/PWA build passed; 28 precache entries, approximately 1,196 KiB. No oversized-chunk warning. ZIP verified by Python zipfile CRC test: 32 files, 386,270 bytes; no private originals, source tree or node_modules.
- The new accessibility test initially failed on contrast, and the first packaged restart test used a table-cell locator for a shop heading. Contrast was fixed in the app; the locator was corrected to the existing heading, then the persistence test was expanded to require a saved financial expense and exact bank balance after restart. Final checks were run without removing or disabling assertions.
- Original HTML/JSON SHA-256 values rechecked and unchanged. No import into live storage; no publication/deployment performed.
- Cloud environment `install_script` and `start_skill` draft saved with release build, verification, fixed-origin storage and private-fixture requirements. Snapshot publication/new-task restoration was not performed or claimed.
