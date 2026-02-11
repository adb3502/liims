"""All LIIMS database models.

Import all models here so Alembic and SQLAlchemy can discover them.
"""

from app.models.base import Base, BaseModel, BaseModelNoSoftDelete  # noqa: F401

# User & Auth
from app.models.user import AuditLog, User, UserSession  # noqa: F401

# Participants
from app.models.participant import CollectionSite, Consent, Participant  # noqa: F401

# Samples
from app.models.sample import (  # noqa: F401
    Sample,
    SampleDiscardRequest,
    SampleStatusHistory,
    SampleTransport,
    SampleTransportItem,
)

# Storage
from app.models.storage import (  # noqa: F401
    Freezer,
    FreezerTemperatureEvent,
    StorageBox,
    StoragePosition,
    StorageRack,
)

# Field Operations
from app.models.field_ops import FieldEvent, FieldEventParticipant  # noqa: F401

# Partner Integration
from app.models.partner import (  # noqa: F401
    CanonicalTest,
    OdkFormConfig,
    OdkSubmission,
    OdkSyncLog,
    PartnerLabImport,
    PartnerLabResult,
    StoolKit,
    TestNameAlias,
)

# Instruments
from app.models.instrument import (  # noqa: F401
    Instrument,
    InstrumentRun,
    InstrumentRunSample,
    Plate,
    QCTemplate,
)

# Omics & ICC
from app.models.omics import IccProcessing, OmicsResult, OmicsResultSet  # noqa: F401

# Notifications
from app.models.notification import Notification  # noqa: F401

# File Store
from app.models.file_store import ManagedFile, WatchDirectory  # noqa: F401

# System
from app.models.system import DashboardCache, ScheduledReport, SystemSetting  # noqa: F401
