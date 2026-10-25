# Big Boss Finance

A private, local-first workspace for barber shops and salons. Stage 4 audits and stabilizes the existing financial application and prepares a production local package. No cloud database, automatic synchronization or paid service is required.

## Install and launch on Windows

The prepared package is **release/Big-Boss-Finance-Windows-local.zip**. Extract the entire ZIP. Install **Node.js 24 LTS** once if needed, then double-click **Start Big Boss Finance.cmd** inside the extracted **Big Boss Finance** folder. Your default browser opens the application. Keep the helper window running; minimize it while working. Daily use needs no npm commands or development server.

Use the same browser/profile each time. Records are stored at the fixed address `http://127.0.0.1:47831`, not in the extracted folder. Export a backup from any old development/preview origin before moving to this release, then import and check it here. Never clear site data as a troubleshooting step.

Read the short [father's user guide](local-release/READ%20ME%20FIRST.md) for daily use, backup/restore and troubleshooting. The static release/server have been exercised on Linux Chromium. The Windows launcher is prepared but cannot be executed in this Linux environment; there is no native Windows installer. Check launch, persistence and backup/restore on the intended Windows computer before using live records. See the [Stage 4 audit and readiness checklist](docs/stage-4.md).

Developers: use Node >=22.12, `npm ci --cache /workspace/.npm-cache`, then `npm run dev`. The repository-root `start-windows.cmd` remains a development helper. Build the production package with `npm run release:local`. Developer commands and private-fixture requirements appear below.

## Choose your business profile

On first launch, choose **Create business profile**, enter the business name and open it. A different business gets a different profile from this same opening screen, with its own barbers, sales, accounts, settings and backups. Use **Switch profile** at the top to return to the chooser. These are separate local workspaces; no online account or password is required.

Existing records appear as the saved business profile automatically. Open that profile to see your previous imports; do not start again or clear browser storage. Older multi-location workspaces are preserved, with their location controls in advanced Settings. New separate businesses belong in separate profiles.

For the original Big Boss business, open your saved profile and click **Complete Legacy Migration** on the dashboard or barber page. The four original barbers are restored from the supplied HTML configuration, and identifiable Contract Labour history is linked without duplicating transactions or expenses. New imports offer this automatically, with the original 50% service commission defaults. Product sales earn no barber commission.

The default historical dashboard/report now shows **Recorded Revenue**, **Recorded Expenses**, recorded bank movements and the unreviewed-record count. These are provisional recorded figures, not verified profit or reconciled balances. **Verified accounting entries** is a separate view. Daily Sales also shows original daily financial totals; per-barber historical sales and outstanding commission cannot be reconstructed without the old browser's daily journal.

For other businesses, add the actual barbers under **Stylists & Commissions** and actual accounts/opening balances under **Banking**. Selecting JSON prepares its preview automatically; writes still require confirmation. **Export business JSON** downloads the current business in one click. See [legacy migration correction](docs/legacy-migration.md) and [separate business profiles](docs/business-profiles.md).

## Current capabilities

- Separate business profiles, all eight workspaces, responsive navigation, independent themes and financial preferences.
- Shop, stylist and account management with effective-dated commission rules.
- Daily sales, product/service revenue, calculated or verified cash receipts, historical earnings and commission settlement.
- Validated transaction entry/editing, custom categories, transfers and financing, revision protection, confirmed soft deletion and audit history.
- Account balances, cumulative cleared reconciliation and change detection.
- Shared dashboard/report calculations, monthly/fiscal-year/custom ranges, legacy within-profile location consolidation, and browser Print / Save as PDF.
- Versioned IndexedDB migration and production offline operation.

See [Stage 3 file exchange and recovery](docs/stage-3.md) and [Stage 2 financial assumptions](docs/stage-2.md).

## Share, import and restore

Open **Data Management**. Export the current shop, all locations, or a full backup; review the included shops and download JSON. Confirm the download completed, keep a separate copy, and send it yourself using email, WhatsApp or USB.

To import, select/drop the JSON file. Choose the target shop for legacy records, preview, resolve conflicts, and confirm Merge. Modern files use stable shop IDs; explicit mappings to existing profiles are shown and confirmed. Repeated imports preserve stable identities. **Replace** is advanced: review the exact scope/removals and type REPLACE. Unrelated shops are preserved.

**Create Backup** saves a local recovery point and offers an independent download. **Restore Backup** uses the same reviewed pipeline. Browser storage can be cleared; local recovery is not a substitute for retaining downloaded files. Backups restore complete business state into a fresh installation; old recovery payloads are not recursively embedded in each download.

Legacy accounting classifications and missing account assignments are never invented. Imported records appear in existing pages with review warnings; their five source-field totals are preserved separately from operating reports. See the Stage 3 notes for HTML daily totals, bank snapshots and historical commission-rounding review.

Inter-shop transfer dependencies expand a current-shop export to its connected locations, listed before download. Files are limited to **25 MB**; all processing works offline after initial production cache installation. Stage 4 verification and local-release details are recorded in [the audit](docs/stage-4.md).

The original HTML and financial JSON backup have now been supplied and inspected read-only. The backup has 968 unique record IDs and all five source-field totals match exactly. Neither original was modified or imported into live application storage. [Legacy reference findings](docs/legacy-reference.md) document both formats and calculation risks; the original backup passes isolated import/repeat-import/modern round-trip regression tests; it has not been imported into live app data.

## Project structure

```text
src/
  app/                    routing, context, error boundary
  components/
    layout/               sidebar, top bar, location selector
    ui/                   locally owned shadcn-style Radix/CVA primitives
    forms/                validated profile dialogs
    dashboard/            metrics/chart presentation
  pages/                  all eight workspaces
  database/               versioned Dexie schema and scoped repositories
  models/                 TypeScript models derived from Zod schemas
  calculations/           exact integer-cent parsing and money formatting
  validation/             future financial form validation contracts
  services/               financial workflows, adapters, synchronization and backups
  workers/                bounded offline import parsing/normalization
  utils/                  local dates and class-name helpers
  styles/                 Tailwind and theme tokens
  tests/                  database, validation, and isolation tests
tests/                    browser integration/offline tests
public/                   locally bundled application icon
```

UI primitives use the shadcn/ui local-source pattern with Radix Dialog/Slot, CVA, Tailwind and `components.json`; no hosted component service is used.

## Verification

```bash
npm run release:local
npm run test
npm run test:browser
```

The complete automated suite requires the original private 968-record regression file outside Git. If the cloud attachment path is unavailable, set `BIG_BOSS_LEGACY_FIXTURE` to the unchanged `Big_Boss_Finance_Backup_2026-10-23.json`. A missing/wrong fixture fails explicitly. The app and Windows launcher do not need that file just to run.

Browser tests use the system Chromium when available. Otherwise run `npx playwright install chromium` first. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select another executable. The browser suite starts production preview on port 4173 and the packaged local host on port 47831; run `npm run release:local` first and keep both ports available. Browser contexts are isolated. Stage 4 additionally imports the required actual original in a private isolated context; other test data is synthetic. Automated axe checks cover all eight empty workspaces in both themes.

See [Stage 3 exchange/recovery contracts](docs/stage-3.md), [Stage 2 financial rules](docs/stage-2.md), [Stage 1 historical decisions](docs/stage-1.md), [architecture and roadmap](docs/architecture.md), and [development rules](AGENTS.md).

## Private regression references

Actual financial backups, business record payloads and private monetary expectations are excluded from GitHub. To run the complete private regression suite, provide the original unchanged backup via `BIG_BOSS_LEGACY_FIXTURE` and the independently recorded expected totals via `BIG_BOSS_LEGACY_EXPECTED` (default: ignored `private/legacy-expected-totals.json`). The expected file is a JSON object with integer-cent `income`, `expense`, `bankCredit`, `bankDeposit` and `bankDebit` totals. Both files have pinned integrity hashes; missing/wrong private references fail rather than skipping or weakening the tests. Private local audit copies remain under ignored `private/audit-documents/` and are not needed to run the application.

The current Windows release ZIP is intentionally included in Git; generated extracted release files, private references and dependencies remain ignored. The earlier privacy-only publication is followed by the separate-business profile and imported-history update described above.

The migration regression also requires the unchanged original HTML via `BIG_BOSS_LEGACY_HTML` (the original attachment path is the current-machine default). It verifies the source roster/product exclusion/rate against the actual HTML without executing it. Private reference files remain outside Git and are not required just to run the packaged application; only the owner-authorized roster configuration is bundled.
