"""API v1 router that aggregates all sub-routers."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.collection_sites import router as sites_router
from app.api.v1.field_events import router as field_events_router
from app.api.v1.labels import router as labels_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.partner import router as partner_router
from app.api.v1.qr import router as qr_router
from app.api.v1.participants import router as participants_router
from app.api.v1.samples import router as samples_router
from app.api.v1.settings import router as settings_router
from app.api.v1.storage import router as storage_router
from app.api.v1.transports import router as transports_router
from app.api.v1.users import router as users_router
from app.api.v1.instruments import router as instruments_router
from app.api.v1.icc import router as icc_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.reports import router as reports_router
from app.api.v1.query_builder import router as query_builder_router
from app.api.v1.files import router as files_router
from app.api.v1.sync import router as sync_router
from app.api.v1.audit_logs import router as audit_logs_router
from app.api.v1.data_explorer import router as data_explorer_router
from app.api.v1.protocols import router as protocols_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(participants_router)
api_router.include_router(sites_router)
api_router.include_router(samples_router)
api_router.include_router(transports_router)
api_router.include_router(notifications_router)
api_router.include_router(settings_router)
api_router.include_router(storage_router)
api_router.include_router(labels_router)
api_router.include_router(qr_router)
api_router.include_router(field_events_router)
api_router.include_router(partner_router)
api_router.include_router(instruments_router)
api_router.include_router(icc_router)
api_router.include_router(dashboard_router)
api_router.include_router(reports_router)
api_router.include_router(query_builder_router)
api_router.include_router(files_router)
api_router.include_router(sync_router)
api_router.include_router(audit_logs_router)
api_router.include_router(data_explorer_router)
api_router.include_router(protocols_router)
