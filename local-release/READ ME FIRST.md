# Big Boss Finance — owner guide

## Open the program

Install Node.js 24 LTS once. Extract the complete Windows ZIP. Double-click **Start Big Boss Finance.cmd**, and leave the helper window running. The program opens at `http://127.0.0.1:47831`. Keep using the same browser and browser profile. No internet is needed for daily work.

## Your businesses

The opening screen lists separate businesses. Enter a name and Create Business. `Big Boss`, `Big Boss Hair Salon` and their Ltd. variants include the original four barbers automatically. You can also check the original Big Boss option when using another name. All other businesses start empty.

Switch Business returns to the chooser; opening a business returns to its dashboard. Rename it in Settings. Removing a business requires downloading a backup and typing its exact name. Removing one does not remove the others.

## Restore the original records

Open Big Boss, then Data & Backup → Import JSON. Select `Big_Boss_Finance_Backup_2026-10-23.json`, inspect the preview and click Confirm Import. All 968 original transactions are retained, including zeros. The four barbers restore at 50%; Sale Product is not staff. Open the five recorded totals disclosure to compare the file.

The dashboard opens on the current calendar month. Previous Month, Next Month and the month selector update all four sections together. The daily graph distinguishes gaps from confirmed zero days; choose a day for exact CAD values. The daily chart fits the full month on small screens. Swipe the historical chart horizontally or open its data table. Reports lets you select another month. Historical income/expense fields count without setting up accounts. Profit is revenue less recorded expenses; Contract Labour is not deducted again as earned commission.

The historical JSON does not contain individual daily barber sales or original opening balances. Those remain unavailable rather than being guessed. Historical Contract Labour expenses appear in the appropriate barber payment history. They are recorded payments under the original app's rule, not proof of a complete settlement.

An original full backup copied from the HTML application's Show backup text can be pasted into Advanced migration utilities → Restore original backup text, or saved as JSON and selected with Import JSON. Its daily sales, staff, adjustments and balances are supported. Original Excel monthly sheets and Journal are supported under Advanced migration utilities → Import original Excel workbook. As in the original, this replaces saved days and the ledger; barber configuration, adjustments and statement balances are retained. A recovery backup is saved first, and you must type REPLACE before confirmation. Use the complete updated workbook. Set an actual opening balance in Settings and check Opening balance is known when the file does not provide one.

## Enter and correct a day

Daily Sales: choose the date, enter each barber's service revenue and Sale Product, then enter debit/card receipts. Total, commission and cash calculate automatically. Product earns no commission. The original app permits card receipts higher than sales, giving negative calculated cash; this behavior is retained. Add notes and Save day.

Choose a saved date or Edit beside a recent day to correct it. Saving recalculates its total from the rows. Existing sales deposits and historical commission rates stay with that day. Editing the date will not overwrite another saved day. Deleting a day asks for confirmation and retains its deletion for file exchange.

For an imported revenue date, Daily Sales shows the existing income and receipts, your entered breakdown, and any difference. Confirm the relationship before saving. The default links the breakdown to the existing sale: original source amounts remain unchanged, and neither revenue nor bank receipts count twice. Choose a corrected daily summary only deliberately; choose both only for genuinely separate sales. Changed source records require review. Tips are optional explicitly recorded information; card excess is never automatically treated as tips or revenue.

## Expenses and bank

Add expense or transfer. Select Expense, Transfer or Income, a date, category, payee/details and amount. An expense may be paid from bank or cash/Visa. Transfers move money without creating expenses; Loan Credit is into Chequing and Loan Payment is out. Professional Fee and Bank Fees retain the original sub-accounts.

Search all transactions or filter by month. Edit keeps original ID, notes, unused monetary fields and original source snapshot. When an imported bank debit differs from its expense, Keep original bank amount preserves it. Original recorded amounts can be corrected explicitly in the disclosure. Delete asks for confirmation.

Bank balances are in Show bank balances and Settings, not on the dashboard. Chequing follows the original opening-plus-receipts-minus-withdrawals rule. Operating Line changes after its statement date using Loan Credit/Loan Payment. Other statement balances remain as entered until edited.

## Commissions

Summary shows service revenue, earned commission, Contract Labour paid, adjustments and difference. Positive difference means still owed; negative means recorded payments/adjustments exceed earned commission. A transaction-only historical import cannot establish the historical difference.

Service earning periods are the 1st–15th and 16th–end. Payment and adjustment dates through the 22nd belong to the first period, matching the original. The Through date includes payments and adjustments whose associated period end has been reached. Use latest payment period follows the original shortcut.

Add stylist payment creates a Contract Labour expense. Payments lets you edit earlier entries. Adjustments supports positive settled amounts and negative corrections. By pay period → View periods and corrections provides Fix with adjustment when earnings are known. Barbers lets you add, rename, set a rate or deactivate a barber without removing history. Rate changes have an effective date and retain their history. New historical entries use the rate effective on that date; already saved days retain their frozen rates.

## Share JSON with another owner

Export Full Backup downloads the whole selected business. Send the file yourself. The other owner creates an empty profile and imports it on first use. After both owners edit their copies, exchange exports and confirm merges. New IDs are combined; repeated files do not duplicate records. Independent edits to one record are shown side by side; choose the intended version. No timestamp decides for you. Deleted records stay deleted when older files arrive.

Files identifying another business are blocked in an existing nonempty profile. Create a separate empty profile to restore them. Export Full Backup downloads the complete business. The v2 file includes all staff (including inactive staff), rate history, days, explicit tips/deposits/source links, transactions, adjustments, settings/balances/theme, raw source documents, synchronization identities/revisions/deletions, and recovery history. Recovery snapshots share repeated content inside the file to save space; no financial history is discarded. Prior v1 faithful backups and both original formats still import. Downloads above the supported 25 MB limit fail visibly rather than truncate. Recovery backups are created locally before imports/replacement; download them or Preview restore when needed. Replacement requires typing REPLACE and is intended for a complete backup.

## Existing previous-version data

The previous v0.6 databases are preserved and not automatically converted. Keep the prior program and a downloaded backup. This clean recreation imports the original JSON, original HTML backups and its own new exports. Do not delete prior storage while it contains entries you still need. The preceding version remains on GitHub main; this replacement is on faithful-recreation.

## Offline, updates and limitations

Load the app once with its local helper running. Its app code, fonts/icons and Excel reader are bundled and cached for offline use. Keep downloaded backups outside the browser; browser storage and local recovery snapshots can be cleared together.

For updates, download a backup, close the helper, extract the newer release and launch it using the same browser/profile/address. Accept Update & reload only after finishing open forms. The extracted server is checked on Linux Chromium here; Windows launcher execution needs a Windows computer. This is a local browser application with a double-click helper, not a signed native installer.

To restore a complete downloaded JSON file, use Restore Full Backup, review the changes, type REPLACE, and confirm. A recovery copy is saved first. Use Import JSON for merging files or importing original JSON records.
