# Stage 2: financial management

Historical stage record: Stage 3 now supplies the previously deferred exchange features. See `stage-3.md` for current import/export, backup and synchronization behavior.

Stage 2 extends the existing React application, theme, routing, local profiles, and database. It does not import the private legacy backup or implement Stage 3 exchange. Both original reference files remain outside the repository and retain the SHA-256 hashes in `legacy-reference.md`.

## Owner workflows

### Record daily sales

Choose a shop in the top bar. Open Daily Sales → Record Today's Sales, enter the business date and each stylist's service revenue, product sales, and card receipts. Choose the cash and card receiving accounts. Cash initially calculates as total revenue minus card receipts; optionally choose verified cash received and enter the actual amount. The app distinguishes calculated cash from verified receipts. Mismatches or negative calculated cash are preserved with warnings, not forced to balance.

Save the day. There is one active day per shop/date. Editing updates the existing linked event and earnings; deleting requires confirmation and removes their financial effects together while retaining audit records. Historical allocations and amounts appear in the daily history. Use the reporting month/year or From/To filters to find older records.

### Pay a stylist or correct settlement

Open Stylists & Commissions → Payment history (or Commission history) → Pay Stylist. Select the shop, stylist, date, amount, cash/bank account, payment method, and notes. Save payment. Edit or reverse it in the history. The payment reduces cash and commission liability; it does not create another operating expense.

Add adjustment for an explained signed settlement correction. A positive adjustment reduces the amount owed; a negative adjustment increases it. Types include correction, previously settled, deduction, advance reclassification, and other. Adjustments have no automatic cash or expense effect. Any actual advance movement must be recorded separately as a bank withdrawal, with appropriate review; never create a commission expense merely because money was advanced.

New settlement records use actual dates by default. Explicit Legacy mode groups payments/adjustments through day 22 into the first-half period, preserving the inspected original's behavior. Cash movements still use the actual payment date. Filters and summaries display the chosen half-period treatment. Earnings always split at day 15. Negative individual closing positions mean over-settlement; total outstanding liabilities sum positive stylist positions only, with overpayments disclosed separately instead of offsetting other stylists' payables.

### Record income, expenses and movements

Transactions → Add Transaction supports revenue, operating expense, bank deposit/withdrawal, transfer, loan advance/principal/interest, credit-card payment, owner distribution, unclassified review entries, and signed commission settlement adjustments. Category entry accepts custom text and shop-specific suggestions. Commission payments use the linked commission workspace. Account opening balances belong to account profiles rather than duplicate transactions.

Use Revenue only for income not already in Daily Sales. A later deposit or transfer of sales receipts is not more revenue. Bank deposit/withdrawal are standalone money movements, not profit; select Transfer when both accounts are known. Loan advance moves from a liability account into cash/bank. Principal repayment moves cash/bank into an operating-line account. Credit-card payment moves cash/bank into a credit-card account. Credit-card purchases can be recorded as operating expenses on the card account; repayment does not recognize the expense again.

Transfers have a single canonical event with paired movements, including explicit destination shop/account for inter-shop transfers. Both locations' account balances update atomically. A receiving location can see its transfer but must switch to the owning shop (or All Locations) to edit it. Same-account, wrong-owner, invalid account-type, and unsupported cross-shop financing operations are rejected.

Transaction filters support month/year/range, category, type, account, shop context, search and sorting. Details show movements, revision metadata and any preserved independent source fields. Linked sales, payments and adjustments are corrected from their original workspace. Financial deletion is soft deletion with confirmation and tombstones; it is not permanent erasure.

### Banking and reconciliation

Account balance through a date equals its explicit original opening balance plus classified signed movements from the opening date through the requested date, inclusively. Entries before the opening date do not affect that account balance. Dates before opening report no known balance. Opening balances are never income. The account profile is the single opening-balance authority; the reserved openingBalances table is not added again.

Positive balances represent assets; negative credit-card/loan balances represent debt owed. Enter negative opening balances for liabilities. Cash/bank totals include Chequing, Savings, Cash, and Petty Cash. Credit cards and operating lines remain visible separately; custom Other accounts are excluded from cash metrics because their accounting meaning is unknown. Account type cannot be changed once active movements exist; create a new account instead. Explicit opening-balance corrections remain audited and invalidate affected reconciliations.

Banking → Transaction history displays signed movements. Banking → Reconciliation selects an account, statement date and signed closing balance. Select the cumulative cleared movements through that date, including previously cleared entries. Opening balance is included once. Cleared balance minus statement balance is the difference; uncleared entries remain outstanding. Zero difference permits completion. Nonzero difference saves only an in-progress reconciliation. This never manufactures balancing transactions. History stores account and cleared-event revisions; editing/deleting a cleared record or changing the account flags the old reconciliation for review.

### Reports and consolidated results

Dashboard and all eight reports use the same pure calculation functions. Choose month, financial year, or custom dates. The selected shop scopes results; All Locations includes all shops' historical data, including archived locations. Paired internal transfers do not create revenue or expense, and are eliminated from consolidated cash movement where both accounts are included. Individual shop balances retain their respective legs.

Reports include profit and loss by category, revenue by date/location/stylist and service/product/other revenue, expenses by category/month/location, cash movement, commission balances and prior-period carry-forward, banking movements and reconciliations, location comparison and annual monthly comparisons. Browser Print / Save as PDF is provided. A shop's financial-year start month applies when choosing a reporting year; All Locations defaults to calendar years and supports explicit custom ranges.

## Accounting assumptions

- Authoritative values and all intermediate arithmetic use integer cents and checked BigInt operations. Display formatting alone converts cents for Intl rendering. Unsupported precision, nonfinite numbers and unsafe aggregate magnitudes are rejected, not converted to zero.
- New sales recognize revenue on the sale date. Eligible stylist service earns commission rounded half up per stylist per day. Products earn none. Saved earnings store rate snapshots and service amounts; changes to profiles do not retroactively recalculate them. Editing the same dated sale preserves its rates; changing the sale date selects that date's effective rules. Future/backdated rate rules apply to unsaved/new days, not existing snapshots.
- Existing Stage 1 stylists without rate history retain their profile rate as a compatibility baseline until a change is recorded. Editing creates an explicit baseline plus the effective-dated rule. New profile rates default to 50% or the shop's configured default. A sale before all explicit effective rules is rejected rather than inventing a rate.
- Operating expenses are recorded operating costs plus commissions earned. Payments settle commission liabilities. This is an operating/accrual view for commissions, not a complete general ledger or a verified statutory net-profit statement. Unrecorded taxes, depreciation, financing adjustments and other omitted entries can change final business profit. Source totals are not proof of reconciliation.
- Each real-world event is stored once. Account postings are normalized signed movements, not extra transactions or additional income. Daily Sales links to one canonical transaction and one earning per stylist. Repeated operation IDs are rejected; unrelated identical transactions remain separate.
- Unclassified source transactions and unposted pre-existing daily records remain preserved and visibly flagged for review, excluded from recognized financial metrics. No raw-field heuristic forces classification. Normalized accounting values are independent of the five optional preserved legacy fields. New native entries do not manufacture original legacy source fields.

## Database, integrity and Stage 3 contracts

Dexie version 2 is additive: it retains the exact version 1 declaration, adds earnings and reconciliations tables, and adds a managed-event index. No version 1 payload is rewritten or deleted automatically. Financial records reference immutable shop IDs and CAD currency; existing v1 account payloads remain unchanged, while new/explicitly edited accounts include CAD currency.

Writes validate with Zod, check active shops and referenced ownership, compare expected revisions, and commit related records and revision snapshots atomically. New payment/day/transaction/adjustment forms retain an operation UUID to prevent accidental replay after a successful save. Concurrent writes are serialized in IndexedDB transactions. Deleted source entities, linked events, and earnings retain soft-deletion metadata and synchronization tombstones. Native transaction revisions also include an incrementing revision number alongside portable revision UUIDs.

Stage 3 must preserve these canonical links, snapshot rates, signed movement conventions, source fields/provenance, deleted records, revision ancestry, and both inspected backup structures. It must explicitly map legacy shops and ambiguous classifications. Do not infer commissions from the supplied transaction backup alone; it lacks structured daily stylist allocations. Legacy commission aggregate rounding may differ from new per-day rounding; preserve source results and expose differences rather than silently rewriting history. The 968 records and five exact field totals remain migration regression references, not live application data.

## Limitations and validation

JSON import/export, downloadable backup, restore and manual synchronization remain disabled for Stage 3. Browser storage can be cleared; use an independent backup mechanism before relying on this development build for production financial records. Existing HTML/JSON are reference-only and were not loaded into the app. No authentication, cloud service or external financial API was added. Windows launcher execution and full cross-browser/accessibility certification remain untested in this Linux environment.

Validation results are recorded below after final checks. Synthetic fixtures and isolated browser contexts are used; private financial records are not test seeds or committed fixtures. Production builds may retain a nonfatal bundle-size warning; this does not skip type checking, tests or offline caching.

## Executed validation results

- `npm run build`: passed strict TypeScript checks and Vite/PWA output generation. The approximately 647 kB main JavaScript bundle triggers a nonfatal size warning; charts are lazy-loaded, all built assets are locally cached, and no checks were disabled.
- `npm run test`: **44 passed** across the retained profile/database suite and new financial suite. Coverage includes exact rounding/overflow, daily edits/deletes, effective rates, products excluded from commission, receipt discrepancies, accounting classifications, loans, credit-card settlement, distributions, inter-shop transfers, opening dates, gross liabilities and overpayments, signed adjustments, payment reversal, stale revisions, duplicate operation IDs, concurrent daily writes, rollback, reconciliation invalidation, preserved source fields, version 1 upgrades, and database reopen persistence.
- `npm run test:browser`: **7 passed** in Chromium, including the Stage 1 regression checks, complete financial workflow, offline profile/report access, actual transaction forms for financing/transfers/card payments/distributions, and persisted per-shop preferences/fiscal-year/date validation. These use synthetic data in isolated browser contexts.
- After adding explicit chart assertions, the focused financial-workflow browser test passed again, verifying the revenue/expense, profit and cash chart modes render. The dashboard screenshot was captured after the chart loaded.
- Development browser smoke: HTTP 200, Financial Overview rendered, no page errors.
- Formatting and whitespace checks passed. Original HTML and backup SHA-256 checksums match `legacy-reference.md` after implementation. No original records were imported into live IndexedDB or committed as fixtures.
- Cloud startup instructions were updated for Stage 2; the existing install script remains applicable. The saved draft does not publish the environment. Review/save in environment settings, then publish when ready.

Stage 3 has not been started. Import/export round-trip tests against the 968-record backup remain unrun because the exchange engine belongs to that stage.
