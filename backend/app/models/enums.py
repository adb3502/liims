"""All enum types for the LIIMS data model."""

import enum


# --- Participant Enums ---

class AgeGroup(int, enum.Enum):
    AGE_18_29 = 1
    AGE_30_44 = 2
    AGE_45_59 = 3
    AGE_60_74 = 4
    AGE_75_PLUS = 5


class Sex(str, enum.Enum):
    MALE = "M"
    FEMALE = "F"


class EnrollmentSource(str, enum.Enum):
    ODK = "odk"
    MANUAL = "manual"
    BULK_IMPORT = "bulk_import"


class ConsentType(str, enum.Enum):
    HOUSEHOLD = "household"
    INDIVIDUAL = "individual"
    DBS_STORAGE = "dbs_storage"
    PROXY_INTERVIEW = "proxy_interview"


# --- Sample Enums ---

class SampleType(str, enum.Enum):
    PLASMA = "plasma"
    EPIGENETICS = "epigenetics"
    EXTRA_BLOOD = "extra_blood"
    RBC_SMEAR = "rbc_smear"
    CHEEK_SWAB = "cheek_swab"
    HAIR = "hair"
    URINE = "urine"
    STOOL_KIT = "stool_kit"


class SampleStatus(str, enum.Enum):
    REGISTERED = "registered"
    COLLECTED = "collected"
    TRANSPORTED = "transported"
    RECEIVED = "received"
    PROCESSING = "processing"
    STORED = "stored"
    RESERVED = "reserved"
    IN_ANALYSIS = "in_analysis"
    PENDING_DISCARD = "pending_discard"
    DEPLETED = "depleted"
    DISCARDED = "discarded"


class DiscardReason(str, enum.Enum):
    CONTAMINATION = "contamination"
    DEPLETED = "depleted"
    CONSENT_WITHDRAWAL = "consent_withdrawal"
    EXPIRED = "expired"
    OTHER = "other"


class DiscardRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class TransportType(str, enum.Enum):
    FIELD_TO_LAB = "field_to_lab"
    LAB_TO_FREEZER = "lab_to_freezer"
    CONSOLIDATION = "consolidation"


# --- Storage Enums ---

class FreezerType(str, enum.Enum):
    MINUS_150 = "minus_150"
    MINUS_80 = "minus_80"
    PLUS_4 = "plus_4"
    ROOM_TEMP = "room_temp"


class FreezerEventType(str, enum.Enum):
    EXCURSION = "excursion"
    FAILURE = "failure"
    MAINTENANCE = "maintenance"
    RECOVERY = "recovery"


class BoxType(str, enum.Enum):
    CRYO_81 = "cryo_81"
    CRYO_100 = "cryo_100"
    ABDOS_81 = "abdos_81"
    CUSTOM = "custom"


class BoxMaterial(str, enum.Enum):
    CARDBOARD_CRYO = "cardboard_cryo"
    ABDOS_PLASTIC = "abdos_plastic"
    SLIDE_BOX = "slide_box"


# --- User / Role Enums ---

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    LAB_MANAGER = "lab_manager"
    LAB_TECHNICIAN = "lab_technician"
    FIELD_COORDINATOR = "field_coordinator"
    DATA_ENTRY = "data_entry"
    COLLABORATOR = "collaborator"
    PI_RESEARCHER = "pi_researcher"


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    VIEW = "view"
    EXPORT = "export"


# --- Field Operations Enums ---

class FieldEventType(str, enum.Enum):
    RURAL_MASS = "rural_mass"
    URBAN_SCHEDULED = "urban_scheduled"


class FieldEventStatus(str, enum.Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SyncStatus(str, enum.Enum):
    PENDING = "pending"
    SYNCED = "synced"
    CONFLICT = "conflict"


# --- Partner Enums ---

class PartnerName(str, enum.Enum):
    HEALTHIANS = "healthians"
    ONE_MG = "1mg"
    LALPATH = "lalpath"
    DECODEAGE = "decodeage"


class OdkSyncStatus(str, enum.Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class OdkProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSED = "processed"
    FAILED = "failed"
    DUPLICATE = "duplicate"


class MatchStatus(str, enum.Enum):
    AUTO_MATCHED = "auto_matched"
    MANUAL_MATCHED = "manual_matched"
    UNMATCHED = "unmatched"


class StoolKitStatus(str, enum.Enum):
    ISSUED = "issued"
    PICKUP_SCHEDULED = "pickup_scheduled"
    COLLECTED_BY_DECODEAGE = "collected_by_decodeage"
    PROCESSING = "processing"
    RESULTS_RECEIVED = "results_received"


# --- Instrument Enums ---

class InstrumentType(str, enum.Enum):
    LIQUID_HANDLER = "liquid_handler"
    MASS_SPEC = "mass_spec"
    OTHER = "other"


class RunType(str, enum.Enum):
    PROTEOMICS = "proteomics"
    METABOLOMICS = "metabolomics"
    PLATE_PREP = "plate_prep"
    OTHER = "other"


class RunStatus(str, enum.Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class QCStatus(str, enum.Enum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"


class OmicsResultType(str, enum.Enum):
    PROTEOMICS = "proteomics"
    METABOLOMICS = "metabolomics"


class IccStatus(str, enum.Enum):
    RECEIVED = "received"
    FIXATION = "fixation"
    PERMEABILIZATION = "permeabilization"
    BLOCKING = "blocking"
    PRIMARY_ANTIBODY = "primary_antibody"
    SECONDARY_ANTIBODY = "secondary_antibody"
    DAPI_STAINING = "dapi_staining"
    MOUNTED = "mounted"
    IMAGING = "imaging"
    ANALYSIS_COMPLETE = "analysis_complete"


# --- Notification Enums ---

class NotificationType(str, enum.Enum):
    ODK_SYNC_FAILURE = "odk_sync_failure"
    FREEZER_CAPACITY_WARNING = "freezer_capacity_warning"
    FREEZER_TEMP_EVENT = "freezer_temp_event"
    CONSENT_WITHDRAWAL = "consent_withdrawal"
    IMPORT_ERROR = "import_error"
    BACKUP_STALE = "backup_stale"
    DISCARD_REQUEST = "discard_request"
    PROCESSING_TIMER_EXCEEDED = "processing_timer_exceeded"
    SYSTEM_ALERT = "system_alert"


class NotificationSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


# --- System Setting Enums ---

class SettingValueType(str, enum.Enum):
    STRING = "string"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    JSON = "json"


class ReportType(str, enum.Enum):
    ENROLLMENT_SUMMARY = "enrollment_summary"
    INVENTORY_SUMMARY = "inventory_summary"
    QUALITY_SUMMARY = "quality_summary"
    COMPLIANCE = "compliance"


class DashboardType(str, enum.Enum):
    ENROLLMENT = "enrollment"
    INVENTORY = "inventory"
    SITES = "sites"
    DATA_AVAILABILITY = "data_availability"
    QUALITY = "quality"
