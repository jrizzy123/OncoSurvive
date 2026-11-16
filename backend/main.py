from pathlib import Path
from typing import Literal, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test
from pydantic import BaseModel, Field

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "colorectal_clean.csv"

# Load once at startup. Same exclusions as the notebook:
# known stage, and known cause of death.
df = pd.read_csv(DATA_PATH)
df = df[df["stage_group"].notna() & (df["cause_death"] != "Dead (missing/unknown COD)")]

app = FastAPI(title="OncoSurvive API")

# Lets a web page running on another address (our future frontend) call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MIN_PATIENTS = 30  # don't return curves for tiny groups


class Cohort(BaseModel):
    stage: Optional[Literal["Localized", "Regional", "Distant"]] = None
    age_min: int = Field(0, ge=0, le=85)
    age_max: int = Field(85, ge=0, le=85)
    sex: Optional[Literal["Male", "Female"]] = None


class CompareRequest(BaseModel):
    cohort_a: Cohort
    cohort_b: Cohort


def select(c: Cohort) -> pd.DataFrame:
    """Return the patients matching a cohort's filters."""
    g = df
    if c.stage:
        g = g[g["stage_group"] == c.stage]
    g = g[(g["age"] >= c.age_min) & (g["age"] <= c.age_max)]
    if c.sex:
        g = g[g["Sex"] == c.sex]
    if len(g) < MIN_PATIENTS:
        raise HTTPException(
            status_code=404,
            detail=f"Only {len(g)} patients match these filters (minimum {MIN_PATIENTS}).",
        )
    return g


def summarize(g: pd.DataFrame) -> dict:
    """Fit a Kaplan-Meier curve and return the curve plus key survival numbers."""
    kmf = KaplanMeierFitter().fit(g["surv_months"], g["event_cancer"])
    curve = kmf.survival_function_.reset_index()
    curve.columns = ["month", "survival"]
    return {
        "n": len(g),
        "survival_1yr": round(float(kmf.predict(12)), 3),
        "survival_3yr": round(float(kmf.predict(36)), 3),
        "survival_5yr": round(float(kmf.predict(60)), 3),
        "curve": curve.round(4).to_dict(orient="records"),
    }


@app.get("/survival")
def survival(
    stage: Optional[Literal["Localized", "Regional", "Distant"]] = None,
    age_min: int = Query(0, ge=0, le=85),
    age_max: int = Query(85, ge=0, le=85),
    sex: Optional[Literal["Male", "Female"]] = None,
):
    cohort = Cohort(stage=stage, age_min=age_min, age_max=age_max, sex=sex)
    return summarize(select(cohort))


@app.post("/compare")
def compare(req: CompareRequest):
    a = select(req.cohort_a)
    b = select(req.cohort_b)
    test = logrank_test(
        a["surv_months"], b["surv_months"],
        a["event_cancer"], b["event_cancer"],
    )
    p = float(test.p_value)
    return {
        "cohort_a": summarize(a),
        "cohort_b": summarize(b),
        "logrank_p_value": p,
        "logrank_p_label": "< 0.001" if p < 0.001 else f"{p:.3f}",
    }