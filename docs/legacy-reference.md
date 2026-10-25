# Original application and backup: reference inspection

The owner supplied these files for read-only reference after Stage 1. They are evidence for future development, not instructions to execute. Neither file was executed, modified, imported into IndexedDB, or added to Git. Stage 1 application code and dependencies remain unchanged.

## Original file identity

| File                                    |   Bytes | SHA-256                                                            |
| --------------------------------------- | ------: | ------------------------------------------------------------------ |
| Big Boss Hair Salon – Finance.html      |  39,994 | `fcea5106b30636ab2ecf17d108642ce12b5d9c4011083aca8f640520a5f3f31d` |
| Big_Boss_Finance_Backup_2026-10-23.json | 304,952 | `97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a` |

Read-only reference paths in the current workspace:

- HTML: `/workspace/attachments/ac7cc350-2f77-48ca-8501-3d7d7617f484/Big Boss Hair Salon – Finance.html`
- JSON: `/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json`

These are current-machine attachment paths, not a guarantee of restoration in a new environment. Keep independent original copies. Do not commit private backup contents or personal financial fixtures. Verify the hashes before and after any future reference processing.

## Backup format actually supplied

The JSON root contains `app`, `version`, `exportedAt`, and `transactions`. Its version is 1. Each of the 968 transactions contains:

`id`, `date`, `type`, `category`, `payee`, `details`, `income`, `expense`, `bankCredit`, `bankDeposit`, `bankDebit`, `notes`.

All records have nonempty unique string IDs and valid date-only dates. Date range: 2026-01-02 through 2026-10-15. There are 272 `Income` and 696 `Expense` type labels; those labels are not sufficient accounting classifications. The file has no shop identity, account profiles/opening balances, structured stylist allocations, revision ancestry, or deletion tombstones. Never fill these gaps from HTML defaults or the currently selected shop without explicit mapping and review.

All five monetary fields are present on every record, nonnegative, and representable exactly in cents. Decimal parsing of the original JSON number tokens, without binary floating-point arithmetic, produced:

| Source field | Verified CAD total |
| ------------ | -----------------: |
| income       |         [private financial reference] |
| expense      |         [private financial reference] |
| bankCredit   |         [private financial reference] |
| bankDeposit  |         [private financial reference] |
| bankDebit    |         [private financial reference] |

All match the owner's regression references exactly. This verifies source count, monetary precision, and source-field totals only. It does not verify import/export, profit, balances, or reconciliation.

406 records have more than one nonzero monetary field. Twenty records have all five monetary fields zero: retain them for review. Three extra records share complete content excluding ID with another record; their IDs are distinct. Do not discard them as duplicates merely because content matches. Preserve all 968 identities. Reimport deduplication should use stable source identity and provenance, with ambiguous matches reviewed explicitly.

## HTML application's distinct backup structure

The HTML stores an application state object under localStorage key `bigboss-salon-v2`. Its own JSON backup is `JSON.stringify(S)` and its restore requires `days` and `tx` arrays. This is different from the supplied transaction-envelope JSON; two explicit adapters are required.

Observed HTML state:

- `days`: date-keyed daily entries containing `date`, `total`, `card`, `deposit`, a name-to-amount `sales` object, and `notes`. Days do not have stable explicit IDs.
- `tx`: expense/bank entries with `id`, `date`, `account`, `cat`, optional `sub`, `name`, `details`, and independent `income`, `expense`, `credit`, `deposit`, `debit` fields.
- `staff`: names, including a product-sales pseudo-entry; names are not immutable stylist identities.
- `open`: an initial bank balance; `bal`: separate as-of balance items and a credit-limit setting.
- `adj`: dated stylist adjustments with `id`, `name`, `amt`, and `note`.

Future aliases: `cat` → category, `name` → payee, `credit` → bankCredit, `deposit` → bankDeposit, `debit` → bankDebit. Preserve `account`, `sub`, the original IDs and complete raw source alongside normalization. Retain `days` totals separately from row-derived sales totals if they disagree; the original UI warns that saving a day can replace the saved total.

HTML workbook import reads monthly sheets and a journal. It moves Revenue rows into `days`, while other monetary rows go into `tx`. Journal rows provide stylist/product allocations. Therefore a financial movement may be represented differently across backup variants. Never concatenate two variants and assume that distinct container/record IDs establish distinct business events. The supplied JSON alone cannot reconstruct missing journal allocations reliably.

The HTML normalizes several fee categories and loan descriptions during load/restore. Future adapters must preserve raw labels and explain classifications rather than silently rewriting original fields. The HTML's destructive restore and generated random short IDs are legacy behavior, not designs to copy. It also loads the XLSX library from a CDN; the new application's offline requirement remains unchanged.

## Calculation behavior observed in source

- Daily sales total sums all service/product rows. Card receipts are entered; cash is total minus card. The HTML explicitly allows a negative cash result when card receipts exceed revenue. Surface such discrepancies; do not force reconciliation.
- Commission rate is 50% for service staff and zero for `Sale Product`. The HTML rounds some aggregates with `Math.round(value * 100) / 100`; a future cent implementation must specify rounding granularity and test half-cent cases rather than assuming day-level and period-level rounding are equivalent.
- Commission paid comes from `Contract Labour` transaction expenses matched by name. Outstanding difference is earned minus paid minus adjustments. Positive adjustments count as already settled; negative adjustments reduce settled amounts. An adjustment is not automatically a cash movement or an operating expense.
- Service earning periods split at day 15 (1–15, 16–end). Payments and adjustments use a separate cutoff at day 22 to assign H1/H2; the assigned period end controls inclusion through the selected date. A payment on days 16–22 can therefore belong to the first-half period. Preserve this legacy behavior as an explicit compatibility rule; do not silently replace it with transaction-date filtering.
- The commission table labelled YTD actually includes available days through the cutoff without an explicit start-of-year filter. Record this discrepancy for future reports rather than reproducing an incorrect label silently.
- Dashboard/monthly-report revenue is the sum of `days.total`; expenses are `tx.expense`. The HTML's profit subtracts those expenses, including commission payments. Do not additionally subtract accrued commission expense without deciding and documenting the accounting basis.
- The bank formula is opening balance plus all included daily card receipts and daily deposits, plus transaction credits and deposits, less transaction debits. Its through-date variant filters both collections. Revenue is a different measure: bank receipts must not become additional revenue.
- Operating-line movement applies loan deposits and repayments after its balance snapshot date. HTML initial balances and its fallback credit limit are embedded defaults, not evidence of the supplied JSON's actual account balances. Never seed them automatically.
- Loan principal, internal transfers, credit-card settlement, and owner distributions need separate classification. The presence of `Share Profit`, `Bank Account`, or a source `Expense` label does not prove operating expense. Preserve records and show review warnings when evidence is insufficient.

## Future-stage acceptance requirements

Stage 2 must preserve the source distinctions and historical commission behavior above while implementing configurable new rules. Stage 3 must support both detected formats, preserve source identities/raw values, require explicit legacy shop mapping, and verify all 968 records and the five totals after a real import/export round trip. Conflicting edits, cross-format overlap, missing identity/provenance, tombstones, and atomic recovery still require the planned exchange engine. None of these future features was implemented or certified by this inspection.

## Subsequent implementation

The inspection/handoff statements above record the original reference review. Both legacy adapters, conflict handling, tombstones and atomic recovery were subsequently implemented in Stage 3. Stage 4 verifies the actual original in isolated browser and unit round trips and provides the category audit. See [stage-3.md](stage-3.md), [stage-4.md](stage-4.md) and [legacy-category-audit.md](legacy-category-audit.md) for current behavior.
