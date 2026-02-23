"""Protocols/SOP document endpoints.

Serves BHARAT study SOP documents from the project SOPS directory.
Files are read-only; listing provides metadata, download serves the raw file.
"""

import logging
import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.core.deps import require_role
from app.models.enums import UserRole
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/protocols", tags=["protocols"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)

# ---------------------------------------------------------------------------
# SOP directory resolution
#
# The "BHARAT SOPS" folder sits at the project root: <repo>/BHARAT SOPS/
# We locate it relative to this file's position in the source tree.
# backend/app/api/v1/protocols.py  →  ../../..  →  project root
# ---------------------------------------------------------------------------

_HERE = Path(__file__).resolve()
_PROJECT_ROOT = _HERE.parents[4]  # backend/app/api/v1 → 4 levels up = project root
SOP_DIR = _PROJECT_ROOT / "BHARAT SOPS"

# Metadata for known SOP files, keyed by filename.
#
# Category values MUST match the frontend ProtocolCategory type exactly:
#   'Sample Collection' | 'Lab Processing' | 'Field Operations' | 'Coordination'
#
# description is a one-sentence summary displayed on the card and used for search.
_KNOWN_METADATA: dict[str, dict[str, str]] = {
    "BHARAT STUDY_Metadata collection SOP.docx": {
        "title": "Metadata Collection",
        "category": "Coordination",
        "description": "Procedures for recording and managing participant metadata across all study sites.",
    },
    "BHARAT_Study_SOP_AGE_Detection_in_Cheek Cells.docx": {
        "title": "AGE Detection in Cheek Cells",
        "category": "Lab Processing",
        "description": "Protocol for detecting Advanced Glycation End-products (AGE) in buccal swab samples.",
    },
    "Epigenetics Rural SOP_BHARAT STUDY.docx": {
        "title": "Epigenetics Collection — Rural Sites",
        "category": "Sample Collection",
        "description": "Step-by-step epigenetics sample collection procedure adapted for rural field settings.",
    },
    "Epigenetics Urban SOP_BHARAT STUDY.docx": {
        "title": "Epigenetics Collection — Urban Sites",
        "category": "Sample Collection",
        "description": "Step-by-step epigenetics sample collection procedure for urban hospital and clinic settings.",
    },
    "Hair Sampling_SOP.docx": {
        "title": "Hair Sampling",
        "category": "Sample Collection",
        "description": "Hair sample collection technique, storage conditions, and labelling requirements.",
    },
    "LABELS_SOP_BHARAT STUDY.docx": {
        "title": "Labels and Barcoding",
        "category": "Lab Processing",
        "description": "Label printing specifications, barcode placement standards, and cold-chain labelling rules.",
    },
    "On-Ground Setup_SOP.docx": {
        "title": "On-Ground Setup",
        "category": "Field Operations",
        "description": "Site preparation checklist and equipment setup procedures for field collection events.",
    },
    "SOP- partner team.docx": {
        "title": "Partner Team Protocol",
        "category": "Coordination",
        "description": "Workflow and communication protocols for partner laboratory teams during sample handover.",
    },
    "SOP- Plasma.docx": {
        "title": "Plasma Collection",
        "category": "Sample Collection",
        "description": "Blood draw, centrifugation, aliquoting, and cold-chain storage protocol for plasma samples.",
    },
    "SOP- Urine sample collection.docx": {
        "title": "Urine Sample Collection",
        "category": "Sample Collection",
        "description": "Mid-stream urine collection instructions, container labelling, and transport requirements.",
    },
    "SOP- Volunteer identification.docx": {
        "title": "Volunteer Identification",
        "category": "Field Operations",
        "description": "Eligibility screening, consent verification, and participant ID assignment procedures.",
    },
}

# Allowed file extensions — prevents path traversal by restricting downloads
# to known document types only.
_ALLOWED_EXTENSIONS = {".docx", ".pdf", ".xlsx", ".csv", ".txt", ".md"}


def _safe_filename(filename: str) -> str | None:
    """Validate filename: no path separators, no hidden files, allowed extension.

    Returns the normalised filename or None if rejected.
    """
    # Reject any path components
    if "/" in filename or "\\" in filename or ".." in filename:
        return None
    # Reject hidden files
    if filename.startswith("."):
        return None
    # Extension allowlist
    _, ext = os.path.splitext(filename)
    if ext.lower() not in _ALLOWED_EXTENSIONS:
        return None
    return filename


# ---------------------------------------------------------------------------
# GET /protocols
# ---------------------------------------------------------------------------


@router.get("", response_model=dict)
async def list_protocols(
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
) -> dict:
    """List all available SOP documents with metadata.

    Scans the SOP directory and returns file metadata. Files not in the known
    metadata map are still listed using a title derived from the filename.
    """
    if not SOP_DIR.exists() or not SOP_DIR.is_dir():
        logger.warning("SOP directory not found: %s", SOP_DIR)
        return {"success": True, "data": []}

    protocols: list[dict] = []
    for entry in sorted(SOP_DIR.iterdir()):
        if not entry.is_file():
            continue
        _, ext = os.path.splitext(entry.name)
        if ext.lower() not in _ALLOWED_EXTENSIONS:
            continue

        meta = _KNOWN_METADATA.get(entry.name, {})
        title = meta.get("title") or _title_from_filename(entry.name)
        # Default category maps to frontend's 'Coordination' bucket for unknowns
        category = meta.get("category", "Coordination")
        description = meta.get("description", "")

        protocols.append({
            "filename": entry.name,
            "title": title,
            "category": category,
            "description": description,
            "size_bytes": entry.stat().st_size,
            "extension": ext.lstrip(".").upper(),
        })

    return {"success": True, "data": protocols}


# ---------------------------------------------------------------------------
# GET /protocols/{filename}
# ---------------------------------------------------------------------------


@router.get("/{filename}", response_class=FileResponse)
async def download_protocol(
    filename: str,
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
) -> FileResponse:
    """Serve an SOP document file for download.

    The filename is validated against an allowlist of extensions and path
    components to prevent path traversal. Only files inside the SOP directory
    are served.
    """
    safe_name = _safe_filename(filename)
    if safe_name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename.",
        )

    file_path = SOP_DIR / safe_name

    # Resolve and verify the path is still within SOP_DIR (defence in depth)
    try:
        resolved = file_path.resolve()
        resolved.relative_to(SOP_DIR.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename.",
        )

    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protocol document '{filename}' not found.",
        )

    _, ext = os.path.splitext(safe_name)
    media_type = _media_type(ext.lower())

    return FileResponse(
        path=str(resolved),
        filename=safe_name,
        media_type=media_type,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _title_from_filename(filename: str) -> str:
    """Derive a human-readable title from a raw filename."""
    name, _ = os.path.splitext(filename)
    # Replace underscores and hyphens, collapse spaces
    name = name.replace("_", " ").replace("-", " ")
    # Strip trailing BHARAT STUDY suffix commonly in filename
    for suffix in (" BHARAT STUDY", " SOP BHARAT STUDY"):
        if name.upper().endswith(suffix.upper()):
            name = name[: -len(suffix)].strip()
    return name.strip()


def _media_type(ext: str) -> str:
    """Return MIME type for a given lowercase extension."""
    return {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pdf":  "application/pdf",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".csv":  "text/csv",
        ".txt":  "text/plain",
        ".md":   "text/markdown",
    }.get(ext, "application/octet-stream")
