"""Data explorer endpoints for BHARAT dashboard analytics."""

import logging
import math
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.participant import CollectionSite, Participant
from app.models.partner import CanonicalTest, PartnerLabResult
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/data-explorer", tags=["data-explorer"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)

# Clinical parameters extracted from the ODK clinical_data JSONB
CLINICAL_PARAMETERS = [
    {"name": "bp_sbp", "display_name": "Systolic Blood Pressure", "category": "Vitals", "source": "clinical", "unit": "mmHg", "path": ["vitals", "bp_sbp"]},
    {"name": "bp_dbp", "display_name": "Diastolic Blood Pressure", "category": "Vitals", "source": "clinical", "unit": "mmHg", "path": ["vitals", "bp_dbp"]},
    {"name": "pulse", "display_name": "Pulse Rate", "category": "Vitals", "source": "clinical", "unit": "bpm", "path": ["vitals", "pulse"]},
    {"name": "spo2", "display_name": "SpO2", "category": "Vitals", "source": "clinical", "unit": "%", "path": ["vitals", "spo2"]},
    {"name": "temperature", "display_name": "Temperature", "category": "Vitals", "source": "clinical", "unit": "°C", "path": ["vitals", "temperature"]},
    {"name": "height_cm", "display_name": "Height", "category": "Anthropometry", "source": "clinical", "unit": "cm", "path": ["anthropometry", "height_cm"]},
    {"name": "weight_kg", "display_name": "Weight", "category": "Anthropometry", "source": "clinical", "unit": "kg", "path": ["anthropometry", "weight_kg"]},
    {"name": "bmi", "display_name": "BMI", "category": "Anthropometry", "source": "clinical", "unit": "kg/m²", "path": ["anthropometry", "bmi"]},
    {"name": "dass_depression", "display_name": "DASS Depression Score", "category": "Scores", "source": "clinical", "unit": "score", "path": ["scores", "dass_depression"]},
    {"name": "dass_anxiety", "display_name": "DASS Anxiety Score", "category": "Scores", "source": "clinical", "unit": "score", "path": ["scores", "dass_anxiety"]},
    {"name": "dass_stress", "display_name": "DASS Stress Score", "category": "Scores", "source": "clinical", "unit": "score", "path": ["scores", "dass_stress"]},
    {"name": "mmse_total", "display_name": "MMSE Total Score", "category": "Scores", "source": "clinical", "unit": "score", "path": ["scores", "mmse_total"]},
    {"name": "frail_score", "display_name": "FRAIL Score", "category": "Scores", "source": "clinical", "unit": "score", "path": ["scores", "frail_score"]},
    {"name": "who_qol", "display_name": "WHO QoL Score", "category": "Scores", "source": "clinical", "unit": "score", "path": ["scores", "who_qol"]},
]

CLINICAL_PARAM_MAP = {p["name"]: p for p in CLINICAL_PARAMETERS}


# --- Response schemas ---

class ParameterInfo(BaseModel):
    name: str
    display_name: str
    category: str | None = None
    source: str  # "lab" or "clinical"
    unit: str | None = None


class DataPoint(BaseModel):
    value: float
    age_group: int
    sex: str
    site_code: str | None = None
    participant_code: str


class DistributionStats(BaseModel):
    n: int
    mean: float | None = None
    median: float | None = None
    sd: float | None = None
    min: float | None = None
    max: float | None = None
    q1: float | None = None
    q3: float | None = None


class DistributionResponse(BaseModel):
    parameter: str
    unit: str | None = None
    data: list[DataPoint]
    stats: DistributionStats


class CorrelationResponse(BaseModel):
    method: str
    parameters: list[str]
    matrix: list[list[float | None]]
    p_values: list[list[float | None]]
    n_observations: int


class VitalStat(BaseModel):
    mean: float | None = None
    median: float | None = None
    sd: float | None = None
    n: int = 0


class ClinicalSummaryResponse(BaseModel):
    vitals: dict[str, VitalStat]
    anthropometry: dict[str, VitalStat]
    scores: dict[str, VitalStat]
    comorbidities: dict[str, int]


# --- Helper functions ---

def _compute_stats(values: list[float]) -> DistributionStats:
    """Compute descriptive statistics from a list of floats."""
    n = len(values)
    if n == 0:
        return DistributionStats(n=0)

    sorted_vals = sorted(values)
    mean = sum(sorted_vals) / n

    if n == 1:
        return DistributionStats(
            n=n, mean=round(mean, 4), median=round(mean, 4),
            sd=0.0, min=sorted_vals[0], max=sorted_vals[0],
            q1=sorted_vals[0], q3=sorted_vals[0],
        )

    # Variance (sample)
    variance = sum((v - mean) ** 2 for v in sorted_vals) / (n - 1)
    sd = variance ** 0.5

    def percentile(data: list[float], p: float) -> float:
        k = (len(data) - 1) * p
        f = int(k)
        c = f + 1 if f + 1 < len(data) else f
        return data[f] + (k - f) * (data[c] - data[f])

    return DistributionStats(
        n=n,
        mean=round(mean, 4),
        median=round(percentile(sorted_vals, 0.5), 4),
        sd=round(sd, 4),
        min=round(sorted_vals[0], 4),
        max=round(sorted_vals[-1], 4),
        q1=round(percentile(sorted_vals, 0.25), 4),
        q3=round(percentile(sorted_vals, 0.75), 4),
    )


def _safe_float(val) -> float | None:
    """Try to parse a value as float, return None on failure."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isfinite(f):
            return f
        return None
    except (ValueError, TypeError):
        return None


def _rank_data(values: list[float]) -> list[float]:
    """Assign ranks to values, handling ties with average rank."""
    n = len(values)
    indexed = sorted(enumerate(values), key=lambda x: x[1])
    ranks = [0.0] * n

    i = 0
    while i < n:
        j = i
        while j < n - 1 and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1

    return ranks


def _pearson_corr(x: list[float], y: list[float]) -> tuple[float | None, float | None]:
    """Compute Pearson correlation coefficient and approximate p-value."""
    n = len(x)
    if n < 3:
        return (None, None)

    mx = sum(x) / n
    my = sum(y) / n
    sxy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    sxx = sum((xi - mx) ** 2 for xi in x)
    syy = sum((yi - my) ** 2 for yi in y)

    denom = (sxx * syy) ** 0.5
    if denom == 0:
        return (None, None)

    r = sxy / denom
    r = max(-1.0, min(1.0, r))

    # Approximate p-value using t-distribution approximation
    t_stat = r * ((n - 2) / (1 - r * r + 1e-15)) ** 0.5
    # Simple two-tailed p-value approximation
    p_val = _t_to_p(abs(t_stat), n - 2)

    return (round(r, 6), round(p_val, 6))


def _spearman_corr(x: list[float], y: list[float]) -> tuple[float | None, float | None]:
    """Compute Spearman rank correlation."""
    rx = _rank_data(x)
    ry = _rank_data(y)
    return _pearson_corr(rx, ry)


def _t_to_p(t: float, df: int) -> float:
    """Rough two-tailed p-value approximation for t-distribution."""
    if df <= 0:
        return 1.0
    # Use normal approximation for large df
    import math as m
    x = df / (df + t * t)
    if x >= 1.0:
        return 1.0
    # Regularized incomplete beta function approximation
    # For a rough approximation, use the normal CDF for large df
    if df > 30:
        z = t * (1 - 1 / (4 * df)) / (1 + t * t / (2 * df)) ** 0.5
        p = 2 * (1 - _normal_cdf(abs(z)))
        return max(0.0, min(1.0, p))
    # For small df, use a cruder approximation
    z = t / (1 + t * t / df) ** 0.5
    p = 2 * (1 - _normal_cdf(abs(z) * (1 - 0.75 / df)))
    return max(0.0, min(1.0, p))


def _normal_cdf(x: float) -> float:
    """Approximate standard normal CDF."""
    import math as m
    return 0.5 * (1 + m.erf(x / (2 ** 0.5)))


# --- Endpoints ---

@router.get("/parameters", response_model=dict)
async def get_parameters(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Return list of available parameters: lab tests + clinical measurements."""
    # Lab test parameters from canonical_test table
    result = await db.execute(
        select(CanonicalTest)
        .where(CanonicalTest.is_active == True)  # noqa: E712
        .order_by(CanonicalTest.category, CanonicalTest.display_name)
    )
    tests = result.scalars().all()

    parameters: list[dict] = []

    # Add clinical parameters first
    for cp in CLINICAL_PARAMETERS:
        parameters.append({
            "name": cp["name"],
            "display_name": cp["display_name"],
            "category": cp["category"],
            "source": "clinical",
            "unit": cp["unit"],
        })

    # Add lab test parameters
    for t in tests:
        parameters.append({
            "name": t.canonical_name,
            "display_name": t.display_name or t.canonical_name,
            "category": t.category,
            "source": "lab",
            "unit": t.standard_unit,
        })

    return {"success": True, "data": parameters}


@router.get("/distribution", response_model=dict)
async def get_distribution(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    parameter: str = Query(..., min_length=1, description="Parameter name"),
    age_group: str | None = Query(None, description="Comma-separated age groups (1-5)"),
    sex: str | None = Query(None, description="Comma-separated sex codes (M,F or A,B)"),
    site: str | None = Query(None, max_length=20, description="Collection site code"),
):
    """Return data points for distribution charts with descriptive statistics."""
    # Parse filter values
    age_groups: list[int] | None = None
    if age_group:
        try:
            age_groups = [int(x.strip()) for x in age_group.split(",")]
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid age_group values.")

    # Map sex codes A/B to enum values M/F
    sex_map = {"A": "M", "B": "F"}
    sex_reverse = {"M": "A", "F": "B"}
    sex_values: list[str] | None = None
    if sex:
        raw_sex = [x.strip().upper() for x in sex.split(",")]
        sex_values = [sex_map.get(s, s) for s in raw_sex]

    is_clinical = parameter in CLINICAL_PARAM_MAP
    unit: str | None = None

    data_points: list[DataPoint] = []

    if is_clinical:
        cp = CLINICAL_PARAM_MAP[parameter]
        unit = cp["unit"]
        path = cp["path"]

        # Build query: extract JSONB value from clinical_data
        json_expr = Participant.clinical_data
        for key in path:
            json_expr = json_expr[key]

        query = (
            select(
                json_expr.as_string().label("value_str"),
                Participant.age_group,
                Participant.sex,
                Participant.participant_code,
                CollectionSite.code.label("site_code"),
            )
            .join(CollectionSite, Participant.collection_site_id == CollectionSite.id)
            .where(
                Participant.is_deleted == False,  # noqa: E712
                Participant.clinical_data.isnot(None),
                json_expr.isnot(None),
            )
        )

        if age_groups:
            query = query.where(Participant.age_group.in_(age_groups))
        if sex_values:
            query = query.where(Participant.sex.in_(sex_values))
        if site:
            query = query.where(CollectionSite.code == site)

        result = await db.execute(query)
        rows = result.all()

        values_for_stats = []
        for row in rows:
            val = _safe_float(row.value_str)
            if val is not None:
                dp = DataPoint(
                    value=val,
                    age_group=row.age_group.value if hasattr(row.age_group, 'value') else int(row.age_group),
                    sex=sex_reverse.get(row.sex.value if hasattr(row.sex, 'value') else row.sex, row.sex),
                    site_code=row.site_code,
                    participant_code=row.participant_code,
                )
                data_points.append(dp)
                values_for_stats.append(val)

    else:
        # Lab test parameter - query from partner_lab_result via canonical_test
        ct_result = await db.execute(
            select(CanonicalTest).where(
                CanonicalTest.canonical_name == parameter,
                CanonicalTest.is_active == True,  # noqa: E712
            )
        )
        canonical_test = ct_result.scalar_one_or_none()
        if canonical_test is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Parameter '{parameter}' not found.")

        unit = canonical_test.standard_unit

        query = (
            select(
                PartnerLabResult.test_value,
                Participant.age_group,
                Participant.sex,
                Participant.participant_code,
                CollectionSite.code.label("site_code"),
            )
            .join(Participant, PartnerLabResult.participant_id == Participant.id)
            .join(CollectionSite, Participant.collection_site_id == CollectionSite.id)
            .where(
                PartnerLabResult.canonical_test_id == canonical_test.id,
                PartnerLabResult.test_value.isnot(None),
                Participant.is_deleted == False,  # noqa: E712
            )
        )

        if age_groups:
            query = query.where(Participant.age_group.in_(age_groups))
        if sex_values:
            query = query.where(Participant.sex.in_(sex_values))
        if site:
            query = query.where(CollectionSite.code == site)

        result = await db.execute(query)
        rows = result.all()

        values_for_stats = []
        for row in rows:
            val = _safe_float(row.test_value)
            if val is not None:
                dp = DataPoint(
                    value=val,
                    age_group=row.age_group.value if hasattr(row.age_group, 'value') else int(row.age_group),
                    sex=sex_reverse.get(row.sex.value if hasattr(row.sex, 'value') else row.sex, row.sex),
                    site_code=row.site_code,
                    participant_code=row.participant_code,
                )
                data_points.append(dp)
                values_for_stats.append(val)

    stats = _compute_stats(values_for_stats)

    return {
        "success": True,
        "data": {
            "parameter": parameter,
            "unit": unit,
            "data": [dp.model_dump() for dp in data_points],
            "stats": stats.model_dump(),
        },
    }


@router.get("/correlation", response_model=dict)
async def get_correlation(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    parameters: str = Query(..., description="Comma-separated parameter names"),
    method: str = Query("spearman", pattern="^(pearson|spearman)$"),
):
    """Return correlation matrix between selected parameters."""
    param_names = [p.strip() for p in parameters.split(",") if p.strip()]
    if len(param_names) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "At least 2 parameters required.")
    if len(param_names) > 10:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Maximum 10 parameters allowed.")

    # Collect data per participant for each parameter
    # participant_code -> {param_name: value}
    participant_data: dict[str, dict[str, float]] = {}

    for param in param_names:
        if param in CLINICAL_PARAM_MAP:
            cp = CLINICAL_PARAM_MAP[param]
            path = cp["path"]
            json_expr = Participant.clinical_data
            for key in path:
                json_expr = json_expr[key]

            query = (
                select(
                    Participant.participant_code,
                    json_expr.as_string().label("value_str"),
                )
                .where(
                    Participant.is_deleted == False,  # noqa: E712
                    Participant.clinical_data.isnot(None),
                    json_expr.isnot(None),
                )
            )
            result = await db.execute(query)
            for row in result.all():
                val = _safe_float(row.value_str)
                if val is not None:
                    participant_data.setdefault(row.participant_code, {})[param] = val
        else:
            # Lab parameter
            ct_result = await db.execute(
                select(CanonicalTest.id).where(
                    CanonicalTest.canonical_name == param,
                    CanonicalTest.is_active == True,  # noqa: E712
                )
            )
            ct_id = ct_result.scalar_one_or_none()
            if ct_id is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Parameter '{param}' not found.")

            query = (
                select(
                    Participant.participant_code,
                    PartnerLabResult.test_value,
                )
                .join(Participant, PartnerLabResult.participant_id == Participant.id)
                .where(
                    PartnerLabResult.canonical_test_id == ct_id,
                    PartnerLabResult.test_value.isnot(None),
                    Participant.is_deleted == False,  # noqa: E712
                )
            )
            result = await db.execute(query)
            for row in result.all():
                val = _safe_float(row.test_value)
                if val is not None:
                    participant_data.setdefault(row.participant_code, {})[param] = val

    # Build paired data for correlation
    n_params = len(param_names)
    matrix: list[list[float | None]] = [[None] * n_params for _ in range(n_params)]
    p_values: list[list[float | None]] = [[None] * n_params for _ in range(n_params)]

    corr_fn = _spearman_corr if method == "spearman" else _pearson_corr

    # n_observations = participants that have ALL selected parameters
    all_params_set = set(param_names)
    n_observations = sum(
        1 for pdata in participant_data.values()
        if all_params_set <= set(pdata.keys())
    )

    for i in range(n_params):
        matrix[i][i] = 1.0
        p_values[i][i] = 0.0
        for j in range(i + 1, n_params):
            # Get participants that have both values
            paired_x = []
            paired_y = []
            for pcode, pdata in participant_data.items():
                if param_names[i] in pdata and param_names[j] in pdata:
                    paired_x.append(pdata[param_names[i]])
                    paired_y.append(pdata[param_names[j]])

            r, p = corr_fn(paired_x, paired_y)
            matrix[i][j] = r
            matrix[j][i] = r
            p_values[i][j] = p
            p_values[j][i] = p

    return {
        "success": True,
        "data": {
            "method": method,
            "parameters": param_names,
            "matrix": matrix,
            "p_values": p_values,
            "n_observations": n_observations,
        },
    }


@router.get("/clinical-summary", response_model=dict)
async def get_clinical_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Return aggregated clinical metadata from ODK data."""
    # Fetch all participants with clinical data
    result = await db.execute(
        select(Participant.clinical_data)
        .where(
            Participant.is_deleted == False,  # noqa: E712
            Participant.clinical_data.isnot(None),
        )
    )
    rows = result.scalars().all()
    n_with_clinical = len(rows)

    # Accumulate values per category
    vitals_data: dict[str, list[float]] = {
        "bp_sbp": [], "bp_dbp": [], "pulse": [], "spo2": [], "temperature": [],
    }
    anthropometry_data: dict[str, list[float]] = {
        "height_cm": [], "weight_kg": [], "bmi": [],
    }
    scores_data: dict[str, list[float]] = {
        "dass_depression": [], "dass_anxiety": [], "dass_stress": [],
        "mmse_total": [], "frail_score": [], "who_qol": [],
    }
    comorbidities: dict[str, int] = {}

    for clinical_data in rows:
        if not isinstance(clinical_data, dict):
            continue

        # Vitals
        vitals = clinical_data.get("vitals", {})
        if isinstance(vitals, dict):
            for key in vitals_data:
                if key in ("bp_sbp", "bp_dbp", "pulse", "spo2", "temperature"):
                    val = _safe_float(vitals.get(key))
                    if val is not None:
                        vitals_data[key].append(val)

        # Anthropometry
        anthro = clinical_data.get("anthropometry", {})
        if isinstance(anthro, dict):
            for key in anthropometry_data:
                val = _safe_float(anthro.get(key))
                if val is not None:
                    anthropometry_data[key].append(val)

        # Scores
        scores = clinical_data.get("scores", {})
        if isinstance(scores, dict):
            for key in scores_data:
                val = _safe_float(scores.get(key))
                if val is not None:
                    scores_data[key].append(val)

        # Comorbidities - count True values
        comorb = clinical_data.get("comorbidities", {})
        if isinstance(comorb, dict):
            for key, val in comorb.items():
                if val is True or val == 1 or val == "yes":
                    comorbidities[key] = comorbidities.get(key, 0) + 1

    def to_stat(values: list[float]) -> dict:
        stats = _compute_stats(values)
        return {"mean": stats.mean, "median": stats.median, "sd": stats.sd, "n": stats.n}

    return {
        "success": True,
        "data": {
            "n_with_clinical": n_with_clinical,
            "vitals": {k: to_stat(v) for k, v in vitals_data.items()},
            "anthropometry": {k: to_stat(v) for k, v in anthropometry_data.items()},
            "scores": {k: to_stat(v) for k, v in scores_data.items()},
            "comorbidities": comorbidities,
        },
    }
