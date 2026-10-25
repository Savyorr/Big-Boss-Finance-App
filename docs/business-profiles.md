# Separate business profiles and imported history

This update follows the owner's correction: separate businesses should start in separate profiles, like separate local accounts. The default entry screen is now Choose your business. Create business profile creates an independent IndexedDB database, a business record and its initial scope. It does not add another shop to a shared global workspace. Duplicate profile names are rejected to avoid accidentally starting over in a second empty business. Restoring a full backup preserves the destination profile nickname so two restored copies remain distinguishable in the chooser. Switch profile returns to the chooser. Database selection is fixed when the document loads; a full page reload when switching prevents an in-flight operation from being retargeted to another business.

Each new profile has separate barbers/stylists, accounts, sales, transactions, preferences, import history, source documents, revisions and backups. Exports/backups contain the current database only. There is no cross-profile All Locations view. Profiles are local workspaces, not online identities, encryption or password protection. Other people using the same browser can open these profiles. Separate Windows/browser accounts are needed for actual access separation.

Existing `big-boss-finance` data is discovered read-only and offered as the saved business profile. It is not deleted, copied, reclassified or split automatically. Older databases/backups with several locations remain intact in their existing profile; their location controls are under Settings → Advanced: saved locations. New independent businesses should be created from the chooser. An empty restore profile is available for modern full backups so the restore need not introduce an extra placeholder shop.

Profile discovery uses IndexedDB database names and the saved business name, not a fragile separate browser-storage registry. Each tab stores only its selected database name in sessionStorage. The empty-profile chooser label is local UI metadata and is excluded from financial snapshots/exports, so it cannot create spurious restore or owner-sync conflicts. Reopening the app may show the chooser again; choosing the same business reopens its saved data. Clearing site data or using another browser/origin still does not transfer records. Profile creation does not migrate data from a different port.

## Original transaction-only JSON

The original supplied JSON has transactions, not staff profiles or stylist sales allocations. It imported successfully, but all records were unclassified; the old dashboard displayed only posted financial figures, making a successful import look empty.

Dashboard and Reports now show an Imported financial history section with the original income, expense and bank-withdrawal fields. Credits/deposits are available in its details. The checked integer-cent helper respects the business scope/date range and excludes deleted or already classified records. Imported figures stay distinct from posted entries and verified account figures. Bank withdrawals are never treated as an expense total; deposits/credits are never added to income again. This display change does not automatically classify or write any financial record, invent an account balance or fabricate commissions.

Choosing a JSON file automatically prepares a preview using the current business. Advanced namespace/destination/replace controls and technical history are collapsed. Actual writes still require review and confirmation, conflict choices and durable recovery. A success section links directly to imported history and explains the transaction-only file's missing staff. The Stylist page repeats that explanation when the imported transactions exist but the staff list is empty.

## Updating the local release safely

Download a business backup first. Close the running local helper, extract the updated ZIP and launch it at the same fixed address, in the same browser/profile. If an application update banner appears, finish open forms, accept the update and reload. The chooser will show the existing business; open it. Do not create a fresh profile or re-import merely because the chooser is new. The old database and its internal recovery history remain in place.

The existing transaction import does not need to be repeated. If importing into a new independent profile, choose/create that profile first, select the original JSON, review the automatic preview and confirm. Add the barbers manually with their actual agreed rates, or use a full old-app backup containing staff; the transaction-only original cannot supply those missing profiles.

## Verification

The prior financial regression suite remains required. New tests verify independent databases and preferences, read-only discovery of the old database, separate staff/transactions/exports, automatic import preview, visible source totals, missing-staff explanation, offline profile switching and responsive layouts. Existing browser workflows have been updated to enter through the chooser; old multi-location backup compatibility is exercised through its explicit advanced controls. Actual financial expectations remain private and checksum pinned.

Final v0.5 verification:

- `npm run test`: 77 passed across five suites, zero failed/skipped.
- `npm run test:browser`: 17 passed in the final full run (2.6 minutes), zero failed/skipped. Includes actual original-file digest/totals preservation and dashboard display, clean restore/re-import, isolated business staff/preferences/exports, offline switching, old multi-location exchange/conflicts/deletions, accessibility and packaged financial persistence across browser/server restarts.
- `npm run release:local`: TypeScript, Vite/PWA production build and ZIP packaging passed; all route/library chunks remain locally precached. No oversized-chunk warning.
- ZIP: 390,564 bytes; SHA-256 `215e4dfe3801d07160dad2e026ba1ee017b0323d74f8bdbcb65fe4ae7f79ecb8`. CRC verification passed. Source/private-record and credential-pattern scan included expanded archive contents.
- Both original file hashes remain unchanged. Tests used isolated databases only. The prepared Windows command launcher still requires an actual Windows launch check; Linux Chromium tests do not certify a native Windows installer.
