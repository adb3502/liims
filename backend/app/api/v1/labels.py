"""Label generation endpoints for A4 printing."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.deps import require_role
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.label import LabelGenerateRequest, SingleGroupLabelRequest
from app.services.label_generator import generate_label_zip, generate_single_label_doc

router = APIRouter(prefix="/labels", tags=["labels"])

LABEL_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.LAB_MANAGER,
    UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR,
    UserRole.DATA_ENTRY,
)


@router.post("/generate-zip")
async def generate_labels_zip(
    body: LabelGenerateRequest,
    current_user: Annotated[User, Depends(require_role(*LABEL_ROLES))],
):
    """Generate all 6 label documents as a ZIP file for A4 printing.

    Returns a ZIP containing:
    - labels_cryovial.docx (P1-P5, 5 per row)
    - labels_urine.docx (U1, 5 per row)
    - labels_epigenetics.docx (E1-E4, 4 per row)
    - labels_samples.docx (CS1, R1, H1, +H2 for B-participants)
    - labels_edta.docx (EDTA1-EDTA4)
    - labels_sst_fl_blood.docx (SST1, SST2, Fl1, B1)
    """
    try:
        zip_buf = generate_label_zip(body.participant_codes, body.date_str)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate labels. Please try again.",
        )

    suffix = f"_{body.date_str}" if body.date_str else ""
    filename = f"bharat_labels{suffix}.zip"

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/generate-single")
async def generate_single_group(
    body: SingleGroupLabelRequest,
    current_user: Annotated[User, Depends(require_role(*LABEL_ROLES))],
):
    """Generate a single label group document (.docx) for A4 printing.

    Groups: cryovial, epigenetics, samples, edta, sst_fl_blood
    """
    try:
        docx_buf = generate_single_label_doc(body.participant_codes, body.group)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate labels. Please try again.",
        )

    filename = f"labels_{body.group}.docx"

    return StreamingResponse(
        docx_buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/groups")
async def list_label_groups(
    current_user: Annotated[User, Depends(require_role(*LABEL_ROLES))],
):
    """List available label groups and their label suffixes."""
    from app.services.label_generator import LABEL_GROUPS

    return {
        "success": True,
        "data": [
            {
                "group": name,
                "suffixes": [s for s in suffixes if s],
                "labels_per_participant": len([s for s in suffixes if s]),
                "layout": "5_per_row" if name == "cryovial" else "4_per_row",
            }
            for name, suffixes in LABEL_GROUPS.items()
        ],
    }
