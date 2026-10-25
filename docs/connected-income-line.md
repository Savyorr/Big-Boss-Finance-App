# v1.1.2 — connected daily income line

The owner requested visual continuity across the gaps shown in their September screenshot. The daily chart now draws a dashed connecting line behind the existing solid recorded segments. Dashed spans connect recorded endpoints across missing dates; they do not create day values, fill gaps with zero, extend beyond the last recorded point, or change amounts. The chart explanation explicitly identifies dashed spans as visual continuity only. Missing-day tooltips, selected-day details and data tables still show Missing record.

This is a rendering-only change. Financial aggregation, calendar dates, historical source records, identities, backups and synchronization are unchanged. The previous v1.1.1 checkpoint is commit `e20b4ccbe141deec83f0669f4c43e3b580b8656a`.

Verification: 115 unit/integration checks, 7 production-browser scenarios, production build, ZIP integrity and extracted local-server offline/restart checks. The original September/October fixture regression additionally asserts a single continuous dashed path, the configured dash pattern, unchanged recorded point counts/amounts and missing-day statuses. Actual screenshots remain private in `private/comprehensive-browser/08-chart-2026-09.png` and `08-chart-2026-10.png`.

Updated ZIP: `release/Big-Boss-Finance-Windows-local.zip`, 432404 bytes, SHA-256 `819630d0e4905c30624d56d7de850949d1dc849507aea4800e701f3ab88a81c7`. Windows launcher execution still requires Windows; packaged server/browser verification runs on Linux. Back up before updating, extract the full new ZIP, close the previous helper and reopen using the same browser/profile/address. Finish open forms before accepting Update & reload. The sidebar footer should say v1.1.2.
