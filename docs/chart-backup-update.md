> Daily chart gaps are now connected with clearly labelled dashed lines in [v1.1.2](connected-income-line.md), following the owner's visual correction. Financial data remains unchanged.

# v1.1.1 — dashboard rendering and backup interface correction

This focused update preserves financial calculations, source linking, stored transactions, full-backup contents and synchronization rules. No data migration, reseeding or database schema change is introduced. The preceding checkpoint remains Git commit `6621ac692f8a8fe03b7bfc87b48d12f15d7eeacc` on the same `faithful-recreation` branch.

## Findings and changes

The actual original JSON has 26 recorded revenue dates in September 2026. September 6, 13, 20 and 27 have no revenue records. Recorded Saturday revenues exist for September 5, 12, 19 and 26. October contains 13 recorded revenue dates through October 15, including Saturdays October 3 and 10, and no expense entries. The apparent weekly gaps therefore reflect absent records, not a weekend exclusion in the financial resolver. Neither the daily-income grouping nor any monetary calculations were changed. Missing dates remain null, confirmed zeros remain zero, and unrelated points are not joined across gaps. No future revenue is fabricated.

The rendering problem was the forced 640-pixel daily canvas within a horizontally clipped/scrolling frame. The daily chart now fits the available width, with explicit horizontal axis padding, top/bottom axis padding and increased chart margins to protect endpoint dots and labels. Dense mobile axis labels automatically thin while every calendar date remains in the plot and date selector/table. The real-record browser check verifies every source day's exact displayed amount, number of plotted points and all point bounding boxes within the mobile chart. Tooltip/point selection and cross-tab reactive updates remain covered.

Dashboard defaults to the current **local** calendar month and allows earlier months. January and a UTC/local month-boundary browser check now assert the current local month. The prior previous-month helper is retained for other existing workflows. All four sections follow the selected month, including the twelve-month history, whose current month can be partial and is described as recorded data.

Expense categories now use a varied blue/green/orange/purple/teal/red/complementary palette. Each slice and its legend marker share the same category colour, even when expense credits are listed outside the positive-only donut. Category names, amounts, percentages and totals use neutral dark text in light mode and light text in dark mode. Values and categories remain exact.

Historical bars use light-mode revenue #15965D, expenses #D94C58 and profit #397DDE, with readable dark-mode equivalents. Tooltips and legend markers use the matching series colours. Negative profits remain red below zero, using the existing signed values.

Data & Backup emphasizes Import JSON, Export Full Backup, Restore Full Backup and local recovery history. The redundant Download Backup button has been replaced by a clearly labelled file input for the existing guarded replacement workflow: review, type REPLACE, confirm, pre-restore recovery snapshot. Original backup-text and Excel controls remain functional under the closed Advanced migration utilities disclosure. Both original JSON formats still use the main importer. Export contents, duplicate prevention, explicit conflicts, tombstones and atomic recovery rules are unchanged.

## Verification

- All 115 existing unit/integration tests pass (8 suites).
- All 7 production-browser scenarios pass, including the six existing scenarios and one comprehensive chart/backup regression. No financial assertions were removed. Existing expectations/selectors were updated for the authorized current-month default and the advanced migration disclosure.
- Actual original September/October daily revenue, weekend dates, null future dates, distinct expense colours, neutral legend values, mobile plotting bounds, light/dark accessibility, imports, full-backup replacement into an empty profile, exact restored records/provenance, manual synchronization, conflicts, offline persistence and full process restart were checked.
- Production TypeScript/Vite build passes; chart and Excel chunks remain lazy and bundled locally.
- Windows ZIP CRC integrity checked and extracted local server tested with the original file: all 968 source records/five monetary totals, packaged CSP, advanced Excel preview, full JSON download, browser/server restart, offline export and dashboard rendering. October has two chart canvases because there are no expenses to draw; September's populated donut is covered in the browser scenario.
- Original HTML and JSON checksums remain unchanged. Original financial files, expected totals and actual screenshots are private and excluded from Git/release.

Actual screenshots: ignored `private/comprehensive-browser/08-chart-2026-10.png`, `08-chart-2026-09.png`, `09-mobile-2026-10.png`, `09-mobile-2026-09.png`, `04-dashboard-charcoal-navy.png` and `10-simple-data-backup.png`.

Release: `release/Big-Boss-Finance-Windows-local.zip`, 16 files, 432319 bytes; SHA-256 `cd57c38e3f5c1db51e1783b0a9c9de86de77f8d38201dbbf4de669c07d4af315`. Download and extract the entire archive; with Node.js 24 LTS installed, double-click Start Big Boss Finance.cmd. Download a full backup before updating and retain the same browser/profile/address.

Browser verification uses isolated copies of the original source and local Chromium 153 on Linux. It does not access the owner's live computer. Windows-specific launcher execution remains untested here and requires a Windows trial. No public application deployment or merge into main is performed. Previous storage/backup compatibility limits documented in the owner guide remain unchanged.
