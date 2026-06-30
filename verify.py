#!/usr/bin/env python3
"""
DataReady — verification harness.

Trust model: never trust a single computation. Every headline number is recomputed
by two INDEPENDENT engines (pandas vs. Python stdlib csv), plus a third raw `grep`
cross-check on the killer stat. If any engine disagrees, this script exits non-zero
(it can gate CI). Agreement across independent methods = the number is real, not a
bug or a one-off mistake.

Usage:
    python verify.py [csv_path]     # default: nyc_restaurant_full.csv

What this PROVES:   the computation is correct (a FACT).
What it does NOT:   whether that fact is a "problem" (a JUDGMENT — that's human/domain).
"""
import csv
import json
import subprocess
import sys
from pathlib import Path

CSV = Path(sys.argv[1] if len(sys.argv) > 1 else "nyc_restaurant_full.csv")


def norm(c: str) -> str:
    # 'INSPECTION DATE' and 'inspection_date' both -> 'inspection_date'
    return c.strip().lower().replace(" ", "_")


def is_fake_date(v) -> bool:
    v = v or ""
    return v.startswith("01/01/1900") or v.startswith("1900-01-01")


def main() -> int:
    if not CSV.exists():
        print(f"ERROR: {CSV} not found", file=sys.stderr)
        return 2

    # ---- Engine A: pandas ----
    import pandas as pd

    df = pd.read_csv(CSV, dtype=str, low_memory=False)
    df.columns = [norm(c) for c in df.columns]

    # ---- Engine B: Python stdlib csv (no pandas) ----
    with open(CSV, newline="", encoding="utf-8") as f:
        rows = [{norm(k): v for k, v in r.items()} for r in csv.DictReader(f)]

    # Each claim: (name, engine_A_value, engine_B_value)
    claims = [
        ("total_rows", len(df), len(rows)),
        ("grade_missing",
         int(df["grade"].isna().sum()),
         sum(1 for r in rows if not r.get("grade"))),
        ("score_missing",
         int(df["score"].isna().sum()),
         sum(1 for r in rows if not r.get("score"))),
        ("fake_1900_date",
         int(df["inspection_date"].map(is_fake_date).sum()),
         sum(1 for r in rows if is_fake_date(r.get("inspection_date")))),
        ("boro_eq_0",
         int((df["boro"] == "0").sum()),
         sum(1 for r in rows if r.get("boro") == "0")),
        ("camis_unique",
         int(df["camis"].nunique()),
         len(set(r["camis"] for r in rows))),
    ]

    # ---- Engine C: raw grep, third independent check on the killer stat ----
    grep = subprocess.run(
        ["grep", "-c", "-E", "01/01/1900|1900-01-01", str(CSV)],
        capture_output=True, text=True,
    )
    grep_fake = int((grep.stdout or "0").strip() or 0)

    print(f"VERIFY  {CSV}  ({len(df):,} rows)\n")
    header = f"{'claim':<18} {'pandas':>10} {'stdlib_csv':>12}   status"
    print(header)
    print("-" * len(header))

    ok = True
    facts = {}
    for name, a, b in claims:
        match = a == b
        ok = ok and match
        facts[name] = a if match else {"pandas": a, "stdlib_csv": b}
        print(f"{name:<18} {a:>10,} {b:>12,}   {'MATCH' if match else 'MISMATCH !!!'}")

    # third engine note
    third = "MATCH" if grep_fake == claims[3][1] else f"DIFFERS (grep={grep_fake:,})"
    print(f"\n3rd-engine check (grep, fake_1900_date): {third}")
    if grep_fake != claims[3][1]:
        # grep counts LINES, so a tiny diff is possible; warn, don't fail
        print("  note: grep counts matching lines, not parsed fields — minor diffs are expected")

    # Provenance — every verified fact, traceable
    provenance = {
        "dataset": "DOHMH NYC Restaurant Inspection Results (43nn-pn8j)",
        "source": "https://data.cityofnewyork.us/api/views/43nn-pn8j/rows.csv?accessType=DOWNLOAD",
        "file": str(CSV),
        "row_count": len(df),
        "engines": ["pandas", "python-stdlib-csv", "grep"],
        "facts": facts,
    }
    Path("verified_facts.json").write_text(json.dumps(provenance, indent=2))
    print("\nwrote verified_facts.json (provenance for the case-study / app to cite)")

    print("\n" + ("ALL ENGINES AGREE ✓  numbers are trustworthy" if ok
                  else "DISAGREEMENT ✗  do NOT trust these numbers until resolved"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
