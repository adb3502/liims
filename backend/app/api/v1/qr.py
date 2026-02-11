"""QR code generation and scanning endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.participant import CollectionSite, Participant
from app.models.sample import Sample
from app.models.storage import Freezer, StorageBox, StoragePosition, StorageRack
from app.models.user import User
from app.schemas.qr import QrBatchRequest, QrLookupResponse, QrStorageInfo
from app.services.qr_code import generate_batch_qr, generate_sample_qr

router = APIRouter(prefix="/qr", tags=["qr-codes"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)
WRITE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR,
)


@router.get("/sample/{sample_id}")
async def get_sample_qr(
    sample_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Generate and return a QR code PNG for a sample."""
    result = await db.execute(
        select(Sample.sample_code).where(
            Sample.id == sample_id,
            Sample.is_deleted == False,  # noqa: E712
        )
    )
    sample_code = result.scalar_one_or_none()
    if sample_code is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")

    png_bytes = generate_sample_qr(sample_code)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{sample_code}.png"'},
    )


@router.post("/batch")
async def batch_qr(
    data: QrBatchRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Generate QR codes for multiple samples, returned as a ZIP file."""
    result = await db.execute(
        select(Sample.sample_code).where(
            Sample.id.in_(data.sample_ids),
            Sample.is_deleted == False,  # noqa: E712
        )
    )
    codes = list(result.scalars().all())
    if not codes:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No matching samples found.")

    zip_buf = generate_batch_qr(codes)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="qr_codes.zip"'},
    )


@router.get("/lookup/{code}", response_model=dict)
async def lookup_by_code(
    code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Look up sample info by sample_code (QR scan endpoint)."""
    result = await db.execute(
        select(Sample)
        .options(selectinload(Sample.participant))
        .where(
            Sample.sample_code == code,
            Sample.is_deleted == False,  # noqa: E712
        )
    )
    sample = result.scalar_one_or_none()
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")

    # Resolve participant code and collection site name
    participant_code: str | None = None
    collection_site_name: str | None = None
    if sample.participant:
        participant_code = sample.participant.participant_code
        if sample.participant.collection_site_id:
            site_result = await db.execute(
                select(CollectionSite.name).where(
                    CollectionSite.id == sample.participant.collection_site_id
                )
            )
            collection_site_name = site_result.scalar_one_or_none()

    # Resolve storage location
    storage_info: QrStorageInfo | None = None
    if sample.storage_location_id:
        pos_result = await db.execute(
            select(StoragePosition)
            .options(
                selectinload(StoragePosition.box)
                .selectinload(StorageBox.rack)
                .selectinload(StorageRack.freezer)
            )
            .where(StoragePosition.id == sample.storage_location_id)
        )
        position = pos_result.scalar_one_or_none()
        if position and position.box:
            box = position.box
            storage_info = QrStorageInfo(
                freezer_name=box.rack.freezer.name if box.rack and box.rack.freezer else None,
                rack_name=box.rack.rack_name if box.rack else None,
                box_name=box.box_name,
                row=position.row,
                column=position.column,
            )

    resp = QrLookupResponse(
        sample_id=sample.id,
        sample_code=sample.sample_code,
        status=sample.status,
        sample_type=sample.sample_type.value,
        participant_code=participant_code,
        collection_site=collection_site_name,
        wave=sample.wave,
        storage=storage_info,
    )
    return {
        "success": True,
        "data": resp.model_dump(mode="json"),
    }
