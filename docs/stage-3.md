# Stage 3: JSON exchange, backups and manual synchronization

Stage 3 extends the existing application and financial services. No cloud service, remote database, authentication, hosting, paid service, or automatic synchronization is used. Original HTML and JSON reference files remain unchanged, outside Git and outside live application data. The real private backup is used only in isolated regression tests.

## Owner workflow

1. Choose a location and open Data Management. Use Export Current Shop, Export All Locations, or Download Full Backup. The confirmation lists every included shop. Download JSON and confirm the file finished saving in the browser's Downloads folder. Retain it independently of this browser.
2. Send the file yourself through WhatsApp, email, USB, or another file-sharing method. The app does not send files or contact another owner.
3. The receiving owner chooses the file or drops it into Import Data. Legacy files require an explicit target shop. Modern files match stable shop IDs; similar names never merge shops.
4. Preview the format, source date, destination, record counts, warnings, five source-field totals, and classified financial amounts before/after the proposed change. Preview performs no database writes.
5. Resolve each conflict with Keep Local or Use Imported, or cancel. Monetary differences display in CAD; full record details are optional. Linked sales, events and earnings (or payments/adjustments and events) form one conflict group.
6. Confirm Import, then Apply merge. The app creates a recovery point, applies the reviewed plan atomically, verifies counts/records/financial values, and reports the result. Repeating the same file does not add another copy of its records.

Legacy dataset labels are optional advanced identity controls. Keep the same label for files from one originating dataset. Separate datasets with reused source IDs need different labels; their origin cannot be inferred from matching amounts or names. Different legacy formats can overlap and are never guessed to be duplicates. Inspect the preview warnings before combining them.

### Shop mapping and transfers

An unfamiliar modern shop can remain an independent new shop or be explicitly mapped to an existing local profile. Edit mappings together, then preview again; the previous preview cannot be applied while mappings are pending. Mapped imports require an additional mapping confirmation. The app preserves the local shop's identity/name and stores original identity and revision mappings, including source profile history. Account/stylist IDs remain distinct even when their names match; shop mapping is not a heuristic account or stylist merge.

A unique prior source-to-target mapping is remembered in later previews. Multiple prior destinations require an explicit choice. Reversible identity and revision mappings allow edits to return to their original IDs on the other owner's machine, preventing new copies on subsequent exchanges.

A single-shop export must include complete linked transfers. It expands to the complete connected shop set when inter-shop movements require it, instead of omitting a transfer leg or inventing a partial account balance. Every included location is listed before download. Share such a file only with an owner authorized to see all listed shops. Independent shops export individually without expansion.

## Merge, replacement and restoration

Merge is the default. It adds new identities, skips identical or provably older records, applies proven descendant updates, and preserves unrelated local records. Source identity includes its format, dataset label and destination shop. Distinct legitimate source IDs remain separate even if every monetary value matches.

Replace is an advanced scoped operation. It lists the exact extra active records that would be removed, requires conflict choices for differing records, and requires typing REPLACE. Missing records in the displayed replacement scope become audited soft deletions. Other shops remain untouched. Connected dependency shops in an expanded single-shop export merge normally; replacement omissions affect the requested shop only. Source documents, historical revisions, prior audit records and provenance are retained.

Create Backup saves a local recovery snapshot and offers a download. Local snapshots can be restored through the same preview/conflict/confirmation pipeline. Restore Backup from File accepts a downloaded modern full backup. Full backups restore all required business data into a fresh installation. Restoration into an existing installation replaces the shops contained in the backup, with explicit confirmation; it does not perform a browser reset or remove unrelated locations absent from that backup.

Local recovery snapshots survive an import write failure, but cannot survive cleared browser storage or loss of the device. A downloaded backup contains current business state, revision/deletion/source metadata, and backup-history metadata. It does not recursively embed all previous recovery snapshot payloads. In a restored installation, those older entries are labelled metadata only; use their original downloaded files for those older recovery points. A download is reported as initiated, never guaranteed retained merely because JSON was generated.

## Supported formats and accounting treatment

### A: original 968-transaction envelope

The adapter validates `app`, version 1, optional export timestamp, and all transactions. It preserves each original ID, date, type, category, payee, details, notes and the five independent monetary fields. Original content, including unknown fields, is retained in source metadata and a checksummed complete source document. Canonical UUIDs and source revisions are deterministic for the format/dataset/shop/identity.

No receiving account, stylist allocation, profit classification, or loan treatment is invented. Legacy transactions appear in the existing Transactions page as Needs review, with their original ID, raw record, and source amounts in Details. Edit an entry to explicitly classify and assign its actual account; the independent original source fields remain unchanged. Zero-value review records can be edited without fabricating a positive financial amount. Banking, Dashboard and Reports show classification warnings and exclude unclassified values from recognized financial totals. Source-field totals remain separately visible in preview.

### B: original HTML application's JSON state

A dedicated adapter handles `days`, `tx`, `staff`, `open`, optional `bal`, and optional `adj`. It is not the transaction-envelope adapter and does not execute HTML or JavaScript.

Daily dates, stylist/product allocations, saved daily totals, card/cash/deposit source values, staff, commission defaults, signed adjustments, original bank/opening snapshots and unsupported source fields are retained. Original saved totals are stored independently of row totals when they disagree. Legacy snapshot values are displayed in Data Management as reference values, not silently assigned to new accounts. The exact source document is included in modern exports.

Daily entries with missing account assignments remain unposted and visible in Daily Sales. Their saved original totals are shown and flagged. Saving such a day explicitly recognizes row-derived revenue and new per-day commission rounding after selecting accounts; a warning explains this and original values remain in provenance. No historical per-day earnings are fabricated from aggregate legacy commission rules. Aggregate historical rounding and uncertain payment matching still require owner review. Adjustments preserve legacy period treatment and settlement signs.

### C: modern format version 1

The envelope contains `application: "big-boss-finance"`, `schemaVersion: 1`, `exportId`, `exportedAt`, a declared scope, and `data` collections:

- shops, stylists, accounts, dailySales, transactions;
- commissionRules, earnings, commissionPayments, adjustments, openingBalances;
- reconciliations, settings (including categories/preferences);
- revisions, tombstones, sourceMappings, sourceDocuments;
- importHistory and backupMetadata.

Arrays are deterministically sorted by stable keys. Monetary values are integer CAD cents. Unknown modern versions or unsupported/nested fields are rejected rather than stripped or guessed. Future changes must add an explicit version adapter/migration and preservation tests. Database schema version 3 is separate from interchange version 1: it adds sourceMappings and sourceDocuments without changing the original version 1/2 declarations or rewriting existing payloads.

## Synchronization and integrity contracts

Revision UUID ancestry, not timestamps or revision numbers alone, determines safe updates. A remote descendant can replace a local ancestor; an older ancestor is skipped. Divergent or unknown ancestry is a conflict. Equal revision IDs with different immutable payloads, cyclic graphs, cross-entity ancestry, wrong shop references, duplicate identities and inconsistent financial links are rejected.

Resolving a business conflict records a new head and both parent revisions, keeping both histories. Linked financial aggregates resolve together; stale exports cannot introduce obsolete earning children. Soft-deleted records and tombstones are transported. Older files cannot silently resurrect deleted records; an explicit reviewed replacement can restore prior values through a new audited revision. Tombstones/revisions are not pruned automatically.

All candidate relationships and classified event values are checked before writing: daily revenue/receipts, commission snapshots/earnings, payments/adjustments, account movements, ownership and source-field consistency. Arbitrary incompatible choices fail validation rather than causing silent corrections. Review warnings and source data do not become an assertion of verified profit or reconciled balances.

The full candidate is computed from the read-only baseline. A first database transaction saves a durable recovery backup only if that baseline is still current. A second transaction reacquires the write lock, verifies the same baseline, and applies the candidate. If another tab changed business data, the plan expires. If writing or post-write record/financial reconciliation fails, the apply transaction rolls back while the prior backup remains committed. Failed applies have a rejected history entry pointing to that recovery backup. Parsing/preview validation failures do not write history or backups because no import application was attempted.

Post-write verification compares all business/synchronization records and checked cent values to the planned candidate, independently of the raw five-field totals. Raw source totals include retained deleted source records and are not accounting reports. Classified totals are separate. Import result counts refer to business records, including linked entities, while the preview also identifies its source transaction count.

## Security, performance and operational limits

Input is untrusted. Parsing rejects malformed JSON, duplicate properties, prototype-related keys, nonfinite numbers, nesting beyond 32 levels and more than one million values. Files are UTF-8 JSON, limited to 25 MB, with per-collection limits of 100,000 records. Decimal money is converted from original numeric lexemes to exact integer cents; unsupported precision and unsafe totals are rejected without rounding. Native schemas and cross-record relationships are validated locally. Source documents retain checksum-verified text. React escapes displayed source text; imported content cannot execute code or modify application files.

Parsing and legacy adaptation run in a bundled local web worker. The production offline cache includes the worker. Conflict/removal/import/backup histories are paginated; transaction and daily-sales tables show at most 50 rows per page. Recovery uses complete snapshots and needs additional local storage; if backup creation fails, the import does not proceed. The file limit also applies to downloaded exports; very large independent businesses should use separate shop scopes. No larger-than-limit or 100,000-record performance benchmark is claimed.

Manual exchange cannot infer that two different IDs describe the same physical bank account or that two legacy formats describe the same business event. It cannot authenticate an owner's identity cryptographically. Share files with trusted owners, keep dataset labels stable, inspect destinations, and review uncertain classifications. This stage does not implement automatic cloud reconciliation or automatic conflict decisions.

## Regression fixture and round-trip comparison

The full test suite requires the unchanged original private JSON. `BIG_BOSS_LEGACY_FIXTURE` can point to it outside Git; the current cloud attachment path is the fallback. Missing or checksum-mismatched fixtures fail the required tests; they are not silently skipped. Windows application startup does not depend on this test fixture. Synthetic fixtures cover the HTML state and modern financial data. No private fixture is copied into source, public assets or the live app.

Modern round-trip tests compare all business, source, revision, deletion and required-setting collections exactly. They ignore envelope export ID/timestamp/scope metadata changes and verify operation audit/recovery metadata as additive: a real import necessarily adds a new history entry and a pre-import recovery point. Existing imported audit and backup-history metadata are retained. `lastExport` is a local operational note; differing notes do not decide business conflicts or invalidate a reviewed financial baseline.

Historical Stage 3 results are recorded below. Stage 4 is now documented in [stage-4.md](stage-4.md); the counts and handoff below describe the earlier Stage 3 checkpoint. No application publishing or deployment is part of this stage.

## Executed validation

- `npm run build`: passed strict TypeScript checking and production/PWA generation. The import worker is bundled and precached locally. A nonfatal warning remains for the approximately 709 kB main JavaScript bundle; no verification was disabled.
- `npm run test`: **68 passed** across three suites. Existing profile/financial checks remain, plus required real-file legacy regression, distinct HTML state fixtures, modern round trips, explicit and remembered shop mapping, reversible two-owner identities, independent additions, ancestry/conflict choices, tombstones, linked-aggregate conflict resolution, scoped replacement, stale preview rejection, malformed/prototype/cyclic/precision input rejection, forced write rollback, post-write mismatch rollback, and recovery into a fresh database.
- The unchanged private backup imported **968** source transactions, with every original ID retained. All **20** zero-value source records and source bank movements without expenses were preserved. Reimport added **zero** transactions. A modern export restored into a fresh isolated database retained all 968 records and the exact five totals below.
- Modern single-shop financial round trips retained all business records, effective rates, commission history, explicit opening balances and reconciliation records. Inter-shop exports preserved complete transfer relationships. The required comparisons distinguish business state from newly added import audit/recovery metadata.
- Full browser suite: **10 passed** in Chromium, including Stage 1 and Stage 2 regression workflows. Stage 3 browser coverage includes selection/drop, legacy target selection, read-only preview, repeated merges, changed-source conflict decisions, explicit/remembered multi-shop mapping, export downloads read back from disk, fresh-context restoration, local restore confirmation, malformed JSON, and offline worker-based preview/merge/download/re-import.
- Desktop and mobile Data Management preview screenshots were captured and visually inspected; the mobile check found no document overflow. Source text remains escaped. Development-server smoke returned HTTP 200 with Data Management rendered and no page errors.
- Formatting/whitespace checks passed. SHA-256 checksums of both originals still match `legacy-reference.md`. Private originals were not modified or copied into Git/public assets/live data. Test databases and browser contexts are isolated.
- Integer-boundary import and display tests also passed. Exact normalized dollar text accompanies the five legacy cent fields so known source values do not depend on binary floating-point metadata. Currency rendering splits whole dollars and the exact cent remainder before formatting.

| Independent original source field | Verified CAD total |
| --------------------------------- | -----------------: |
| Income                            |         [private financial reference] |
| Expenses                          |         [private financial reference] |
| Bank credits                      |         [private financial reference] |
| Bank deposits                     |         [private financial reference] |
| Bank debits                       |         [private financial reference] |

These totals remain source regression references, not verified profit, cash flow or reconciled balances. Real financial data was not imported into the live application during development.

## Historical Stage 4 handoff (at Stage 3 completion)

Keep the native version 1 envelope, DB version 3 migration history, canonical event links, revision graph and source preservation contracts intact. Final validation can broaden to actual Windows execution, additional browsers, accessibility review, larger-file/memory/quota stress, and owner review of legacy classifications/opening-account assignments. The 25 MB cap, connected-shop export rule, manual provenance limits and nonrecursive recovery history are current documented boundaries, not hidden automatic behavior. No application has been published or deployed. Cloud startup instructions were saved as a draft; publication of a development environment snapshot is a separate manual action.
