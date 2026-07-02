1. **44 rows total, 42 unique deals** — D-1004 and D-1011 each appear twice as exact duplicate rows, so unique deal count is 42.

2. **$1,800,000** — sum of amount_usd across unique deals, excluding 8 deals with non-numeric amounts ("unknown" or "TBD": D-1010, D-1011, D-1015, D-1021, D-1030, D-1033, D-1036, D-1039) and counting the duplicated D-1004 only once.

3. **2025-01-01** (D-1040) — many rows show "1900-01-01," which looks like a placeholder/null sentinel rather than a real date; if those were treated as literal dates, the "earliest" would instead be 1900-01-01.

4. **3 deals** — D-1019, D-1022, D-1026, treating "apac" and "Apac" as the same region value as "APAC" (no rows use the exact string "APAC").

5. **6 deals** — D-1003, D-1005, D-1020, D-1021, D-1025, D-1036, treating "GLOBEX" and "Globex" as the same account.
