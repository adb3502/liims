from celery import Celery

from app.config import settings

celery = Celery(
    "liims",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    beat_schedule={
        "refresh-dashboard-cache": {
            "task": "app.tasks.dashboard.refresh_dashboard_cache",
            "schedule": settings.DASHBOARD_REFRESH_INTERVAL_MINUTES * 60,
        },
        "odk-sync": {
            "task": "app.tasks.odk.sync_odk_submissions",
            "schedule": settings.ODK_SYNC_INTERVAL_MINUTES * 60,
        },
        "scan-watch-directories": {
            "task": "app.tasks.files.scan_watch_directories",
            "schedule": 300,  # every 5 minutes
        },
        "verify-nas-files": {
            "task": "app.tasks.files.verify_nas_files",
            "schedule": 3600,  # hourly
        },
        "check-backup-health": {
            "task": "app.tasks.backup.check_backup_health",
            "schedule": 3600,  # hourly
        },
        "process-scheduled-reports": {
            "task": "app.tasks.reports.process_scheduled_reports",
            "schedule": 900,  # every 15 minutes
        },
    },
)

celery.autodiscover_tasks(["app.tasks"])
