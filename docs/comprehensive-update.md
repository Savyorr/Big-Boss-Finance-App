# Big Boss Finance 1.1 — comprehensive update

This extends the existing faithful application, not its accounting system. Work remains on `faithful-recreation`; main is preserved. The recoverable baseline is commit `83be9617ca6633a9809d520372b96a57a823a246`, also named locally `checkpoint-before-comprehensive-update-1.0.0`. Original HTML and JSON remain unchanged and private; their hashes are in legacy-reference.md.

## Implemented behavior

The dashboard sections are Daily Income Graph, Expense Breakdown, Monthly Financial Statistics, and Historical Monthly Performance, in that order. All read the selected business's reactive IndexedDB data. The previous completed local calendar month is the default, including January's year boundary. All calendar days appear, missing revenue differs from confirmed zero, exact CAD values can be selected with mouse, touch or keyboard, and accessible tables provide another way to read charts. Mobile charts scroll horizontally within their panels. Historical bars cover twelve completed months ending with the selected month. Reports and charts use the same income resolver. Expense categories use recorded expense fields, never generic bank withdrawals. Comparisons remain neutral when day coverage is incomplete or percentage baselines are unsuitable.

Light blue accents and charcoal/navy dark mode apply throughout the application. Revenue and positive profit are green, expenses/losses red; historical profit has its own purple series with red losses. Labels and signs accompany colours. Theme preference is versioned per business and included in backups.

Daily Sales preserves service/product/card/cash behavior, including negative calculated cash and no product commission. For existing imported revenue, it displays matching transactions, their sum, entered breakdown and difference. Saving requires explicit source confirmation. Stable source IDs and recorded totals link breakdowns without rewriting original transactions. Default linked breakdowns count original revenue and original bank receipts once. Choosing a corrected daily summary or genuinely additional sale is explicit. Changed/deleted sources require review; a deleted source cannot silently reappear as revenue. Explicit tips are stored separately and never inferred from excess card receipts. Staff rate changes retain dated history; saved days retain their frozen rates, and new historical entries use the applicable rate. Original commission period boundaries and recorded payment behavior remain intact.

Export Full Backup / Import JSON / Review Changes / Confirm Import provide manual file exchange. Native v2 includes staff and rate history, all days and frozen rates, tips, deposits, source links, transactions and all original amount fields, adjustments, settings and balances, preferences, raw source documents, business identity, revision ancestry, tombstones, and local recovery histories. Recovery snapshots share unchanged records/provenance in a compact archive; old revisions remain recovery-only. Missing archive references and conflicting immutable content are rejected. Both legacy formats and native v1 remain accepted. The 25 MB supported file limit is checked before downloads; oversized files produce an error rather than partial data.

Imports validate complete graphs and recovery contents before atomic writes. They retain a pre-import snapshot and reject stale previews if financial data, provenance or business identity changes. Revision ancestry controls merging; timestamps never settle financial conflicts. Existing nonempty unrelated businesses cannot be merged. Empty-target adoption is shown explicitly in the preview. Profile databases and recovery histories remain independent. Existing storage is not cleared or reseeded by this update.

## Defects corrected

- Historical breakdowns could duplicate receipts in bank balances even when reports selected one revenue source. Banking now shares the linked-source decision.
- Per-date overlap flags could miss source changes. Saved links identify actual source transactions; stale source identities are flagged and cannot be silently accepted.
- Backups omitted recovery history and portable theme/rate history. The new envelope includes them, with deduplication preventing repeated full-business payloads.
- Import preview staleness checked records alone. Provenance and business identity now participate in the atomic baseline check.
- Chart point selection needed a proper payload closure and keyboard behavior; verified with real hover/click.
- Initial populated mobile charts overflowed the page. Width is constrained to scrollable chart panels; the browser test waits for responsive layout and checks page width.

## Verification and privacy

Final checks use the actual unchanged original reference files in isolated databases/browser profiles, not the owner's live computer. No missing historical barber allocation is invented. The entered example allocation in screenshots is clearly labelled synthetic verification data. Four original barbers restore automatically, with no duplicates; identifiable Contract Labour payments retain their staff links. All 968 unique original transaction identities and all five source monetary totals remain exact. Private expected totals are loaded at test time and are not published.

The 115 unit/integration tests include the preserved 103 original checks and twelve additional financial, source-link, archive, rate and comparison checks. Six production-browser scenarios include the four preserved workflows, comprehensive real-import/restoration/isolation coverage, and light/dark mobile accessibility checks. Manual synchronization checks cover independent additions, repeated files, conflicting edits and explicit resolution, tombstones, foreign-business rejection, stale plans, atomic failure and recovery. Downloaded v2 backups are decoded and compared against all current records, source documents and recovery snapshots after restoration into an empty business. Restored dashboards regenerate from data.

Actual screenshot evidence remains private in `private/comprehensive-browser/`: 01 light dashboard; 02 historical confirmation; 03 original roster; 04 dark dashboard; 05 mobile dark; 06 restored dark dashboard; 07 independent empty profile. These are actual rendered application captures and must not enter Git or the release.

The production build and ZIP integrity check are required, plus the extracted-release check against the real local server: import, all original records/five sums, strict packaged CSP, workbook preview, complete download, browser and server restart, persistence, offline export and all four dashboard/chart sections. Chromium 153 headless was used via `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium`; the system Chromium 154 download/restart defect is described in README. No assertions were disabled.

## Release and remaining limits

ZIP: `release/Big-Boss-Finance-Windows-local.zip`, 431891 bytes, 16 packaged files. SHA-256: `619e74ec914eec1efbb7b3cf494b334609af75d2d829512e66f518b0052bb368`.

Install Node.js 24 LTS once, download and extract the entire ZIP, then double-click Start Big Boss Finance.cmd. Before updating, download a full backup; keep the same browser profile and local address to retain existing storage. No records, original private HTML, private JSON or screenshots are bundled. No public app deployment or merge into main is performed.

Windows-specific launcher execution cannot be performed on this Linux host. The actual packaged server and browser workflows are tested here; a controlled trial on the father's Windows computer and his workflow approval remain necessary. This is a local browser app with a launcher, not a signed native installer. Browser storage can be cleared; keep external full backups. The original transaction-only JSON lacks individual daily staff sales/opening balances; they remain unguessed. Incomplete coverage produces neutral comparisons. Earlier v0.6 accounting databases are preserved but not automatically converted; use that application for v0.6-only records until separately migrated. The backup format supports up to 25 MB; no larger-business benchmark is claimed.
