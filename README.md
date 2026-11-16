# OncoSurvive

An interactive tool for exploring how cancer survival differs by stage, age, sex, and race, built on real U.S. cancer registry data.

> **Status:** Early development. The data pipeline and first survival analysis are complete and validated. The web dashboard is not built yet.

---

## The idea

When someone is diagnosed with cancer, one of the first questions is "what are the odds?" The honest answer depends on many things: how far the cancer has spread, the patient's age, and more. Public statistics exist, but they are hard for non-experts to explore and interpret.

OncoSurvive lets a user pick a group of patients (for example, "colon cancer, regional stage, diagnosed under age 50") and see how many of them were still alive over the following months and years, compared side by side with another group. It also explains how to read the charts, since survival curves are widely misunderstood.

**This is an educational project. It is not a clinical tool and must not be used to make medical decisions.**

---

## Key concepts

**Survival curve (Kaplan-Meier).** A line showing the share of patients still alive at each point in time after diagnosis. It starts at 100% and steps downward as patients die.

**Censoring.** Not every patient has been followed to the end of their life. Someone alive at the end of the study period is *censored*: we only know they survived at least that long. Kaplan-Meier handles these patients correctly instead of throwing them away or counting them as survivors forever.

**Cancer-specific vs. overall survival.**
- *Overall survival* counts a death from any cause.
- *Cancer-specific survival* counts only deaths from this cancer; deaths from other causes are treated as censored. This project uses cancer-specific survival by default, because it isolates the effect of the disease.

**Summary stage.** SEER's simple measure of how far a cancer has spread:
- *Localized:* confined to the organ where it began
- *Regional:* spread to nearby tissue and/or lymph nodes
- *Distant:* spread to far-away organs (metastatic)

**Log-rank test.** A statistical test for whether two survival curves differ by more than chance would explain. It powers the cohort comparison feature.

---

## Data

- **Source:** SEER Research Data, 17 Registries, November 2025 submission (diagnoses 2000-2023), from the U.S. National Cancer Institute.
- **Access:** Free, via the SEER Data Use Agreement. Retrieved with SEER\*Stat.
- **Cohort used so far:** Colon and rectum cancer, malignant, diagnosed 2004-2020, first primary cancer only, with valid survival time and excluding autopsy-only and death-certificate-only cases. This is 472,104 patients.
- **Why 2004-2020:** Summary stage is coded consistently from 2004, and diagnoses after 2020 have too little follow-up for 5-year survival.

**The data is not included in this repository.** The SEER Data Use Agreement does not allow redistributing patient-level records. To reproduce this work, request your own free access at https://seer.cancer.gov/data/access.html. The `data/` folder and all CSV files are excluded through `.gitignore`.

---

## Methodology

1. **Select and export** the cohort from SEER\*Stat as a case listing (one row per patient).
2. **Clean** in pandas:
   - Convert survival months and age from text to numbers
   - Create an event flag for death from any cause and for death from this cancer
   - Collapse the three "Regional" stage codes into one group
   - Exclude patients with unknown stage (about 20,000) from stage comparisons
   - Exclude patients with unknown cause of death (about 4,300) from cancer-specific analyses
3. **Estimate survival** with the Kaplan-Meier estimator (`lifelines`).
4. **Validate** the output against published SEER statistics before building anything on top of it.
5. **Compare cohorts** with the log-rank test.

---

## Results so far

Five-year cancer-specific survival, colon and rectum, diagnosed 2004-2020:

| Stage | 5-year survival | Published SEER (approx.) |
|---|---|---|
| Localized | 90.5% | ~90% |
| Regional | 72.1% | ~70-75% |
| Distant | 15.5% | ~10-15% |

The estimates match published figures, which confirms the pipeline is working. Both published and computed values are approximate: SEER's official numbers use slightly different cohorts and methods.

---

## Roadmap

- [x] Obtain SEER access and export colorectal cohort
- [x] Clean data and define survival events
- [x] Kaplan-Meier curves by stage, validated against published values
- [ ] Cohort comparison (for example, under 50 vs. 70+) with log-rank test
- [ ] Add breast and lung cancer
- [ ] Backend API (FastAPI) serving survival curves for any filter combination
- [ ] Frontend dashboard (React) with filters and side-by-side comparison
- [ ] "How to read a survival curve" explainer panel
- [ ] Deployment
- [ ] Stretch: treatment variables, county-level income/rurality, PubMed-linked research explorer

---

## Limitations

- **Observational registry data.** Differences between groups do not show that one factor *causes* a better or worse outcome. Stage, age, treatment, and access to care are all tangled together.
- **No adjustment for confounders yet.** Curves compare groups as they are, not like-for-like.
- **Treatment data in SEER is incomplete,** so any treatment analysis must be interpreted cautiously (see SEER's Treatment Data Limitations).
- **Stage definitions change over time.** Summary stage was chosen for consistency, but it is coarser than clinical TNM staging.
- **Recent diagnoses have short follow-up,** so late-year cohorts contribute little to long-term survival.
- **Population averages do not predict an individual's outcome.**

---

## Tech stack

| Layer | Tools |
|---|---|
| Data retrieval | SEER\*Stat |
| Analysis | Python, pandas, lifelines, matplotlib, Jupyter |
| Backend (planned) | FastAPI |
| Frontend (planned) | React, Recharts |
| Deployment (planned) | Vercel, Render |

---

## Project structure

```
oncosurvive/
  data/raw/            SEER export (not tracked in git)
  data/processed/      cleaned data (not tracked in git)
  notebooks/
    01_load_and_clean.ipynb
    02_survival_analysis.ipynb   (planned)
  .gitignore
  README.md
```

## Reproducing the analysis

1. Request SEER Research Data access and install SEER\*Stat (Windows).
2. Export the cohort described above to `data/raw/seer_raw.csv`.
3. Create a virtual environment and install dependencies:
   ```
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install pandas numpy matplotlib lifelines jupyter ipykernel
   ```
4. Run `notebooks/01_load_and_clean.ipynb` top to bottom.

---

## Acknowledgments and citation

Data: Surveillance, Epidemiology, and End Results (SEER) Program, National Cancer Institute. Check SEER's current citation requirements before publishing results.

## Disclaimer

For education and portfolio purposes only. Nothing here is medical advice.
