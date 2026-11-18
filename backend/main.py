import base64
import io
import os
import urllib.request
from pathlib import Path
from typing import List, Literal, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test, multivariate_logrank_test
from pydantic import BaseModel, Field

# The API reads an aggregate count table (see build_counts.py), not patient rows.
# DATA_PATH overrides the location. If the file is missing and DATA_URL is set,
# it is downloaded once at startup (used on hosts where the file isn't in git).
DATA_PATH = Path(os.environ.get("DATA_PATH", Path(__file__).resolve().parent / "data" / "km_counts.csv.gz"))
DATA_URL = os.environ.get("DATA_URL")

if not DATA_PATH.exists():
    if not DATA_URL:
        raise RuntimeError(
            f"{DATA_PATH} not found. Run `python backend/build_counts.py`, or set DATA_URL."
        )
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(DATA_URL, DATA_PATH)


def load_counts(path: Path) -> pd.DataFrame:
    """Read the count table, either as .csv.gz or as base64 text of that file.

    The base64 form exists for hosts whose secret-file upload only takes pasted
    text (such as Render). gzip files start with bytes 1f 8b; anything else is
    treated as base64.
    """
    raw = path.read_bytes()
    if not raw.startswith(b"\x1f\x8b"):
        raw = base64.b64decode(raw)
    return pd.read_csv(io.BytesIO(raw), compression="gzip")


df = load_counts(DATA_PATH)

app = FastAPI(title="OncoSurvive API")

# Local dev origins, plus any deployed frontend listed in ALLOWED_ORIGINS (comma-separated)
origins = ["http://localhost:3000", "http://localhost:5173"]
origins += [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

MIN_PATIENTS = 30  # don't return results for tiny groups


class Cohort(BaseModel):
    stage: Optional[Literal["Localized", "Regional", "Distant"]] = None
    age_min: int = Field(0, ge=0, le=85)
    age_max: int = Field(85, ge=0, le=85)
    sex: Optional[Literal["Male", "Female"]] = None


class CompareRequest(BaseModel):
    cohort_a: Cohort
    cohort_b: Cohort


class LogrankRequest(BaseModel):
    cohorts: List[Cohort] = Field(min_length=2, max_length=6)


def select(c: Cohort) -> pd.DataFrame:
    """Return the count rows matching a cohort's filters."""
    if c.age_min > c.age_max:
        raise HTTPException(status_code=422, detail="Minimum age is above maximum age.")
    g = df
    if c.stage:
        g = g[g["stage_group"] == c.stage]
    g = g[(g["age"] >= c.age_min) & (g["age"] <= c.age_max)]
    if c.sex:
        g = g[g["Sex"] == c.sex]
    n = int(g["count"].sum())
    if n < MIN_PATIENTS:
        raise HTTPException(
            status_code=404,
            detail=f"Too few patients match these filters to show (minimum {MIN_PATIENTS}).",
        )
    return g


def summarize(g: pd.DataFrame) -> dict:
    """Fit a Kaplan-Meier curve and return the curve plus key survival numbers."""
    kmf = KaplanMeierFitter().fit(g["surv_months"], g["event_cancer"], weights=g["count"])
    curve = kmf.survival_function_.reset_index()
    curve.columns = ["month", "survival"]
    return {
        "n": int(g["count"].sum()),
        "survival_1yr": round(float(kmf.predict(12)), 3),
        "survival_3yr": round(float(kmf.predict(36)), 3),
        "survival_5yr": round(float(kmf.predict(60)), 3),
        "curve": curve.round(4).to_dict(orient="records"),
    }


def overlaps(a: Cohort, b: Cohort) -> bool:
    """True if some patients could belong to both cohorts."""
    stage_ok = a.stage is None or b.stage is None or a.stage == b.stage
    sex_ok = a.sex is None or b.sex is None or a.sex == b.sex
    age_ok = a.age_min <= b.age_max and b.age_min <= a.age_max
    return stage_ok and sex_ok and age_ok


def p_label(p: float) -> str:
    return "< 0.001" if p < 0.001 else f"{p:.3f}"


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
        weights_A=a["count"], weights_B=b["count"],
    )
    p = float(test.p_value)
    return {
        "cohort_a": summarize(a),
        "cohort_b": summarize(b),
        "logrank_p_value": p,
        "logrank_p_label": p_label(p),
    }


@app.post("/logrank")
def logrank(req: LogrankRequest):
    """Log-rank test of whether any of 2-6 survival curves differ.

    The test assumes each patient is in exactly one group, so overlapping
    cohorts get no p-value.
    """
    cs = req.cohorts
    if any(overlaps(cs[i], cs[j]) for i in range(len(cs)) for j in range(i + 1, len(cs))):
        return {"overlapping": True, "p_value": None, "p_label": None}
    parts = [select(c).assign(group=i) for i, c in enumerate(cs)]
    data = pd.concat(parts, ignore_index=True)
    test = multivariate_logrank_test(
        data["surv_months"], data["group"], data["event_cancer"], weights=data["count"]
    )
    p = float(test.p_value)
    return {"overlapping": False, "p_value": p, "p_label": p_label(p)}
