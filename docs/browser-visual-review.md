# Browser visual review — October 25, 2026

## Scope and limits

The owner requested browser verification of the saved Big Boss profile and its
968 imported transactions. This cloud workspace has no connection to the owner's
computer or its browser IndexedDB. Verification here uses the actual production
application in Chromium with a private local copy restored through the UI from
the unchanged original 968-record backup. It cannot establish the state of the
owner's computer. No production database is modified or financial evidence published.

The browser first imports without roster restoration to reproduce an existing
import. Complete Legacy Migration restores the four barbers and links their
records. A second original import checks duplicate prevention. A separate fresh
profile checks automatic restoration with the default checked roster option.
Another empty profile checks isolation, then the browser returns to Big Boss to
check preservation. The copy receives no synthetic financial entries.

## Corrections found visually

- Dashboard chart currency labels were clipped by the fixed-width vertical axis.
  The axis now sizes to its labels, with padding inside the chart.
- Commission Summary showed a zero ledger before historical payment records
  without explicitly identifying the ledger as new entries. It now has a
  New-entry commission ledger heading and explains that zero new balances cannot
  establish historical earnings or opening liabilities. The exclusion message
  points to the linked historical records displayed below.

No financial calculations, original transaction fields, import mappings or
database schemas changed in these corrections.

## Reproduce private evidence

After `npm ci` and `npm run build`, start the production preview with
`npm run preview -- --port 4173 --strictPort`. In another terminal run:

```sh
BIG_BOSS_LEGACY_FIXTURE='/absolute/path/to/original-backup.json' \
BIG_BOSS_LEGACY_EXPECTED='/absolute/path/to/private-expected-totals.json' \
node scripts/browser-visual-audit.mjs
```

System Chromium is the default executable; `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
can override it. The backup checksum must match the unchanged original. The
expected totals file contains the five original integer-cent field totals.
The preview origin can be overridden with `BIG_BOSS_AUDIT_URL`.

The script captures full-page screenshots and an integrity summary under
`private/browser-visual-audit/`, which is ignored by Git. It compares all raw
original fields and IDs, all five source totals, 968 unique financial records,
per-barber Contract Labour links, repeated import preservation, automatic roster
restoration and profile isolation. Screenshots are real browser captures without
data alteration. They contain private financial records and must stay out of Git
and the release ZIP. Assertion success alone is not visual approval: open and
inspect the captured images separately.

## Review status

The restored-copy browser verification passed. Fourteen actual application
screenshots were captured and inspected, including the restored roster, recorded
financial report, original transaction list, Contract Labour history, JSON preview
and successful repeat import, empty independent business, profile chooser,
automatic fresh-import restoration, preserved Big Boss after switching back, and
the corrected chart. All four names and their 50% defaults are visible. The
historical report matches the preserved source figures. The 85 links are assigned
by original payee to the correct four stable stylist IDs. All 968 transaction IDs
remain unique; original raw fields and five source totals match, and repeat
import leaves financial records unchanged. There were no browser runtime errors.

Post-correction validation: production TypeScript/Vite/PWA build and ZIP creation
passed; all 84 unit/integration tests passed (six suites, 47.60 seconds); both
targeted migration browser regressions passed (1.1 minutes), including populated
mobile accessibility. The independent screenshot capture completed successfully
and its images were reviewed separately from test assertions. Original reference
hashes remain unchanged. ZIP integrity and source/docs/expanded-archive privacy
checks passed. No private screenshots or records are included in the commit.

The owner's actual computer profile still needs verification on that computer.
For an existing import, the update's Complete Legacy Migration action performs
the recovery-backed correction without reimporting the 968 financial records.
The fresh-import default restores the roster without a separate migration click.
