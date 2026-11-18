"""Turn the patient-level SEER file into an aggregate count table for the API.

Each output row is a count of patients who share the same stage, sex, age,
follow-up time, and outcome. Kaplan-Meier curves and log-rank tests computed
from these weighted counts are identical to ones computed from the patient
rows, but the file holds no individual records, so it is the only data file
the deployed API needs.

Run from the repo root after the cleaning notebook:
    python backend/build_counts.py
"""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "processed" / "colorectal_clean.csv"
OUT = Path(__file__).resolve().parent / "data" / "km_counts.csv.gz"

cols = ["surv_months", "event_cancer", "age", "Sex", "stage_group", "cause_death"]
df = pd.read_csv(SRC, usecols=cols)

# Same exclusions the API has always used: known stage, known cause of death
df = df[df["stage_group"].notna() & (df["cause_death"] != "Dead (missing/unknown COD)")]

counts = (
    df.groupby(["stage_group", "Sex", "age", "surv_months", "event_cancer"])
    .size()
    .reset_index(name="count")
)

OUT.parent.mkdir(exist_ok=True)
counts.to_csv(OUT, index=False)
print(f"{len(df):,} patients -> {len(counts):,} count rows, written to {OUT}")
