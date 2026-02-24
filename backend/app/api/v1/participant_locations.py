"""Participant location endpoints for map visualization."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.participant import CollectionSite, Participant
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/participant-locations", tags=["participant-locations"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)

# Indian PIN code → approximate lat/lng mapping for Karnataka region
# These are approximate centroid coordinates for each PIN code area
PIN_CODE_COORDS: dict[str, tuple[float, float]] = {
    # Bengaluru Urban
    "560001": (12.9716, 77.5946),
    "560002": (12.9578, 77.5710),
    "560003": (12.9850, 77.6050),
    "560004": (12.9900, 77.5700),
    "560005": (12.9800, 77.5800),
    "560006": (13.0100, 77.5650),
    "560007": (12.9639, 77.6280),  # Agram / Command Hospital area
    "560008": (12.9550, 77.6000),
    "560009": (12.9700, 77.6100),
    "560010": (12.9600, 77.6200),
    "560011": (12.9850, 77.6050),
    "560018": (13.0050, 77.5550),
    "560024": (13.0467, 77.5880),  # Hebbal / Baptist Hospital area
    "560032": (12.9350, 77.6150),
    "560034": (12.9300, 77.6200),
    "560038": (12.9200, 77.5900),
    "560040": (12.9400, 77.5800),
    "560041": (12.9750, 77.5400),
    "560045": (12.9150, 77.6000),
    "560047": (12.9050, 77.5850),
    "560050": (13.0200, 77.6400),
    "560054": (13.0282, 77.5699),  # MSRIT / Ramaiah area
    "560055": (13.0500, 77.5700),
    "560058": (12.9000, 77.5700),
    "560064": (13.0600, 77.5500),
    "560073": (12.8800, 77.6000),
    "560076": (12.8700, 77.5900),
    "560078": (12.9100, 77.6300),
    "560085": (13.0400, 77.6200),
    "560092": (13.0700, 77.6300),
    "560094": (12.8500, 77.6600),
    "560097": (12.8600, 77.6400),
    "560100": (12.8400, 77.6500),
    "560103": (13.0800, 77.5800),
    # Bengaluru Rural
    "561203": (13.1200, 77.6800),
    "561204": (13.1100, 77.6500),
    # Chikkaballapur / Muddenahalli area
    "562100": (13.3500, 77.7000),
    "562101": (13.4034, 77.6976),  # Muddenahalli / SSSSMH
    "562110": (13.4034, 77.6976),  # Also Muddenahalli area
    "56211": (13.4034, 77.6976),   # Truncated version
    "562120": (13.3800, 77.7200),
    # Out-of-state (Uttarakhand - likely data entry or multi-state participants)
    "246159": (30.2800, 78.0500),  # Dehradun area
    "248001": (30.3165, 78.0322),  # Dehradun
    "262554": (29.3919, 79.4542),  # Uttarakhand
    # Possible typos
    "52110": (13.4034, 77.6976),   # Likely 562110 truncated
    "526110": (15.8300, 78.0500),  # Andhra Pradesh?
    "532110": (18.1700, 83.4000),  # Andhra Pradesh?
}

# Fallback: map site codes to coordinates for participants without pin codes
SITE_FALLBACK: dict[str, tuple[float, float]] = {
    "RMH": (13.0282, 77.5699),
    "BBH": (13.0467, 77.5880),
    "SSSSMH": (13.4034, 77.6976),
    "CHAF": (12.9639, 77.6280),
    "BMC": (12.9578, 77.5710),
    "JSS": (12.2960, 76.6552),
}


@router.get("/", response_model=dict)
async def get_participant_locations(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Return participant locations derived from pin codes or site fallback."""
    result = await db.execute(
        select(
            Participant.participant_code,
            Participant.clinical_data,
            CollectionSite.code.label("site_code"),
        )
        .outerjoin(CollectionSite, Participant.collection_site_id == CollectionSite.id)
        .where(Participant.is_deleted == False)  # noqa: E712
    )

    locations = []
    pin_matched = 0
    site_fallback_count = 0

    for row in result.all():
        pin_code = None
        if isinstance(row.clinical_data, dict):
            demo = row.clinical_data.get("demographics", {})
            if isinstance(demo, dict):
                pin_code = str(demo.get("pin_code", "")).strip()

        lat, lng = None, None
        source = "unknown"

        if pin_code and pin_code in PIN_CODE_COORDS:
            lat, lng = PIN_CODE_COORDS[pin_code]
            source = "pin_code"
            pin_matched += 1
        elif row.site_code and row.site_code in SITE_FALLBACK:
            lat, lng = SITE_FALLBACK[row.site_code]
            source = "site_fallback"
            site_fallback_count += 1

        if lat is not None:
            locations.append({
                "participant_code": row.participant_code,
                "lat": lat,
                "lng": lng,
                "pin_code": pin_code or None,
                "site_code": row.site_code,
                "source": source,
            })

    return {
        "success": True,
        "data": {
            "locations": locations,
            "summary": {
                "total": len(locations),
                "pin_code_matched": pin_matched,
                "site_fallback": site_fallback_count,
            },
        },
    }
