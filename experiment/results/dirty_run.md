1. **42 unique deals** (44 rows total, but D-1004 and D-1011 are exact duplicate rows — same deal_id, same data — so 42 distinct deal_ids).

2. **$1,800,000** total pipeline value. Caveat: sums only the 34 deals with a numeric amount_usd; 8 deals have non-numeric values ("unknown" or "TBD") that couldn't be summed (D-1010, D-1011, D-1015, D-1021, D-1030, D-1033, D-1036, D-1039).

3. **1900-01-01** is the literal earliest value, but it appears 7 times and looks like a placeholder/null date rather than a real one; excluding those, the earliest genuine close_date is **2025-01-01** (D-1040).

4. **3 deals** in APAC (D-1019, D-1022, D-1026). Caveat: region values are inconsistently cased ("apac" and "Apac"), so this required a case-insensitive match.

5. **6 deals** for Globex (D-1003, D-1005, D-1020, D-1021, D-1025, D-1036). Caveat: account name casing varies ("GLOBEX" vs "Globex"), so this also required case-insensitive matching.
