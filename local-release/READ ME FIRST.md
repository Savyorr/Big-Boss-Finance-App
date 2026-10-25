# Big Boss Finance — local release

On Windows 10/11, install Node.js 24 LTS once (nodejs.org). Use a current Microsoft Edge or Google Chrome. Extract the entire ZIP into a normal folder; do not launch inside the ZIP.

Double-click **Start Big Boss Finance.cmd**. The application opens in your default browser. Leave the helper window running and minimize it if desired. Close the helper after finishing. Double-click the launcher next time. Daily use needs no npm commands, development server, internet connection, login or paid subscription.

## First use

1. Choose your saved business on the opening screen, or enter a business name and choose Create business profile. Each different business gets a separate profile. Use Switch profile to change businesses.
2. Add stylists and agreed commission rates. Add bank/cash accounts using actual known opening balances and dates; never estimate balances.
3. Enter Daily Sales: each stylist's service revenue, product sales and receipts. Check totals before saving.
4. Enter other Transactions using their correct types. Transfers, loan principal, owner distributions and bank deposits are not ordinary expenses or extra revenue.
5. Check Stylists & Commissions and record payments. Reports expense earned commissions; paying them does not create another expense.

## Backup and restore

In Data Management choose **Create Backup**, then **Download JSON**. Save it outside the application folder, preferably also on a second drive. Back up after each day's changes and before updates/imports. Internal recovery snapshots are not a substitute for downloaded files.

To restore downloaded JSON, select the file, preview changes, inspect conflicts and confirm the intended operation. Replacement additionally requires typing REPLACE: check the affected shop list. For manual exchange with another owner, export/send the file yourself, preview their file and resolve conflicts explicitly. Re-importing the same unchanged file does not duplicate records.

## Keep using the same browser

Records live in this browser profile at http://127.0.0.1:47831. Keep the same default browser and profile. Do not use private/incognito mode or clear this site's data. Another browser/profile has separate storage. An empty workspace there does not mean the original records were deleted. Records are not stored in the extracted release folder.

Existing development data at ports 5173/4173 uses separate storage. Export a full JSON backup from the old app, then import it here and check the restored totals. Preserve old storage until verified. For an update: download a backup, close the helper, extract the newer release and use its launcher with the same browser/profile/address.

Original history appears as provisional recorded figures. Bank debits are not assumed to be expenses. Accounting classification and balances still need supporting evidence before final statements or reconciliation can be relied upon.

## Troubleshooting

The launcher explains missing/old Node. Install/update to Node.js 24 LTS and retry. If another program occupies port 47831, close it and retry; changing ports changes the storage address. If the browser does not open, enter the address above. Keep the helper running. Reload if interrupted; do not clear browser data. Preserve downloaded backups.

The production app and local server are tested on Linux Chromium. The Windows command launcher is prepared but has not been executed on Windows. This is not a native/signed Windows installer. Check first launch, persistence and backup/restore on the intended Windows computer before live use. On macOS/Linux with Node, run `node server.mjs --open` from the extracted folder.

## Everyday shortcuts

Use Switch profile at the top to choose a different business. Its barbers, records, settings and backups stay separate. Existing multi-location backups remain together in their original saved profile, with advanced location controls in Settings. To add an expense, open Transactions → Add Transaction, choose Operating expense, enter the date, amount, category and paying account, then save. To pay a stylist, open Stylists & Commissions → Payment history → Pay Stylist, select the stylist/date/paying account and amount, then save the payment.

In Reports, choose the shop and reporting dates. Review revenue, operating expenses, earned commissions, profit and banking separately. Print / Save as PDF uses your browser. Needs review warnings mean some imported figures are excluded from operating reports.

Offline use: let the application finish loading once with the local helper available. The installed offline cache then opens all eight pages in the same browser/profile. JSON selection, previews and downloads also work without internet. Keep running the local helper for the normal daily launch; its presence does not require internet.


## Existing imports and this update

The opening chooser automatically shows your existing business. Open it to keep using the records already imported; do not clear data or start over. Before installing an update, download a backup and close the old helper. Launch the new version using the same browser/profile and address. Accept the app update banner and reload if offered.

Open your existing Big Boss profile and click **Complete Legacy Migration**. Your saved transactions stay in place. The app restores Steven Hirmiz, Waseem Saleem, Aeden Kajo and Mattew Burns from the original application's configuration and links their historical records. You do not need to create these barbers manually or repeat the financial import.

For a first import, select the original JSON. Leave **Restore the original four barbers** checked, review the destination and confirm. The original service commission default is 50%; product sales earn no barber commission. Existing agreed rates are preserved.

The dashboard and Reports open with **Recorded Revenue**, **Recorded Expenses** and recorded bank movements. These are provisional original figures, with new posted entries included once. Use **Verified accounting entries** for classified bookkeeping. Bank withdrawals are not an expense total. The app does not guess bank balances.

Click **History** beside a barber to see linked historical expenses, bank movements and supported payment evidence. A payment amount and an amount owed are not the same. Some records need settlement review. Historical sales per barber and starting commission balances were not in the supplied transaction file, so the app cannot reconstruct their historical earned/outstanding commission. A full backup from the original browser's daily journal is needed for that.

For new days, enter service revenue beside each barber, product sales and card receipts. Cash and 50% commissions calculate automatically; products have no barber commission. Choose actual receipt accounts. If there are no card receipts, only the cash account is required. Save once and edit that day if you need to correct it.

Use **Export business JSON** for a one-click download of this business. Save it somewhere safe after each day's work. Profiles and backups stay separate between businesses.
