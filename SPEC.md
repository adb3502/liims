# LIIMS - Longevity India Information Management System

## Technical Specification Document

**Project**: Laboratory Information Management System for BHARAT Study
**Institution**: Indian Institute of Science (IISc), Bangalore
**Department**: Developmental Biology and Genetics
**Principal Investigator**: Prof. DK Saini
**Lead Developer/Admin**: adb

---

## 1. Project Overview

### 1.1 Purpose

LIIMS is a self-hosted laboratory information management system designed to support the BHARAT Study (Biomarkers of Healthy Aging, Resilience, Adversity, and Transitions), a cross-sectional multi-omics aging cohort study investigating biomarkers in the Indian population.

### 1.2 Current State

The study has enrolled 1000+ participants with a target of 5000 in the first wave, planned expansion to multiple cities. Current data management relies on disconnected spreadsheets, paper forms, ODK Central for field metadata, and SharePoint for master tracking. This system replaces that fragmented approach with unified infrastructure.

### 1.3 Migration Strategy

**Hard cutover**: One-time bulk import of existing 1000+ participants from spreadsheets/SharePoint before go-live. Old systems become read-only archives. No parallel operation period. Historical sample records, storage locations, and partner results are migrated via bulk CSV import during Phase 1 setup.

### 1.4 Multi-Wave / Multi-City Strategy

The participant coding scheme is locked for Wave 1 (Bangalore sites). Multi-city expansion in future waves will require a redesigned coding scheme decided at that time. The database supports a `wave` tag on all core entities to enable same-database multi-wave operation without partitioning.

### 1.5 Scope

LIIMS manages the complete lifecycle from participant enrollment through sample storage and analytical workflows, integrating with ODK Central for field data, partner laboratories (Healthians, 1mg, Lal Path Labs) for biochemistry results, and laboratory instruments (TECAN FREEDOM EVO liquid handler, Bruker TimsTOF HT/Metabo mass spectrometers) for downstream analysis.

---

## 2. Technical Architecture

### 2.1 Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11+, FastAPI, async SQLAlchemy 2.0 |
| Database | PostgreSQL 15+ (primary + read replica) |
| Task Queue | Celery with Redis broker |
| Frontend | React 18, TypeScript, TanStack Query, Tailwind CSS, shadcn/ui |
| PDF Generation | WeasyPrint |
| QR Code | qrcode library (Python), browser camera API (scanning) |
| Email | SMTP via Gmail/Outlook (external provider) |
| Deployment | Docker Compose, Nginx reverse proxy |
| Offline Support | Progressive Web App (PWA) with IndexedDB |
| Raw Data Storage | NAS (network-attached storage) with instrument-specific watched directories |

### 2.2 Deployment Model

Self-hosted on IISc lab workstation. Accessible only within IISc network via static internal IP address. External access (field staff, collaborators) requires IISc VPN connection. No public domain or internet exposure.

### 2.3 System Requirements

**Server (Lab Workstation)**:
- Windows 11 Pro with WSL 2
- Docker Desktop
- Minimum 16GB RAM, 500GB local storage
- Static IP assignment from IISc IT
- NAS mount for raw instrument data (separate from workstation storage)

**Read Replica**:
- PostgreSQL streaming replication to a second instance
- Read-only access for researchers using R/Python
- LIIMS admin UI manages read replica user accounts

**Client Devices**:
- Modern browser (Chrome, Firefox, Safari, Edge)
- Tablets for field operations (Android/iOS with browser)
- IISc VPN client for remote access
- Expected peak concurrent users: 5-10

### 2.4 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        IISc Network                              │
│                                                                  │
│  ┌─────────┐     ┌─────────────────────────────────────┐        │
│  │ Browser │────▶│           Nginx (Port 80/443)       │        │
│  │ Clients │     │         Reverse Proxy + Static      │        │
│  └─────────┘     └──────────────┬──────────────────────┘        │
│                                 │                                │
│                  ┌──────────────┴──────────────┐                │
│                  ▼                              ▼                │
│         ┌──────────────┐              ┌──────────────┐          │
│         │   Frontend   │              │   FastAPI    │          │
│         │    React     │              │   Backend    │          │
│         │  (Port 3000) │              │  (Port 8000) │          │
│         └──────────────┘              └──────┬───────┘          │
│                                              │                   │
│                    ┌─────────────────────────┼─────────┐        │
│                    ▼                         ▼         ▼        │
│            ┌─────────────┐          ┌───────────┐ ┌──────┐     │
│            │ PostgreSQL  │          │   Redis   │ │Celery│     │
│            │  (Primary)  │          │(Port 6379)│ │Worker│     │
│            │ (Port 5432) │          └───────────┘ └──────┘     │
│            └──────┬──────┘                                      │
│                   │ streaming replication                        │
│            ┌──────▼──────┐                                      │
│            │ PostgreSQL  │◀── R/Python researchers               │
│            │  (Replica)  │                                      │
│            └─────────────┘                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                 NAS (Network Storage)                  │       │
│  │  /timstof-ht/    /timstof-metabo/    /tecan/          │       │
│  │  (watched dirs - LIIMS auto-discovers new files)      │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │   ODK    │   │Healthians│   │   1mg    │
        │ Central  │   │ / LalPath│   │   CSV    │
        └──────────┘   └──────────┘   └──────────┘
```

---

## 3. Data Model

### 3.1 Global Conventions

- **Soft deletes everywhere**: All entities use `is_deleted BOOLEAN DEFAULT false` and `deleted_at TIMESTAMP`. No physical deletes from the database. Deleted records are hidden from UI but preserved for audit.
- **Wave tagging**: Core entities (participant, sample, field_event) carry a `wave INTEGER DEFAULT 1` column for future multi-wave support.
- **UUID primary keys**: All tables use UUID v4 primary keys.
- **Timestamps**: All tables have `created_at` and `updated_at` with timezone.

### 3.2 Core Entities

#### Participant

```
participant
├── id: UUID (primary key)
├── participant_code: VARCHAR(20) UNIQUE NOT NULL  -- e.g., "1A-001"
├── group_code: VARCHAR(5) NOT NULL  -- e.g., "1A", "2B"
├── participant_number: INTEGER NOT NULL  -- e.g., 001
├── age_group: ENUM(1,2,3,4,5) NOT NULL
│   -- 1: 18-29, 2: 30-44, 3: 45-59, 4: 60-74, 5: 75+
├── sex: ENUM('M','F') NOT NULL
├── date_of_birth: DATE
├── collection_site_id: UUID (FK → collection_site) NOT NULL
├── enrollment_date: TIMESTAMP NOT NULL
├── enrollment_source: ENUM('odk', 'manual', 'bulk_import') DEFAULT 'odk'
├── odk_submission_id: VARCHAR(100)  -- reference to ODK Central
├── wave: INTEGER NOT NULL DEFAULT 1
├── completion_pct: DECIMAL(5,2) DEFAULT 0  -- materialized completion percentage
├── is_deleted: BOOLEAN DEFAULT false
├── deleted_at: TIMESTAMP
├── created_at: TIMESTAMP NOT NULL
├── updated_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)
```

#### Collection Site (admin-configurable)

```
collection_site
├── id: UUID (primary key)
├── name: VARCHAR(100) NOT NULL  -- e.g., "MSR", "Baptist Hospital"
├── code: VARCHAR(20) UNIQUE NOT NULL  -- e.g., "MSR", "BAPTIST"
├── participant_range_start: INTEGER NOT NULL  -- e.g., 001
├── participant_range_end: INTEGER NOT NULL  -- e.g., 100
├── city: VARCHAR(100) DEFAULT 'Bangalore'
├── address: TEXT
├── is_active: BOOLEAN DEFAULT true
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)
```

#### Consent

```
consent
├── id: UUID (primary key)
├── participant_id: UUID (FK → participant) NOT NULL
├── consent_type: ENUM NOT NULL
│   -- 'household', 'individual', 'dbs_storage', 'proxy_interview'
├── consent_given: BOOLEAN NOT NULL
├── consent_date: DATE NOT NULL
├── is_proxy: BOOLEAN DEFAULT false  -- flag for proxy consent
├── witness_name: VARCHAR(200)
├── form_version: VARCHAR(20)
├── withdrawal_date: DATE  -- if consent later withdrawn
├── withdrawal_reason: TEXT
├── is_deleted: BOOLEAN DEFAULT false
├── deleted_at: TIMESTAMP
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)
```

**Consent withdrawal cascade**: When individual consent is withdrawn, all physical samples for that participant are flagged for discard via the manager-approved discard workflow. Analytical data already generated (partner lab results, omics data from completed runs) is retained under the research exemption (DPDP Act Section 17(2)(b)).

#### Sample

```
sample
├── id: UUID (primary key)
├── sample_code: VARCHAR(30) UNIQUE NOT NULL  -- e.g., "1A-001-P1"
├── participant_id: UUID (FK → participant) NOT NULL
├── sample_type: ENUM NOT NULL
│   -- 'plasma', 'epigenetics', 'extra_blood', 'rbc_smear',
│   -- 'cheek_swab', 'hair', 'urine', 'stool_kit'
│   -- NOTE: SST serum and fluoride go directly to partner labs, not tracked as LIIMS samples
├── sample_subtype: VARCHAR(10)  -- e.g., "P1", "E2", "H1"
├── parent_sample_id: UUID (FK → sample)  -- for aliquots
├── status: ENUM NOT NULL
│   -- 'registered', 'collected', 'transported', 'received',
│   -- 'processing', 'stored', 'reserved', 'in_analysis',
│   -- 'pending_discard', 'depleted', 'discarded'
├── initial_volume_ul: DECIMAL(10,2)  -- microliters at creation
├── remaining_volume_ul: DECIMAL(10,2)  -- current remaining volume
├── collection_datetime: TIMESTAMP
├── collected_by: UUID (FK → user)
├── collection_site_id: UUID (FK → collection_site)
├── processing_started_at: TIMESTAMP  -- for timing enforcement
├── storage_location_id: UUID (FK → storage_position)
├── storage_datetime: TIMESTAMP
├── stored_by: UUID (FK → user)
├── has_deviation: BOOLEAN DEFAULT false
├── deviation_notes: TEXT
├── qr_code_url: VARCHAR(500)  -- LIIMS URL encoded in QR on label
├── notes: TEXT
├── wave: INTEGER NOT NULL DEFAULT 1
├── is_deleted: BOOLEAN DEFAULT false
├── deleted_at: TIMESTAMP
├── created_at: TIMESTAMP NOT NULL
├── updated_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)
```

**Volume tracking**: Every withdrawal (instrument run, transfer) decrements `remaining_volume_ul`. UI displays current remaining volume per sample.

**Processing timer**: When `collection_datetime` is recorded, the UI starts a visual countdown (30 min for plasma). Exceeding the time window is logged as a deviation.

#### Storage Hierarchy

```
freezer
├── id: UUID (primary key)
├── name: VARCHAR(100) NOT NULL  -- e.g., "Freezer-80-A"
├── freezer_type: ENUM NOT NULL  -- 'minus_150', 'minus_80', 'plus_4', 'room_temp'
├── location: VARCHAR(200)  -- physical location in lab
├── total_capacity: INTEGER  -- total box slots
├── rack_count: INTEGER  -- e.g., 15 racks for -150°C
├── slots_per_rack: INTEGER  -- e.g., 10 slots per rack
├── is_active: BOOLEAN DEFAULT true
├── notes: TEXT
├── is_deleted: BOOLEAN DEFAULT false
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

freezer_temperature_event
├── id: UUID (primary key)
├── freezer_id: UUID (FK → freezer) NOT NULL
├── event_type: ENUM NOT NULL  -- 'excursion', 'failure', 'maintenance', 'recovery'
├── event_start: TIMESTAMP NOT NULL
├── event_end: TIMESTAMP  -- NULL if ongoing
├── observed_temp_c: DECIMAL(5,1)  -- observed temperature if known
├── reported_by: UUID (FK → user) NOT NULL
├── samples_affected_count: INTEGER  -- computed
├── resolution_notes: TEXT
├── requires_sample_review: BOOLEAN DEFAULT true
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

storage_rack
├── id: UUID (primary key)
├── freezer_id: UUID (FK → freezer) NOT NULL
├── rack_name: VARCHAR(50) NOT NULL  -- e.g., "Shelf 1", "Rack A"
├── position_in_freezer: INTEGER
├── capacity: INTEGER  -- number of boxes
├── is_deleted: BOOLEAN DEFAULT false
└── created_at: TIMESTAMP NOT NULL

storage_box
├── id: UUID (primary key)
├── rack_id: UUID (FK → storage_rack) NOT NULL
├── box_name: VARCHAR(100) NOT NULL  -- e.g., "BB1"
├── box_label: VARCHAR(200)  -- full label: "Group 1A, BB1, MSR, 2024-01-15"
├── rows: INTEGER NOT NULL DEFAULT 9
├── columns: INTEGER NOT NULL DEFAULT 9
├── box_type: ENUM DEFAULT 'cryo_81'  -- 'cryo_81', 'cryo_100', 'abdos_81', 'custom'
├── box_material: ENUM  -- 'cardboard_cryo', 'abdos_plastic', 'slide_box'
├── position_in_rack: INTEGER
├── group_code: VARCHAR(5)  -- which participant group this box is for
├── collection_site_id: UUID (FK → collection_site)
├── is_deleted: BOOLEAN DEFAULT false
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

storage_position
├── id: UUID (primary key)
├── box_id: UUID (FK → storage_box) NOT NULL
├── row: INTEGER NOT NULL  -- 1-9
├── column: INTEGER NOT NULL  -- 1-9
├── sample_id: UUID (FK → sample)  -- NULL if empty
├── occupied_at: TIMESTAMP
├── locked_by: UUID (FK → user)  -- for row-level locking during concurrent access
├── locked_at: TIMESTAMP
└── UNIQUE(box_id, row, column)
```

**Row-level locking**: When a user starts assigning samples to a box, individual positions are locked. Other users see locked positions as "in use" and cannot assign to them until released.

**Storage rule enforcement**: Assigning a sample to an incompatible freezer type triggers a warning (e.g., "Plasma requires -80°C storage"). User can override with a mandatory reason that is logged in the audit trail.

#### Sample Status History

```
sample_status_history
├── id: UUID (primary key)
├── sample_id: UUID (FK → sample) NOT NULL
├── previous_status: ENUM
├── new_status: ENUM NOT NULL
├── changed_at: TIMESTAMP NOT NULL
├── changed_by: UUID (FK → user) NOT NULL
├── notes: TEXT
├── location_context: VARCHAR(200)  -- where the change happened
└── storage_rule_override_reason: TEXT  -- if a storage rule warning was overridden
```

#### Sample Discard Request

```
sample_discard_request
├── id: UUID (primary key)
├── sample_id: UUID (FK → sample) NOT NULL
├── requested_by: UUID (FK → user) NOT NULL
├── requested_at: TIMESTAMP NOT NULL
├── reason: ENUM NOT NULL  -- 'contamination', 'depleted', 'consent_withdrawal', 'expired', 'other'
├── reason_notes: TEXT
├── approved_by: UUID (FK → user)  -- lab manager
├── approved_at: TIMESTAMP
├── status: ENUM NOT NULL DEFAULT 'pending'  -- 'pending', 'approved', 'rejected'
├── rejection_reason: TEXT
└── created_at: TIMESTAMP NOT NULL
```

#### Transport Tracking

```
sample_transport
├── id: UUID (primary key)
├── field_event_id: UUID (FK → field_event)
├── transport_type: ENUM NOT NULL  -- 'field_to_lab', 'lab_to_freezer', 'consolidation'
├── origin: VARCHAR(200) NOT NULL
├── destination: VARCHAR(200) NOT NULL
├── departure_time: TIMESTAMP
├── arrival_time: TIMESTAMP
├── cold_chain_method: VARCHAR(200)  -- 'ice packs', 'liquid nitrogen can', 'room temp'
├── courier_name: VARCHAR(200)
├── sample_count: INTEGER
├── box_count: INTEGER
├── notes: TEXT
├── recorded_by: UUID (FK → user) NOT NULL
├── verified_by: UUID (FK → user)  -- person who received at destination
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

sample_transport_item
├── id: UUID (primary key)
├── transport_id: UUID (FK → sample_transport) NOT NULL
├── sample_id: UUID (FK → sample)
├── box_id: UUID (FK → storage_box)
└── created_at: TIMESTAMP NOT NULL
```

### 3.3 Partner Integration Entities

#### ODK Sync

```
odk_form_config
├── id: UUID (primary key)
├── form_id: VARCHAR(100) NOT NULL  -- ODK form identifier
├── form_name: VARCHAR(200) NOT NULL  -- e.g., "Household Survey", "Physical Exam"
├── form_version: VARCHAR(50) NOT NULL
├── field_mapping: JSONB NOT NULL  -- ODK field name → LIIMS field mapping
├── is_active: BOOLEAN DEFAULT true
├── created_at: TIMESTAMP NOT NULL
└── updated_by: UUID (FK → user)

odk_sync_log
├── id: UUID (primary key)
├── sync_started_at: TIMESTAMP NOT NULL
├── sync_completed_at: TIMESTAMP
├── status: ENUM NOT NULL  -- 'running', 'completed', 'failed'
├── submissions_found: INTEGER
├── submissions_processed: INTEGER
├── submissions_failed: INTEGER
├── error_message: TEXT
└── created_by: UUID (FK → user)  -- or 'system' for scheduled

odk_submission
├── id: UUID (primary key)
├── odk_instance_id: VARCHAR(100) UNIQUE NOT NULL
├── odk_form_id: VARCHAR(100) NOT NULL
├── odk_form_version: VARCHAR(50)
├── participant_id: UUID (FK → participant)
├── participant_code_raw: VARCHAR(50)  -- participant code as submitted in ODK
├── submission_data: JSONB NOT NULL  -- raw ODK data
├── processed_at: TIMESTAMP
├── processing_status: ENUM  -- 'pending', 'processed', 'failed', 'duplicate'
├── error_message: TEXT
└── created_at: TIMESTAMP NOT NULL
```

**Version-aware mapping**: Each ODK form version has its own field mapping configuration. When LIIMS detects a new form version during sync, it alerts the admin to create/update the mapping before processing submissions from that version.

**ODK forms**: Multiple forms per participant (household/demographics, individual consent, physical examination, questionnaires). All forms share the participant code field as the linking key.

#### Canonical Test Dictionary

```
canonical_test
├── id: UUID (primary key)
├── canonical_name: VARCHAR(200) UNIQUE NOT NULL  -- e.g., "HbA1c"
├── display_name: VARCHAR(200)  -- e.g., "Glycated Hemoglobin (HbA1c)"
├── category: VARCHAR(100)  -- e.g., "Diabetes", "CBC", "Lipid Panel"
├── standard_unit: VARCHAR(50)  -- e.g., "%", "mg/dL"
├── reference_range_low: DECIMAL(10,4)
├── reference_range_high: DECIMAL(10,4)
├── is_active: BOOLEAN DEFAULT true
├── created_at: TIMESTAMP NOT NULL
└── updated_by: UUID (FK → user)

test_name_alias
├── id: UUID (primary key)
├── canonical_test_id: UUID (FK → canonical_test) NOT NULL
├── partner_name: ENUM NOT NULL  -- 'healthians', '1mg', 'lalpath', 'decodeage'
├── alias_name: VARCHAR(200) NOT NULL  -- partner's name for this test
├── alias_unit: VARCHAR(50)  -- partner's unit if different
├── unit_conversion_factor: DECIMAL(10,6) DEFAULT 1.0
└── created_at: TIMESTAMP NOT NULL
```

#### Partner Lab Results

```
partner_lab_import
├── id: UUID (primary key)
├── partner_name: ENUM NOT NULL  -- 'healthians', '1mg', 'lalpath', 'decodeage'
├── import_date: TIMESTAMP NOT NULL
├── source_file_name: VARCHAR(500)
├── source_file_path: VARCHAR(1000)
├── records_total: INTEGER
├── records_matched: INTEGER
├── records_failed: INTEGER
├── imported_by: UUID (FK → user) NOT NULL
├── notes: TEXT
└── created_at: TIMESTAMP NOT NULL

partner_lab_result
├── id: UUID (primary key)
├── import_id: UUID (FK → partner_lab_import) NOT NULL
├── participant_id: UUID (FK → participant)
├── participant_code_raw: VARCHAR(50)  -- as received from partner
├── test_date: DATE
├── test_name_raw: VARCHAR(200)  -- original name from partner
├── canonical_test_id: UUID (FK → canonical_test)  -- mapped canonical name
├── test_value: VARCHAR(100)
├── test_unit: VARCHAR(50)
├── reference_range: VARCHAR(100)
├── is_abnormal: BOOLEAN
├── raw_data: JSONB  -- complete row from CSV
├── match_status: ENUM  -- 'auto_matched', 'manual_matched', 'unmatched'
└── created_at: TIMESTAMP NOT NULL
```

**Partner collection at field events**: SST serum and fluoride tubes go directly to Healthians/1mg/Lal Path Labs. Partners collect samples at the field event (urban: Healthians provides phlebotomists; rural: 1mg arranges pickup). LIIMS records which partner collected from which participant as part of the field_event_participant record. These primary tubes are NOT tracked as LIIMS samples — only the results returned by partners are imported.

#### Stool Kit Tracking

```
stool_kit
├── id: UUID (primary key)
├── participant_id: UUID (FK → participant) NOT NULL
├── field_event_id: UUID (FK → field_event)
├── kit_code: VARCHAR(100)  -- DecodeAge kit identifier
├── issued_at: TIMESTAMP NOT NULL
├── issued_by: UUID (FK → user)
├── status: ENUM NOT NULL DEFAULT 'issued'
│   -- 'issued', 'pickup_scheduled', 'collected_by_decodeage', 'processing', 'results_received'
├── decodeage_pickup_date: DATE  -- DecodeAge picks up from participant's home
├── results_received_at: TIMESTAMP
├── notes: TEXT
├── is_deleted: BOOLEAN DEFAULT false
└── created_at: TIMESTAMP NOT NULL
```

### 3.4 Instrument Integration Entities

```
instrument
├── id: UUID (primary key)
├── name: VARCHAR(100) NOT NULL  -- e.g., "TECAN FREEDOM EVO", "TimsTOF HT"
├── instrument_type: ENUM NOT NULL  -- 'liquid_handler', 'mass_spec', 'other'
├── manufacturer: VARCHAR(100)
├── model: VARCHAR(100)
├── software: VARCHAR(100)  -- e.g., "Freedom EVOware", "timsControl"
├── location: VARCHAR(200)
├── watch_directory: VARCHAR(1000)  -- NAS path e.g., "/nas/timstof-ht/"
├── is_active: BOOLEAN DEFAULT true
├── configuration: JSONB  -- instrument-specific settings
├── is_deleted: BOOLEAN DEFAULT false
└── created_at: TIMESTAMP NOT NULL

qc_template
├── id: UUID (primary key)
├── name: VARCHAR(100) NOT NULL  -- e.g., "Standard Proteomics QC", "Metabolomics QC"
├── description: TEXT
├── template_data: JSONB NOT NULL  -- well positions and QC sample types
│   -- e.g., {"A1": "blank", "A2": "standard", "every_10th": "pooled_qc", "H12": "blank"}
├── run_type: ENUM  -- 'proteomics', 'metabolomics'
├── is_active: BOOLEAN DEFAULT true
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

plate
├── id: UUID (primary key)
├── plate_name: VARCHAR(200) NOT NULL
├── run_id: UUID (FK → instrument_run)
├── qc_template_id: UUID (FK → qc_template)
├── rows: INTEGER DEFAULT 8  -- A-H
├── columns: INTEGER DEFAULT 12  -- 1-12
├── randomization_config: JSONB  -- stratification variables used
│   -- e.g., {"stratify_by": ["age_group", "sex", "collection_site"]}
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

instrument_run
├── id: UUID (primary key)
├── instrument_id: UUID (FK → instrument) NOT NULL
├── run_name: VARCHAR(200)
├── run_type: ENUM  -- 'proteomics', 'metabolomics', 'plate_prep', 'other'
├── status: ENUM NOT NULL  -- 'planned', 'in_progress', 'completed', 'failed'
├── started_at: TIMESTAMP
├── completed_at: TIMESTAMP
├── operator_id: UUID (FK → user)
├── method_name: VARCHAR(200)
├── batch_id: VARCHAR(100)
├── notes: TEXT
├── raw_data_path: VARCHAR(1000)  -- managed file store path on NAS
├── raw_data_size_bytes: BIGINT
├── raw_data_verified: BOOLEAN DEFAULT false  -- file existence verified
├── qc_status: ENUM  -- 'pending', 'passed', 'failed'
├── is_deleted: BOOLEAN DEFAULT false
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

instrument_run_sample
├── id: UUID (primary key)
├── run_id: UUID (FK → instrument_run) NOT NULL
├── sample_id: UUID (FK → sample) NOT NULL
├── plate_id: UUID (FK → plate)
├── well_position: VARCHAR(10)  -- e.g., "A1", "H12"
├── plate_number: INTEGER DEFAULT 1
├── sample_order: INTEGER
├── is_qc_sample: BOOLEAN DEFAULT false
├── qc_type: VARCHAR(50)  -- 'blank', 'standard', 'pooled_qc'
├── injection_volume_ul: DECIMAL(10,2)
├── volume_withdrawn_ul: DECIMAL(10,2)  -- volume taken from stored sample
└── created_at: TIMESTAMP NOT NULL
```

**Watch folder**: Each instrument has a watched directory on NAS (e.g., `/nas/timstof-ht/`). A Celery task periodically scans for new files/directories and associates them with runs based on naming conventions. Alerts if unlinked files are found.

**TECAN worklist**: Export in Freedom EVOware format (CSV with columns: rack ID, rack label, rack type, position, tube ID, volume, liquid class).

**Plate randomization**: LIIMS provides built-in stratified randomization when auto-assigning samples to plate wells. Stratification variables are fully configurable per plate (e.g., age group, sex, collection site, collection date). Users choose variables when creating each plate.

### 3.5 Omics Results

```
omics_result_set
├── id: UUID (primary key)
├── run_id: UUID (FK → instrument_run) NOT NULL
├── result_type: ENUM NOT NULL  -- 'proteomics', 'metabolomics'
├── analysis_software: VARCHAR(200)  -- e.g., "MaxQuant", "DIA-NN"
├── software_version: VARCHAR(50)
├── import_date: TIMESTAMP NOT NULL
├── imported_by: UUID (FK → user) NOT NULL
├── source_file_path: VARCHAR(1000)
├── total_features: INTEGER  -- total proteins or metabolites detected
├── total_samples: INTEGER
├── qc_summary: JSONB  -- CV%, missing value rate, etc.
├── notes: TEXT
└── created_at: TIMESTAMP NOT NULL

omics_result
├── id: UUID (primary key)
├── result_set_id: UUID (FK → omics_result_set) NOT NULL
├── sample_id: UUID (FK → sample) NOT NULL
├── feature_id: VARCHAR(200) NOT NULL  -- protein/metabolite identifier
├── feature_name: VARCHAR(500)  -- human-readable name
├── quantification_value: DOUBLE PRECISION
├── is_imputed: BOOLEAN DEFAULT false
├── confidence_score: DOUBLE PRECISION
└── created_at: TIMESTAMP NOT NULL
│
│ -- Index on (result_set_id, sample_id) and (result_set_id, feature_id)
│ -- Partitioned by result_type for performance at scale
```

**Scale**: Proteomics can yield 5,000-10,000 proteins per sample. With 5,000 participants and multiple runs, this table could reach tens of millions of rows. Use PostgreSQL table partitioning by `result_type` and proper indexing.

**Import pipeline**: Raw data → software processing (MaxQuant, DIA-NN) → in-house bioinformatics curation → final matrices (CSV/TSV) uploaded to LIIMS.

### 3.6 ICC (Immunocytochemistry) Workflow

```
icc_processing
├── id: UUID (primary key)
├── sample_id: UUID (FK → sample) NOT NULL  -- cheek swab sample
├── status: ENUM NOT NULL
│   -- 'received', 'fixation', 'permeabilization', 'blocking',
│   -- 'primary_antibody', 'secondary_antibody', 'dapi_staining',
│   -- 'mounted', 'imaging', 'analysis_complete'
├── fixation_reagent: VARCHAR(200)  -- e.g., "10% NBF"
├── fixation_duration_min: INTEGER  -- e.g., 60
├── fixation_datetime: TIMESTAMP
├── antibody_panel: VARCHAR(500)  -- e.g., "anti-CML/CEL 1:300"
├── secondary_antibody: VARCHAR(500)  -- e.g., "1:700"
├── microscope_settings: JSONB
│   -- e.g., {"green_exposure": 0.42, "blue_exposure": 0.26, "gain": ...}
├── image_file_paths: JSONB  -- array of image file paths
├── analysis_software: VARCHAR(100) DEFAULT 'Fiji/ImageJ'
├── analysis_results: JSONB  -- quantified AGE data
├── operator_id: UUID (FK → user)
├── notes: TEXT
├── created_at: TIMESTAMP NOT NULL
└── updated_at: TIMESTAMP NOT NULL
```

### 3.7 User and Access Control

```
user
├── id: UUID (primary key)
├── email: VARCHAR(255) UNIQUE NOT NULL
├── password_hash: VARCHAR(255) NOT NULL
├── full_name: VARCHAR(200) NOT NULL
├── role: ENUM NOT NULL
│   -- 'super_admin', 'lab_manager', 'lab_technician',
│   -- 'field_coordinator', 'data_entry', 'collaborator', 'pi_researcher'
├── is_active: BOOLEAN DEFAULT true
├── last_login: TIMESTAMP
├── is_deleted: BOOLEAN DEFAULT false
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

user_session
├── id: UUID (primary key)
├── user_id: UUID (FK → user) NOT NULL
├── token_hash: VARCHAR(255) NOT NULL
├── ip_address: VARCHAR(45)
├── user_agent: TEXT
├── created_at: TIMESTAMP NOT NULL
├── expires_at: TIMESTAMP NOT NULL
└── revoked_at: TIMESTAMP

audit_log
├── id: UUID (primary key)
├── user_id: UUID (FK → user)
├── action: VARCHAR(50) NOT NULL  -- 'create', 'update', 'delete', 'view', 'export'
├── entity_type: VARCHAR(100) NOT NULL  -- 'participant', 'sample', etc.
├── entity_id: UUID
├── old_values: JSONB
├── new_values: JSONB
├── ip_address: VARCHAR(45)
├── timestamp: TIMESTAMP NOT NULL
└── additional_context: JSONB
```

### 3.8 Notification System

```
notification
├── id: UUID (primary key)
├── recipient_id: UUID (FK → user)  -- NULL for role-based
├── recipient_role: ENUM  -- if sent to all users of a role
├── notification_type: ENUM NOT NULL
│   -- 'odk_sync_failure', 'freezer_capacity_warning', 'freezer_temp_event',
│   -- 'consent_withdrawal', 'import_error', 'backup_stale',
│   -- 'discard_request', 'processing_timer_exceeded', 'system_alert'
├── title: VARCHAR(200) NOT NULL
├── message: TEXT NOT NULL
├── severity: ENUM NOT NULL  -- 'info', 'warning', 'critical'
├── entity_type: VARCHAR(100)  -- related entity
├── entity_id: UUID
├── is_read: BOOLEAN DEFAULT false
├── read_at: TIMESTAMP
├── email_sent: BOOLEAN DEFAULT false
├── email_sent_at: TIMESTAMP
├── created_at: TIMESTAMP NOT NULL
└── expires_at: TIMESTAMP  -- auto-dismiss after expiry
```

**Email delivery**: Critical notifications (freezer events, sync failures, consent withdrawals) are also sent via email using an external SMTP provider (Gmail/Outlook). Email recipients are configurable per notification type in admin settings.

### 3.9 Field Operations

```
field_event
├── id: UUID (primary key)
├── event_name: VARCHAR(200) NOT NULL
├── event_date: DATE NOT NULL
├── collection_site_id: UUID (FK → collection_site) NOT NULL
├── event_type: ENUM NOT NULL  -- 'rural_mass', 'urban_scheduled'
├── expected_participants: INTEGER
├── actual_participants: INTEGER
├── status: ENUM  -- 'planned', 'in_progress', 'completed', 'cancelled'
├── coordinator_id: UUID (FK → user)
├── partner_lab: ENUM  -- 'healthians', '1mg', 'lalpath'  -- which partner collects at this event
├── notes: TEXT
├── wave: INTEGER NOT NULL DEFAULT 1
├── is_deleted: BOOLEAN DEFAULT false
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)

field_event_participant
├── id: UUID (primary key)
├── event_id: UUID (FK → field_event) NOT NULL
├── participant_id: UUID (FK → participant) NOT NULL
├── check_in_time: TIMESTAMP
├── wrist_tag_issued: BOOLEAN DEFAULT false
├── consent_verified: BOOLEAN DEFAULT false
├── samples_collected: JSONB  -- {"blood": true, "urine": true, "hair": false, ...}
├── partner_samples: JSONB  -- {"sst": true, "fluoride": true, "partner_barcode": "XYZ123"}
├── stool_kit_issued: BOOLEAN DEFAULT false
├── urine_collected: BOOLEAN DEFAULT false
├── notes: TEXT
├── recorded_by: UUID (FK → user)
├── recorded_at: TIMESTAMP
├── sync_status: ENUM DEFAULT 'synced'  -- 'pending', 'synced', 'conflict'
├── offline_id: VARCHAR(100)  -- for PWA offline tracking
└── UNIQUE(event_id, participant_id)  -- no participant overlap across concurrent events
```

**Concurrent events**: Multiple field events can run simultaneously (e.g., rural camp at MSR and scheduled event at Baptist on the same day). However, a participant can only be assigned to one event — the UNIQUE constraint on `(event_id, participant_id)` combined with application-level checks prevents double-enrollment across concurrent events.

### 3.10 System Configuration

```
system_setting
├── id: UUID (primary key)
├── category: VARCHAR(100) NOT NULL  -- 'odk', 'email', 'session', 'backup', etc.
├── key: VARCHAR(200) NOT NULL
├── value: TEXT NOT NULL
├── value_type: ENUM NOT NULL  -- 'string', 'integer', 'boolean', 'json'
├── description: TEXT
├── updated_at: TIMESTAMP NOT NULL
├── updated_by: UUID (FK → user)
└── UNIQUE(category, key)
```

All system settings are admin-configurable through the UI: ODK connection, SMTP email, session timeout, QC templates, partner field mappings, canonical test dictionary, freezer temperature thresholds, scheduled report configuration, backup monitoring paths, etc.

### 3.11 Scheduled Reports

```
scheduled_report
├── id: UUID (primary key)
├── report_name: VARCHAR(200) NOT NULL
├── report_type: ENUM NOT NULL  -- 'enrollment_summary', 'inventory_summary', 'quality_summary', 'compliance'
├── schedule: VARCHAR(50) NOT NULL  -- cron expression or 'weekly', 'monthly'
├── recipients: JSONB NOT NULL  -- array of email addresses or role names
├── last_generated_at: TIMESTAMP
├── last_sent_at: TIMESTAMP
├── is_active: BOOLEAN DEFAULT true
├── created_at: TIMESTAMP NOT NULL
└── created_by: UUID (FK → user)
```

### 3.12 Dashboard Materialized Views

Dashboard data is pre-computed by Celery beat tasks and stored in materialized views or summary tables:

```
dashboard_cache
├── id: UUID (primary key)
├── dashboard_type: ENUM NOT NULL
│   -- 'enrollment', 'inventory', 'sites', 'data_availability', 'quality'
├── cache_data: JSONB NOT NULL  -- pre-computed aggregates
├── computed_at: TIMESTAMP NOT NULL
├── computation_duration_ms: INTEGER
└── next_refresh_at: TIMESTAMP
```

Refresh interval configurable in admin settings (default: 15 minutes).

---

## 4. Module Specifications

### 4.1 Participant Registry Module

#### Features

**4.1.1 Participant Management**
- **ODK is the primary enrollment source**. Participants are created by syncing from ODK Central.
- Manual creation available as fallback for super admin/lab manager (flagged as `enrollment_source='manual'`).
- Bulk import from CSV for historical data migration (one-time, flagged as `enrollment_source='bulk_import'`).
- Edit participant demographics.
- View complete participant profile with all linked samples, consents, partner data, and completion status.
- **Fuzzy search**: Tolerates typos, transpositions, and common errors (I/1, O/0). Supports partial code matching. Powered by PostgreSQL trigram similarity (`pg_trgm`).
- Filter/sort participant list by any attribute.
- **Completion tracking**: Per-participant completion percentage based on a checklist of expected data (samples collected, samples stored, partner results received, omics data available). Displayed as a progress indicator on the participant profile.

**4.1.2 Consent Tracking**
- Record all four consent types per participant.
- Proxy consent is a boolean flag only — proxy details are captured in the paper form / ODK.
- Track consent dates and witnesses.
- Handle consent withdrawal: triggers manager-approved sample discard workflow. Physical samples are destroyed; analytical data already generated is retained (research exemption).
- Consent status indicators on participant profile.
- Bulk consent verification for field events.

**4.1.3 ODK Integration**
- Configure ODK Central connection (URL, credentials, form IDs) — all via admin settings UI.
- **Multiple forms per participant**: household/demographics, individual consent, physical examination, questionnaires. All linked by participant code field.
- **Version-aware field mapping**: Each form version has its own mapping configuration. Admin is prompted to update mappings when new form versions are detected.
- Manual sync trigger.
- Scheduled sync (configurable interval, default hourly via Celery beat).
- View sync history and status.
- Handle duplicates (ODK is source of truth for deduplication).
- Eligibility screening data stays in ODK — LIIMS only stores enrollment status.

**4.1.4 Data Availability Matrix**
- Per-participant view showing which samples exist and their status.
- Which omics data is available (proteomics, metabolomics).
- Partner lab results status per partner.
- Completion percentage with visual indicators.

#### API Endpoints

```
GET    /api/participants                 # List with pagination, filters, fuzzy search
POST   /api/participants                 # Create single (manual fallback)
POST   /api/participants/bulk            # Bulk import from CSV (migration)
GET    /api/participants/{id}            # Get full profile with completion status
PUT    /api/participants/{id}            # Update
DELETE /api/participants/{id}            # Soft delete

GET    /api/participants/{id}/consents   # List consents
POST   /api/participants/{id}/consents   # Record consent
PUT    /api/consents/{id}                # Update consent
POST   /api/consents/{id}/withdraw       # Record withdrawal + trigger discard workflow

GET    /api/participants/{id}/completion # Completion checklist breakdown

POST   /api/odk/sync                     # Trigger manual sync
GET    /api/odk/sync-history             # View sync logs
GET    /api/odk/config                   # View ODK configuration
PUT    /api/odk/config                   # Update ODK configuration
GET    /api/odk/form-mappings            # List form version mappings
PUT    /api/odk/form-mappings/{id}       # Update mapping for a form version

GET    /api/collection-sites             # List sites (admin-configurable)
POST   /api/collection-sites             # Create new site
PUT    /api/collection-sites/{id}        # Update site
```

#### UI Components

- Participant list view with fuzzy search and advanced filters
- Participant detail/profile page with completion indicator
- Consent recording form
- ODK sync dashboard with form version management
- Data availability matrix view
- Collection site management (admin settings)

---

### 4.2 Sample Lifecycle Module

#### Features

**4.2.1 Sample Registration**
- **Auto-generate aliquots from rules**: Tech enters parent sample code, LIIMS creates all expected aliquots based on hard-coded sample type rules (e.g., plasma → P1-P5 at 500µL each) with pre-filled volumes. Tech confirms and adjusts if actual yield differs.
- Register individual samples during collection.
- Bulk registration for batch processing.
- Parent-child relationships for aliquots.
- Auto-generate sample codes following convention: `{GroupCode}-{Number}-{Type}`.
- QR code generated for each sample encoding LIIMS URL (e.g., `https://liims.local/samples/1A-001-P1`).

**4.2.2 Sample Collection**
- Mark samples as collected with timestamp.
- Record collector, collection site.
- Handle expected vs actual (flag missing samples — not all participants yield all aliquots).
- Batch collection confirmation for field events.

**4.2.3 Sample Processing**
- Hard-coded processing protocols per sample type (see Appendix D for full SOP details).
- Aliquoting interface with volume tracking: initial volume and per-aliquot volume.
- **Processing timer**: Visual countdown timer when processing begins. Plasma must be processed within 30 minutes of blood draw. Timer turns amber at 20 min, red at 30 min. Exceeding the window logs a deviation.
- **Deviation tracking**: Boolean `has_deviation` flag + free-text notes. Deviations appear as warning icons on sample cards and quality dashboard.
- Batch processing mode for high-volume days (50-100 participants).

**4.2.4 Sample Status Tracking**
- Visual status progression.
- **Volume tracking**: Remaining volume updated on every withdrawal. Displayed on sample detail.
- Status change with notes.
- Complete history per sample.
- Batch status updates.

**4.2.5 Extra Blood (B1)**
- Opportunistic/optional sample — only collected when extra blood is available after filling required tubes.
- Not expected for every participant. LIIMS does not flag B1 as "missing" in completion tracking.

**Sample Types and Processing Protocols**:

| Sample Type | Source | Aliquots | Volume | Processing Constraint | Storage |
|-------------|--------|----------|--------|----------------------|---------|
| Plasma | 2 highest-volume EDTA tubes | P1-P5 | 500µL each | Process within 30 min. Centrifuge 3500 rpm, 15 min RT. Snap freeze in LN2. | P1,P2 → -150°C; P3,P4,P5 → -80°C |
| Epigenetics | EDTA tubes | E1-E4 | 570µL each | MCT tubes, ice within 2 hours | E1-E4 → -80°C (group-wise boxes) |
| Extra Blood | EDTA tubes | B1 | Variable | Optional/opportunistic | B1 → -80°C |
| RBC Smear | EDTA tubes | R1 | N/A (slide) | Stored for future microscopy/ICP-MS | Room temp (slide boxes) |
| Cheek Swab | Buccal | CS1 | N/A (slide) | Fix in 10% NBF ~60 min RT, transport 4°C | 4°C → ICC processing |
| Hair | Scalp (posterior vertex) | H1, H2 | N/A | Min 3cm length, no dyes/mehndi. 10 strands, trim to 3cm. | Room temp (MCT tubes, dry) |
| Urine | Midstream | U | 3.5-4mL | Pre-labelled cryovials with fill line | -80°C |
| Stool Kit | DecodeAge take-home | ST | N/A | Issued at event, DecodeAge picks up from home | External processing |

**Note**: SST serum and fluoride tubes are collected directly by partner labs (Healthians/1mg) at field events. They are NOT tracked as samples in LIIMS — only the results imported later are stored.

#### API Endpoints

```
GET    /api/samples                      # List with filters and fuzzy search
POST   /api/samples                      # Register single
POST   /api/samples/bulk-register        # Bulk registration from participant list
GET    /api/samples/{id}                 # Get with full history and volume
PUT    /api/samples/{id}                 # Update
POST   /api/samples/{id}/status          # Change status
POST   /api/samples/{id}/aliquot         # Auto-generate aliquots from rules
POST   /api/samples/{id}/withdraw        # Record volume withdrawal
POST   /api/samples/{id}/deviation       # Log a deviation

GET    /api/samples/{id}/history         # Status history
GET    /api/participants/{id}/samples    # All samples for participant

POST   /api/processing/start             # Start processing session (starts timer)
POST   /api/processing/aliquot           # Record aliquoting
POST   /api/processing/complete          # Complete processing

POST   /api/samples/{id}/discard-request # Request discard (requires manager approval)
GET    /api/discard-requests             # List pending discard requests
POST   /api/discard-requests/{id}/approve # Approve discard
POST   /api/discard-requests/{id}/reject  # Reject discard
```

#### UI Components

- Sample list with fuzzy search and advanced filters
- Sample detail page with history timeline, volume indicator, and deviation warnings
- Registration wizard (single and bulk)
- **Aliquoting interface**: enter parent sample, auto-generate expected aliquots, adjust volumes, assign storage positions
- Processing checklist view with countdown timer
- Expected vs collected reconciliation
- Discard request/approval interface
- QR code display and camera-based scanner

---

### 4.3 Storage & Inventory Module

#### Features

**4.3.1 Freezer Management**
- Register freezers with type, location, capacity.
- Specific freezer configurations: -150°C system has 15 racks × 10 slots each.
- Active/inactive status.
- Capacity utilization dashboard.
- **Temperature event logging**: Manual logging of freezer excursions, failures, and maintenance. All samples in affected freezer are flagged for review. Schema designed for future IoT sensor integration.
- **Storage rule enforcement**: Warning + override when assigning a sample to an incompatible temperature zone. Override requires a reason that is logged.

**4.3.2 Box Management**
- Create boxes with naming convention (Group, Box Number starting from BB1, Site, Date).
- Visual 9×9 grid layout editor.
- Drag-and-drop sample placement.
- Box labeling: top (group, box#, centre, date) and front sticker (same info).
- Auto-suggest next available position.
- Box transfer between freezers with logging.
- Box types: cardboard cryo-boxes (81 slots), ABDOS plastic boxes (81 slots), slide boxes, custom.
- **Plasma storage convention**: P1-P4 in one ABDOS box per 18 participants; P5 in a separate box. Monthly consolidation from -80°C to -150°C for P1 and P2.

**4.3.3 Storage Assignment**
- Assign samples to positions during aliquoting.
- Bulk assignment.
- **Row-level locking**: Individual positions locked when a user begins assignment. Other users see "in use" markers.
- Position lookup via QR scan or manual code entry.
- Visual freezer/rack/box navigation.

**4.3.4 Inventory Operations**
- Sample withdrawal for analysis (with volume decrement).
- Sample discard via manager-approved workflow.
- Box transfer logging.
- Low inventory alerts by sample type.
- Capacity alerts by freezer.
- Consolidation tracking (-80°C → -150°C monthly transfers for plasma P1, P2).

**Storage Rules** (enforced as warnings with override):

| Sample Type | Required Storage | Container | Notes |
|-------------|-----------------|-----------|-------|
| Plasma P1-P2 | -150°C | 2mL cryovials, ABDOS boxes | Long-term biobank, monthly consolidation |
| Plasma P3-P5 | -80°C | 2mL cryovials, ABDOS boxes | Working stock |
| Epigenetics E1-E4 | -80°C | 1.5mL MCT tubes, cardboard cryo-boxes | Group-wise boxes, one box per group |
| Extra Blood B1 | -80°C | MCT tubes | Optional sample |
| Urine U | -80°C | Pre-labelled cryovials (3.5-4mL) | Urban/rural stored separately |
| Cheek Swab CS1 | 4°C | Slides in slide boxes | Until ICC processing |
| Hair H1, H2 | Room temp | MCT tubes | Dry storage, group-wise, urban/rural separate |
| RBC Smears R1 | Room temp | Slide boxes | For future microscopy |

**Cap colour coding** (reference info in system settings):
Cryovial caps are colour-coded by age group for physical identification. The colour mapping is stored in system settings for SOP reference but not enforced by the system.

#### API Endpoints

```
GET    /api/freezers                     # List freezers
POST   /api/freezers                     # Create freezer
GET    /api/freezers/{id}                # Get with capacity stats
PUT    /api/freezers/{id}                # Update
GET    /api/freezers/{id}/contents       # All contents hierarchically

POST   /api/freezers/{id}/temperature-events  # Log temperature event
GET    /api/freezers/{id}/temperature-events  # Temperature event history

GET    /api/boxes                        # List boxes
POST   /api/boxes                        # Create box
GET    /api/boxes/{id}                   # Get with position grid and lock status
PUT    /api/boxes/{id}                   # Update
GET    /api/boxes/{id}/positions         # Position occupancy with locks
POST   /api/boxes/{id}/transfer          # Transfer to different rack

POST   /api/storage/assign               # Assign sample to position (acquires lock)
POST   /api/storage/release-lock         # Release position lock without assigning
POST   /api/storage/withdraw             # Withdraw sample (with volume)
POST   /api/storage/bulk-assign          # Bulk assignment
GET    /api/storage/find/{sample_code}   # Find sample location (supports fuzzy code)
```

#### UI Components

- Freezer inventory dashboard with capacity gauges
- Freezer detail with rack/box hierarchy
- Visual box editor (9×9 grid) with real-time lock indicators
- Sample assignment interface with storage rule warnings
- Storage search/lookup (QR scan or manual code)
- Capacity utilization charts
- Temperature event log and management
- Consolidation tracking view (P1/P2 transfers to -150°C)

---

### 4.4 Field Operations Module

#### Features

**4.4.1 Event Planning**
- Create field sampling events (rural mass or urban scheduled).
- Assign participants to events.
- **Concurrent events**: Multiple events can run on the same day at different sites. A participant can only be assigned to one event (enforced).
- Track expected vs registered participants.
- Event status workflow.
- Record which partner lab operates at this event (Healthians for urban, 1mg for rural).
- **Rural events**: 40-60 participants/day, multiple rooms (entry/screening, collection, processing). Up to 4 phlebotomists simultaneously.
- **Urban events**: 3-4 participants/day, single room with functional zoning.

**4.4.2 Printable Documents**

Generate PDF documents for field use (these are the ONLY downloadable outputs — no raw data exports):

1. **Participant Check-in Sheet**
   - A4 portrait, ~20 participants per page
   - Columns: Code, Name, Arrival Time, Wrist Tag ☐, Consent ☐, Blood ☐, Urine ☐, Hair ☐, Cheek ☐, Stool Kit ☐, Notes
   - Header: Event name, date, site

2. **Sample Collection Log**
   - For phlebotomists
   - Columns: Code, EDTA (1-4 count), SST ☐, Fluoride ☐, Partner Barcode, Time, Initials
   - Space for quick checkmarks

3. **Processing Checklist**
   - For lab processing
   - Columns: Code, P1-P5 ☐☐☐☐☐, E1-E4 ☐☐☐☐, B1 ☐, R1 ☐, CS1 ☐, H1-H2 ☐☐, U ☐, Time, Initials
   - Grouped by batch (4 participants per centrifuge run)

4. **Transport Manifest**
   - Sample count by type
   - Cold chain method (ice packs, liquid nitrogen)
   - Departure/arrival times
   - Courier name
   - Signatures

5. **Label Sheets**
   - **Normal labels** (Novajens 84L, 46×11mm): for EDTA tubes (EDTA1-4), SST (SST1-2), fluoride (FL1), epigenetics MCTs, extra blood, RBC, cheek swab, hair
   - **Cryogenic labels** (Cryobabies LCRY-1700, 1.28×0.50 inches): for plasma cryovials (P1-P5), urine cryovials
   - QR codes encoding LIIMS URLs printed on cryo labels
   - Labels printed in advance using Python-based generation (configurable template system for eventual thermal printer migration)

**4.4.3 Offline PWA Mode**
- **Multi-day offline support**: Field workers at remote rural sites may be disconnected for 2-3 days.
- **Event roster cache**: Before going offline, sync only the participants assigned to this field event (50-100 records) plus blank forms for new registrations. No full database cache.
- Service worker caches app shell and event data.
- IndexedDB stores pending operations.
- Participant check-in works offline.
- Sample collection confirmation works offline.
- New participant registration works offline (manual fallback).
- Sync queue shows pending items with count.
- Auto-sync when connection restored.
- **Field-level merge conflict resolution**: Auto-merge non-conflicting fields. Only flag fields where both the offline device and the server changed different values. Flagged conflicts go into a review queue for the field coordinator.

**4.4.4 Transport Tracking**
- Record full transport chain: departure time, arrival time, cold chain method, courier, sample/box count.
- Link transport records to field events and individual samples/boxes.
- Verified at destination by receiving lab staff.

**4.4.5 Post-Event Digitization**
- Bulk update interface mirroring paper forms.
- Checkbox-based rapid entry for 50-100 participants.
- Reconciliation report: expected vs paper vs digital.

#### API Endpoints

```
GET    /api/field-events                 # List events
POST   /api/field-events                 # Create event
GET    /api/field-events/{id}            # Get with participants
PUT    /api/field-events/{id}            # Update
POST   /api/field-events/{id}/participants  # Add participants

GET    /api/field-events/{id}/checkin-sheet     # Generate PDF
GET    /api/field-events/{id}/collection-log    # Generate PDF
GET    /api/field-events/{id}/processing-list   # Generate PDF
GET    /api/field-events/{id}/transport-manifest # Generate PDF
GET    /api/field-events/{id}/labels            # Generate label PDF

POST   /api/field-events/{id}/check-in          # Record check-in
POST   /api/field-events/{id}/bulk-update       # Bulk digitization

POST   /api/transports                   # Record transport
GET    /api/transports                   # List transports
GET    /api/transports/{id}              # Transport details

GET    /api/sync/pending                 # Get pending offline operations
POST   /api/sync/push                    # Push offline operations
POST   /api/sync/resolve-conflict        # Resolve sync conflict
GET    /api/sync/conflicts               # List unresolved conflicts
```

#### UI Components

- Field event list and calendar view
- Event detail with participant roster
- Print document generation buttons
- Offline-capable check-in interface (PWA)
- Digitization bulk entry form
- Sync status indicator with pending count
- Conflict resolution dialog (field-level merge UI)
- Transport logging form

---

### 4.5 Partner Integration Module

#### Features

**4.5.1 ODK Central Integration**
- Configured in Participant Registry module.
- Version-aware sync with field mapping per form version.
- Sync status dashboard.
- Error handling and retry.

**4.5.2 Healthians/1mg/Lal Path CSV Import**
- Upload CSV file.
- Preview data before import.
- **Canonical test name mapping**: Admin maintains a dictionary of standardized test names. During import, partner test names are mapped to canonical names using saved aliases. Unrecognized test names are flagged.
- Field mapping configuration (saved per partner per form version).
- Participant matching: auto by code (with fuzzy matching for code format variations), manual override for unmatched.
- **Known data quality issues**: Participant code mismatches (format differences), inconsistent test names/units, missing fields. Import wizard shows validation summary with issue counts.
- Review unmatched records.
- Import confirmation with summary.
- View import history.
- PDF attachment upload and linking.

**4.5.3 Partner Field Event Collection**
- SST serum and fluoride tubes collected by partner phlebotomists directly at field events.
- Urban: Healthians provides phlebotomists and collects SST/fluoride. Blood tubes carry Healthians barcodes.
- Rural: 1mg arranges pickup of collected samples from site.
- LIIMS records which partner was involved per field event and per participant (partner barcode tracking).
- Partners are notified 1 day in advance with: location, date, time, expected sample count.

**4.5.4 DecodeAge Stool Kit Tracking**
- Kit issued to participant at field event.
- Take-home kit: participant collects at home. DecodeAge handles pickup from participant's house.
- Track status: issued → pickup scheduled → collected by DecodeAge → processing → results received.
- Results imported as standard partner import (CSV/data from hard drive — standard import pipeline, no special secure workflow).
- Partner lab reports: rural = printed and distributed by public health team; urban = emailed to volunteers. (This happens outside LIIMS.)

#### API Endpoints

```
POST   /api/imports/upload               # Upload CSV
GET    /api/imports/preview/{id}         # Preview uploaded file with validation
POST   /api/imports/configure/{id}       # Set field mapping + test name mapping
POST   /api/imports/execute/{id}         # Run import
GET    /api/imports                      # Import history
GET    /api/imports/{id}                 # Import details with results

GET    /api/partner-results              # Query all partner results
GET    /api/participants/{id}/partner-results  # Results for participant

GET    /api/canonical-tests              # List canonical test dictionary
POST   /api/canonical-tests              # Add canonical test
PUT    /api/canonical-tests/{id}         # Update
GET    /api/canonical-tests/{id}/aliases # List aliases for a test
POST   /api/canonical-tests/{id}/aliases # Add partner alias

POST   /api/stool-kits/issue             # Issue kit
PUT    /api/stool-kits/{id}              # Update status
GET    /api/stool-kits                   # List all kits
```

#### UI Components

- CSV upload wizard with validation preview
- Field mapping interface with canonical test name resolution
- Import preview with validation error summary
- Match/unmatch resolution interface with fuzzy suggestions
- Import history list
- Partner results viewer (in-browser only, no download)
- Stool kit tracking list
- Canonical test dictionary management (admin)

---

### 4.6 Instrument Integration Module

#### Features

**4.6.1 Instrument Registry**
- Register TECAN FREEDOM EVO (liquid handler, Freedom EVOware software)
- Register TimsTOF HT (proteomics)
- Register TimsTOF Metabo (metabolomics)
- Each instrument has a configured watch directory on NAS
- Configurable instrument types for future additions
- Active/inactive status

**4.6.2 Managed File Store (NAS)**
- **Instrument-specific watched directories**: Each instrument writes to its own directory on NAS (e.g., `/nas/timstof-ht/`, `/nas/timstof-metabo/`, `/nas/tecan/`). LIIMS knows the instrument from the path.
- **Celery watch task**: Periodically scans watched directories for new files. Auto-links discovered files to runs based on directory structure and naming conventions.
- **File verification**: LIIMS records file paths and sizes. Periodic verification task checks files still exist and alerts if missing.
- Raw instrument data stays on NAS, never on the workstation's local storage.

**4.6.3 Sample Queue Management**
- Queue samples for specific instrument.
- Queue status (pending, in progress, completed).
- Priority ordering.
- Batch grouping.

**4.6.4 Plate Preparation (TECAN)**
- Visual 96-well plate designer.
- Drag samples to wells or auto-assign.
- **Configurable QC templates**: Admin creates named QC templates (e.g., "Standard Proteomics QC") defining well positions for blanks, standards, and pooled QC samples. Different templates for proteomics vs metabolomics.
- **Built-in randomization**: Stratified randomization when auto-assigning samples. User selects which variables to stratify by (age group, sex, collection site, collection date, etc.) per plate.
- Export worklist in **TECAN Freedom EVOware format** (CSV: rack ID, rack label, rack type, position, tube ID, volume, liquid class).
- Track sample → well mapping with volume withdrawn from each source sample.

**4.6.5 Analytical Run Management**
- Create run with instrument, method, operator.
- Assign samples to run (via plate or direct).
- Track run status.
- Record raw data file locations (auto-linked from watch folder or manual entry).
- QC status tracking.
- Link run results back to samples.

**4.6.6 Omics Results Import**
- Import processed results (protein/metabolite quantification matrices) from the bioinformatics pipeline.
- Pipeline: Raw data → software processing (MaxQuant, DIA-NN) → in-house curation → final matrices → LIIMS import.
- Per-protein/metabolite quantification stored per sample (see Section 3.5).
- Result sets linked to instrument runs.

**4.6.7 ICC Workflow (Cheek Swab Processing)**
- Track full immunocytochemistry pipeline: received → fixation → permeabilization → blocking → primary antibody (overnight 4°C) → secondary antibody (2hr RT) → DAPI staining → mounting → imaging → analysis.
- Record specific protocol data: fixation reagent/time, antibody dilutions, microscope settings (Olympus IX73, Aurox system, exposure times).
- Store image file paths and quantified AGE analysis results.

**4.6.8 Workflow States**

```
Sample Reserved → Plate Prepared → Queued → Run Started → Run Complete → Results Imported
```

Each transition logged with timestamp and user.

#### API Endpoints

```
GET    /api/instruments                  # List instruments
POST   /api/instruments                  # Register instrument
GET    /api/instruments/{id}             # Get details
PUT    /api/instruments/{id}             # Update

GET    /api/instrument-queue             # View all queues
POST   /api/instrument-queue             # Add samples to queue
PUT    /api/instrument-queue/{id}        # Update queue item

GET    /api/qc-templates                 # List QC templates
POST   /api/qc-templates                 # Create template
PUT    /api/qc-templates/{id}            # Update template

POST   /api/plates                       # Create plate layout
GET    /api/plates/{id}                  # Get plate with wells
PUT    /api/plates/{id}                  # Update layout
POST   /api/plates/{id}/randomize        # Auto-assign samples with stratification
GET    /api/plates/{id}/export           # Export TECAN EVOware worklist

GET    /api/runs                         # List runs
POST   /api/runs                         # Create run
GET    /api/runs/{id}                    # Get run details
PUT    /api/runs/{id}                    # Update run
POST   /api/runs/{id}/start              # Mark run started
POST   /api/runs/{id}/complete           # Mark run complete

POST   /api/omics-results/import         # Import result matrix
GET    /api/omics-results/sets           # List result sets
GET    /api/omics-results/sets/{id}      # Result set details
GET    /api/samples/{id}/omics-results   # Omics results for a sample

GET    /api/icc-processing               # List ICC records
POST   /api/icc-processing               # Create/update ICC record
GET    /api/icc-processing/{id}          # ICC processing details
PUT    /api/icc-processing/{id}          # Update ICC step
```

#### UI Components

- Instrument dashboard
- Sample queue manager
- Visual plate designer (96-well grid) with drag-and-drop
- QC template management (admin)
- Randomization configuration per plate
- Worklist export interface (Freedom EVOware format)
- Run creation wizard
- Run tracking dashboard
- Omics results import wizard
- ICC workflow tracker
- File store browser (NAS files linked to runs)

---

### 4.7 Compliance & Audit Module

#### Features

**4.7.1 Audit Trail**
- Automatic logging of all data changes (immutable append-only).
- Captures: user, timestamp, action, entity, old values, new values.
- Audit log viewer with filters.
- **No raw data export** except audit log PDF for ethics committee (admin-only).
- Logs retained for 7 years (ICMR guideline). PostgreSQL handles this at scale with proper indexing.

**4.7.2 Data Access Logging**
- Log every record view (configurable per entity type).
- Log all print/PDF generation operations.
- Log failed access attempts.
- PII field access tracking.

**4.7.3 Consent Compliance**
- Consent status validation before operations.
- Consent withdrawal triggers sample discard workflow (manager approval required).
- Physical samples destroyed; analytical data retained per research exemption.
- Consent report generation.

**4.7.4 Material Transfer Agreement Tracking**
- **Deferred**: No material transfers in the current project scope. MTA module is designed in the schema but not implemented until needed. Basic record-keeping capability available if needed in the future.

**4.7.5 Data Export Policy**
- **No raw data downloads**. This is a core security principle.
- Allowed exports: operational PDFs (check-in sheets, transport manifests, labels), TECAN worklists, audit log PDFs (admin only).
- Researchers access data via read replica (R/Python with managed PostgreSQL accounts).
- In-browser query builder with charts for exploratory analysis (see Section 4.8.4).

**4.7.6 Data Retention**
- Configurable retention policies.
- Automated flagging of approaching limits.
- Soft deletion only — data is never physically removed.

**ICMR 2017 Compliance Points**:
- Audit trails for all data modifications ✓
- Consent documentation and tracking ✓
- MTA tracking for sample transfers (deferred) ☐
- Access logging for accountability ✓

**DPDP Act 2023 Compliance Points**:
- Research exemption applies (Section 17(2)(b)) ✓
- Data not used for individual-specific decisions without consent ✓
- Security measures appropriate to research context ✓
- Lawful processing basis documented ✓
- Consent forms available in pre-translated PDFs (22 Indian languages) — managed outside LIIMS ✓

#### API Endpoints

```
GET    /api/audit-logs                   # Query audit logs
GET    /api/audit-logs/export            # Export audit log PDF (admin only)
GET    /api/audit-logs/entity/{type}/{id}  # Logs for specific entity

GET    /api/access-logs                  # Query access logs
GET    /api/access-logs/user/{id}        # Logs for specific user
```

#### UI Components

- Audit log viewer with filters
- Audit log PDF export (admin only)
- Access log viewer
- Compliance dashboard
- Consent status report

---

### 4.8 Access Control, Dashboards & Query Module

#### Features

**4.8.1 User Management**
- Create user accounts (admin).
- Assign roles.
- Activate/deactivate users.
- Password reset.
- Session management.
- **Read replica access management**: Admin can create/revoke PostgreSQL read-only accounts for the analytics replica. Generates credentials and sets schema permissions.

**4.8.2 Role-Based Access Control**

| Role | Participants | Samples | Storage | Field Ops | Instruments | Dashboards | Admin |
|------|-------------|---------|---------|-----------|-------------|------------|-------|
| Super Admin | Full | Full | Full | Full | Full | Full | Full |
| Lab Manager | View/Edit | Full | Full | View | Full | Full | Users |
| Lab Technician | View | Edit | Edit | View | Queue | View | None |
| Field Coordinator | View | Create | None | Full | None | Limited | None |
| Data Entry | View | View | None | Edit | None | None | None |
| Collaborator | Limited* | Limited* | None | None | None | View (filtered) | None |
| PI/Researcher | View | View | View | View | View | Full | None |

**Permission Details**:
- *Collaborator*: Includes partner hospital clinicians, external researchers, and funders. See same dashboards but filtered by access level (e.g., site-specific for clinicians, aggregate-only for funders). No PII access, no data export, no raw record access.
- Data entry role is generalist: post-event digitization, lab processing entry, partner data imports.
- **No raw data export for any role**. Operational PDFs and worklists only.
- PII fields require explicit permission flag.

**4.8.3 Dashboards (Materialized Views)**

All dashboards use pre-computed data refreshed every 15 minutes by Celery beat tasks.

1. **Enrollment Dashboard**
   - Total participants by age group (bar chart)
   - Participants by sex (pie chart)
   - Participants by collection site (bar chart)
   - Enrollment velocity (line chart over time)
   - Target vs actual progress (gauge)
   - Wave selector

2. **Sample Inventory Dashboard**
   - Samples by type (bar chart)
   - Samples by status (stacked bar)
   - Freezer utilization (gauge per freezer)
   - Samples pending processing (count)
   - Recent storage activity
   - Consolidation status (P1/P2 pending transfer to -150°C)

3. **Collection Site Dashboard**
   - Per-site enrollment counts
   - Recent collection events
   - Upcoming scheduled events
   - Site-specific sample completion rates

4. **Data Availability Dashboard**
   - Completeness matrix (participants × data types)
   - Omics coverage statistics
   - Partner lab data status
   - Missing data indicators
   - Per-participant completion percentages

5. **Quality Dashboard**
   - Processing deviations count and trend
   - Processing timer violations
   - Missing expected samples
   - Consent status issues
   - Freezer temperature events
   - Data validation errors

**4.8.4 Query Builder**
- Basic multi-criteria filter builder for ad-hoc queries (e.g., "female participants age 60+ with proteomics data and HbA1c > 6.5").
- Results displayed as table in browser with pagination and sorting.
- **Auto-generated charts** from query results (bar, scatter, line) for exploratory analysis.
- Save queries as named views. Share with other users (role-dependent).
- **No data download** — results are view-only in browser.
- API access to query results available for researchers (via auth token), enabling R/Python integration without direct database access.

**4.8.5 Scheduled Reports**
- Celery beat generates weekly/monthly reports and emails them to configured recipients.
- Report types: enrollment summary, inventory summary, quality summary, compliance status.
- Recipients configurable per report (PI, lab manager, ethics committee email addresses).

**4.8.6 Notification Center**
- In-app bell icon with unread count.
- Notification list with severity indicators (info, warning, critical).
- Mark as read / dismiss.
- **Email delivery for critical notifications**: Freezer events, sync failures, consent withdrawals, backup staleness.
- Email SMTP via external provider (Gmail/Outlook), configurable in admin settings.

**4.8.7 External Access**
- Collaborator accounts with restricted view-only access to filtered dashboards.
- No data export capability.
- **Session timeout**: 30 minutes of inactivity. PWA silently refreshes JWT tokens in the background as long as the app is open (prevents forced logout during active use, especially on field tablets).
- Concurrent session limit: 3 per user.
- All external access logged.

#### API Endpoints

```
POST   /api/auth/login                   # Login
POST   /api/auth/logout                  # Logout
POST   /api/auth/refresh                 # Refresh token (silent refresh)
GET    /api/auth/me                      # Current user

GET    /api/users                        # List users (admin)
POST   /api/users                        # Create user
GET    /api/users/{id}                   # Get user
PUT    /api/users/{id}                   # Update user
POST   /api/users/{id}/reset-password    # Reset password
PUT    /api/users/{id}/activate          # Activate/deactivate

POST   /api/users/replica-account        # Create read replica DB account
DELETE /api/users/replica-account/{id}    # Revoke replica access

GET    /api/dashboards/enrollment        # Enrollment stats (materialized)
GET    /api/dashboards/inventory         # Inventory stats (materialized)
GET    /api/dashboards/sites             # Site stats (materialized)
GET    /api/dashboards/data-availability # Data matrix (materialized)
GET    /api/dashboards/quality           # Quality metrics (materialized)

POST   /api/queries                      # Execute ad-hoc query
GET    /api/queries/saved                # List saved queries
POST   /api/queries/save                 # Save a query
GET    /api/queries/{id}/results         # Re-run saved query

GET    /api/notifications                # List notifications for current user
PUT    /api/notifications/{id}/read      # Mark as read
GET    /api/notifications/unread-count   # Unread count (for bell icon badge)

GET    /api/settings                     # List all settings (admin)
PUT    /api/settings/{category}/{key}    # Update a setting
GET    /api/settings/{category}          # Get settings by category
```

#### UI Components

- Login page
- User management interface (admin)
- Read replica account management (admin)
- Role assignment interface
- Dashboard pages (5 dashboards) with materialized data
- Query builder with chart auto-generation
- Saved queries list
- Notification center (bell icon + dropdown + full page)
- Admin settings panel (all system configuration in one place)
- Profile/settings page
- Session timeout warning (with silent refresh active)

---

## 5. User Interface Specifications

### 5.1 Design System

**Framework**: Tailwind CSS with shadcn/ui components

**Language**: English only. No i18n required. (Consent forms in 22 languages are pre-translated PDFs managed outside LIIMS.)

**Color Palette**:
- Primary: Blue (#2563eb) - actions, links, primary buttons
- Success: Green (#16a34a) - completed, success states
- Warning: Amber (#d97706) - pending, warnings, timer alerts
- Danger: Red (#dc2626) - errors, destructive actions, timer exceeded
- Neutral: Slate grays for text, borders, backgrounds

**Typography**:
- Font: Inter (system fallback: sans-serif)
- Headings: Bold weight
- Body: Regular weight
- Monospace: For sample codes, IDs, QR data

**Layout**:
- Sidebar navigation (collapsible on mobile)
- Top header with user menu, notification bell icon
- Content area with breadcrumbs
- Responsive: Desktop (1200px+), Tablet (768-1199px), Mobile (<768px)
- PWA: Designed for native app migration path in the future (React Native / Flutter)

### 5.2 Navigation Structure

```
├── Dashboard (default landing based on role)
├── Participants
│   ├── List (with fuzzy search)
│   ├── Create (manual fallback, admin only)
│   ├── [Detail View with completion tracking]
│   └── ODK Sync Status
├── Samples
│   ├── List (with fuzzy search + QR scan)
│   ├── Register
│   ├── Processing (with timers)
│   └── [Detail View with volume + deviations]
├── Storage
│   ├── Freezers (with temp event log)
│   ├── Boxes (with real-time lock indicators)
│   └── Search/Lookup (QR scan or code)
├── Field Operations
│   ├── Events (calendar view)
│   ├── Create Event
│   ├── [Event Detail with transport]
│   ├── Digitization
│   └── Conflicts (offline sync)
├── Partners
│   ├── Import Data
│   ├── Import History
│   ├── Results Viewer
│   ├── Stool Kit Tracker
│   └── Canonical Test Dictionary
├── Instruments
│   ├── Dashboard
│   ├── Queue
│   ├── Plate Designer (with randomization)
│   ├── Runs
│   ├── Omics Results
│   └── ICC Workflow
├── Reports
│   ├── Enrollment Dashboard
│   ├── Inventory Dashboard
│   ├── Sites Dashboard
│   ├── Data Availability Dashboard
│   ├── Quality Dashboard
│   └── Query Builder
├── Notifications
└── Admin (admin roles only)
    ├── Users
    ├── Read Replica Accounts
    ├── Audit Logs
    ├── Access Logs
    ├── Scheduled Reports
    └── System Settings
```

### 5.3 Key Interface Patterns

**List Views**: Pagination, column sorting, filters panel, fuzzy search bar (with QR scan button where applicable), bulk actions. **No export buttons** — data stays in browser.

**Detail Views**: Tabs for related data, action buttons in header, audit history expandable, linked entities clickable.

**Forms**: Inline validation, required field indicators, autosave drafts, confirmation before destructive actions.

**Wizards**: Multi-step for complex operations (bulk registration, aliquoting, imports), progress indicator, back/next navigation.

**Modals**: Confirmation dialogs, quick create forms, detail previews.

**Error Messages**: User-friendly messages only (e.g., "Import failed: 3 participants could not be matched"). Technical details logged server-side, not shown to users.

**QR Scanning**: Camera-based QR scanner available on sample lookup pages. Scans QR code → opens sample detail page directly.

---

## 6. API Design

### 6.1 General Conventions

**Base URL**: `/api/v1`

**Authentication**: JWT tokens in Authorization header
```
Authorization: Bearer <token>
```

**Silent token refresh**: PWA auto-refreshes tokens before expiry as long as the app is open. No forced re-login during active use.

**Response Format**:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150
  }
}
```

**Error Format**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": { ... }
  }
}
```

Error messages are user-friendly. Technical details go to server logs only.

**Pagination**: `?page=1&per_page=20`

**Filtering**: `?status=stored&sample_type=plasma`

**Sorting**: `?sort=created_at&order=desc`

**Search**: `?search=1A-001` (fuzzy matching via pg_trgm)

### 6.2 Rate Limiting

No rate limiting for internal network deployment.

### 6.3 API Documentation

Auto-generated OpenAPI/Swagger documentation at `/api/docs`

---

## 7. Security

### 7.1 Authentication

- JWT-based authentication
- Token expiry: 24 hours
- **Silent refresh**: PWA refreshes tokens in background while app is open
- Password hashing: bcrypt
- Minimum password requirements: 8 characters, mixed case, number

### 7.2 Authorization

- Role-based access control (RBAC)
- Permission checks on every API endpoint
- Entity-level permissions where applicable
- **No raw data export** for any role

### 7.3 Data Protection

- HTTPS only (via Nginx with self-signed cert for internal use)
- Database encryption at rest (PostgreSQL)
- Sensitive fields encrypted in database (future enhancement)
- No PII in logs or labels
- No data downloads — researchers use read replica with managed accounts

### 7.4 Session Security

- HTTP-only cookies for tokens
- Session timeout: 30 minutes inactivity (with silent auto-refresh while app is open)
- Concurrent session limit: 3 per user
- Session revocation on password change

### 7.5 Audit

- All data modifications logged (immutable append-only)
- All authentication events logged
- Failed access attempts logged
- Print/PDF generation logged
- Logs retained for 7 years (ICMR guideline)

---

## 8. Deployment

### 8.1 Docker Compose Configuration

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - api

  frontend:
    build: ./frontend
    environment:
      - VITE_API_URL=/api

  api:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://liims:password@postgres:5432/liims
      - REDIS_URL=redis://redis:6379
      - SECRET_KEY=${SECRET_KEY}
      - ODK_CENTRAL_URL=${ODK_CENTRAL_URL}
      - ODK_CENTRAL_EMAIL=${ODK_CENTRAL_EMAIL}
      - ODK_CENTRAL_PASSWORD=${ODK_CENTRAL_PASSWORD}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASSWORD=${SMTP_PASSWORD}
      - NAS_MOUNT_PATH=${NAS_MOUNT_PATH}
    volumes:
      - ${NAS_MOUNT_PATH}:/data/nas:ro  # NAS mount for raw data
    depends_on:
      - postgres
      - redis

  celery-worker:
    build: ./backend
    command: celery -A app.celery worker -l info
    environment:
      - DATABASE_URL=postgresql://liims:password@postgres:5432/liims
      - REDIS_URL=redis://redis:6379
      - NAS_MOUNT_PATH=${NAS_MOUNT_PATH}
    volumes:
      - ${NAS_MOUNT_PATH}:/data/nas:ro
    depends_on:
      - postgres
      - redis

  celery-beat:
    build: ./backend
    command: celery -A app.celery beat -l info
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://liims:password@postgres:5432/liims
    depends_on:
      - redis

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=liims
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=liims
    volumes:
      - postgres_data:/var/lib/postgresql/data

  postgres-replica:
    image: postgres:15
    environment:
      - POSTGRES_USER=liims_replica
      - POSTGRES_PASSWORD=password
    volumes:
      - replica_data:/var/lib/postgresql/data
    depends_on:
      - postgres

  redis:
    image: redis:alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  replica_data:
  redis_data:
```

### 8.2 Backup Strategy

- **Host OS manages backups**: Windows Task Scheduler or WSL cron runs backup scripts (pg_dump + Docker volume snapshots + uploaded file copies).
- **LIIMS monitors backup health**: A Celery task checks backup file timestamps and alerts (via notification system) if a backup is stale or missing.
- **Full system backup scope**: PostgreSQL database, Docker volumes, uploaded files (CSVs, PDFs), and label templates. Raw instrument data on NAS is backed up separately by NAS hardware.
- Backup retention: 30 days rolling.
- Backup location: Separate drive/NAS.
- Weekly backup verification.

### 8.3 Environment Variables

```
# Database
DATABASE_URL=postgresql://liims:password@localhost:5432/liims
REPLICA_DATABASE_URL=postgresql://liims_replica:password@localhost:5433/liims

# Security
SECRET_KEY=<generate-strong-key>
JWT_EXPIRY_HOURS=24

# ODK Integration
ODK_CENTRAL_URL=https://odk.yourdomain.com
ODK_CENTRAL_EMAIL=admin@example.com
ODK_CENTRAL_PASSWORD=<odk-password>

# Email (External SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=liims.alerts@gmail.com
SMTP_PASSWORD=<app-password>
SMTP_FROM_NAME=LIIMS Alerts

# Redis
REDIS_URL=redis://localhost:6379

# NAS
NAS_MOUNT_PATH=/mnt/nas  # or Windows UNC path
```

---

## 9. Development Phases

### Phase 1: Foundation

**Goal**: Core participant and sample management working end-to-end

**Deliverables**:
- Project setup (Docker, FastAPI, React scaffolding)
- Database schema and migrations (all core entities with soft delete)
- Authentication system with silent token refresh
- User management (basic RBAC)
- System settings infrastructure (admin UI)
- Collection site management (admin-configurable)
- Participant CRUD with fuzzy search (pg_trgm)
- Sample CRUD with status tracking and volume tracking
- Basic sample registration workflow with auto-aliquot generation
- Notification system (in-app + email framework)
- Simple list views and forms with user-friendly error messages
- **Migration**: Bulk import of existing 1000+ participants from CSV

**Validation**: Can create participants (manual + bulk import), register samples, auto-generate aliquots, track status changes and volumes

---

### Phase 2: Storage & Processing

**Goal**: Complete sample lifecycle with storage management

**Deliverables**:
- Freezer/rack/box management with temperature event logging
- Visual box layout editor with row-level locking
- Storage assignment during aliquoting with rule warnings + override
- Aliquoting workflow interface with processing timers
- Deviation tracking (flag + notes)
- Sample discard workflow (request → manager approval)
- Storage search/lookup with QR scanning
- Capacity dashboard with consolidation tracking
- Label generation (normal Novajens + cryogenic Cryobabies, configurable templates)
- QR code generation for cryolabels (LIIMS URLs)

**Validation**: Can process samples through aliquoting with timers, assign to storage with rule enforcement, scan QR to look up samples

---

### Phase 3: Field Operations

**Goal**: Support rural and urban sampling workflows

**Deliverables**:
- Field event management (concurrent events, no participant overlap)
- Printable document generation (all 5 types)
- PWA offline capability (multi-day, event roster cache, field-level merge)
- Check-in interface with wrist tag tracking
- Transport tracking (full chain of custody)
- Post-event digitization for 50-100 participants
- Sync queue and field-level conflict resolution
- Offline → online merge UI

**Validation**: Can run a simulated field event with paper backup, multi-day offline, digitization, and transport logging

---

### Phase 4: Partner Integration

**Goal**: Data flows from external sources

**Deliverables**:
- ODK Central sync with version-aware field mapping
- CSV import wizard with canonical test name mapping
- Partner data matching (fuzzy code matching, handle known data quality issues)
- Partner field event collection tracking (which partner, barcode linking)
- DecodeAge stool kit lifecycle tracking
- Partner results viewer (in-browser only)
- Canonical test dictionary management UI

**Validation**: Can sync ODK data across form versions, import Healthians CSV with test name normalization, view linked results

---

### Phase 5: Instruments & Analytics

**Goal**: Prepare samples for analytical workflows and store results

**Deliverables**:
- Instrument registry with NAS watch folder configuration
- Managed file store (auto-detect files from NAS)
- Sample queue management
- Plate designer with configurable QC templates
- Built-in stratified randomization
- TECAN Freedom EVOware worklist export
- Run management
- Omics results import (protein/metabolite level quantification)
- ICC workflow tracker for cheek swab processing
- Query builder with auto-chart generation

**Validation**: Can create randomized plate layouts, export EVOware worklists, import proteomics results, query across omics data in browser

---

### Phase 6: Compliance, Reports & Polish

**Goal**: Production-ready with compliance features

**Deliverables**:
- Complete audit trail system
- Access logging
- Read replica setup + managed account provisioning
- All 5 dashboards with materialized views
- Scheduled reports (weekly/monthly email digests via Celery)
- Role-based UI hiding and collaborator filtering
- Export controls (no raw data, PDFs + worklists only)
- Notification system completion (all notification types + email delivery)
- Backup monitoring (LIIMS checks backup health, alerts on staleness)
- Performance optimization
- Security hardening

**Validation**: Pass compliance checklist, external collaborator sees filtered dashboards only, scheduled reports deliver to PI email, backup alerts fire correctly

---

## 10. Claude Code Implementation Notes

### 10.1 Repository Structure

```
liims/
├── CLAUDE.md                    # Root instructions
├── SPEC.md                      # This document
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── CLAUDE.md                # Backend-specific instructions
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   └── dependencies.py
│   │   ├── services/
│   │   ├── tasks/              # Celery tasks
│   │   └── utils/
│   └── tests/
├── frontend/
│   ├── CLAUDE.md                # Frontend-specific instructions
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ui/             # shadcn components
│   │   │   └── shared/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/           # API clients
│   │   ├── stores/             # State management
│   │   ├── types/
│   │   └── utils/
│   └── public/
└── docs/
    ├── deployment.md
    ├── user-guide.md
    └── api-reference.md
```

### 10.2 Key Development Patterns

**Backend**:
- Async SQLAlchemy for all database operations
- Pydantic schemas for request/response validation
- Dependency injection for database sessions, current user
- Service layer for business logic (not in routes)
- Alembic migrations for all schema changes
- pg_trgm extension for fuzzy search
- Celery beat for materialized view refresh, watch folder scanning, backup monitoring, scheduled reports

**Frontend**:
- TanStack Query for all API calls (no raw fetch)
- React Router for navigation
- Zustand for global state (auth, notifications)
- shadcn/ui for all components
- Form handling with react-hook-form + zod
- Browser camera API for QR code scanning
- Service worker for PWA offline mode
- IndexedDB for offline data cache (event roster)

**Testing**:
- pytest for backend
- Vitest + Testing Library for frontend
- API integration tests with httpx

### 10.3 CLAUDE.md Guidelines

The root CLAUDE.md should include:
- Project context and purpose
- Stack overview
- Development commands
- Database migration workflow
- Testing commands
- Common patterns and conventions
- Links to module-specific CLAUDE.md files

---

## Appendix A: Sample Code Format

**Pattern**: `{GroupCode}-{ParticipantNumber}-{SampleType}`

**Group Codes**:
| Group | Age Range | Male | Female |
|-------|-----------|------|--------|
| 1 | 18-29 | 1A | 1B |
| 2 | 30-44 | 2A | 2B |
| 3 | 45-59 | 3A | 3B |
| 4 | 60-74 | 4A | 4B |
| 5 | 75+ | 5A | 5B |

**Participant Numbers by Site** (admin-configurable for new sites):
| Site | Range |
|------|-------|
| MSR | 001-100 |
| Sathya Sai Hospital | 101-200 |
| Baptist Hospital | 201-400 |
| Air Force Command Hospital | 401-500 |

**Sample Type Codes**:
| Type | Codes | Container | Label Stock |
|------|-------|-----------|-------------|
| Plasma | P1, P2, P3, P4, P5 | 2mL cryovials | Cryobabies LCRY-1700 (1.28×0.50") |
| Epigenetics | E1, E2, E3, E4 | 1.5mL MCT tubes | Novajens 84L (46×11mm) |
| Extra Blood | B1 | MCT tubes | Novajens 84L |
| RBC Smear | R1 | Glass slides | Novajens 84L |
| Cheek Swab | CS1 | Glass slides | Novajens 84L |
| Hair | H1, H2 | MCT tubes | Novajens 84L |
| Urine | U | Pre-labelled cryovials | Cryobabies LCRY-1700 |
| Stool Kit | ST | DecodeAge kit | N/A |

**Primary collection tube labels** (printed but not tracked as LIIMS samples):
| Tube Type | Labels per participant |
|-----------|-----------------------|
| EDTA | EDTA1, EDTA2, EDTA3, EDTA4 |
| SST | SST1, SST2 |
| Fluoride | FL1 |

**Examples**:
- `1A-001-P1` = Male 18-29, participant 1 from MSR, plasma aliquot 1
- `3B-205-E2` = Female 45-59, participant 205 from Baptist, epigenetics aliquot 2

---

## Appendix B: Consent Forms

1. **Household Consent** - Permission to approach household members
2. **Individual Consent** - Participant consent for study enrollment
3. **DBS Storage Consent** - Consent for dried blood sample storage and future use
4. **Proxy Interview Consent** - For participants requiring proxy (cognitive impairment). LIIMS stores only a boolean flag; proxy details are in the paper form.

Pre-translated consent and privacy notice PDFs available in 22 Indian languages (managed outside LIIMS).

---

## Appendix C: Compliance Checklist

### ICMR 2017 Guidelines

- [ ] Audit trail for all data modifications
- [ ] Consent documentation and tracking
- [ ] Material Transfer Agreement tracking (deferred — not currently needed)
- [ ] Ethics committee reporting capability (audit log PDF export)
- [ ] Data access logging
- [ ] Sample custody chain documentation (transport tracking)

### DPDP Act 2023

- [ ] Research exemption documentation (Section 17(2)(b))
- [ ] Data not used for individual decisions without consent
- [ ] Appropriate security measures (no data export, read replica access only)
- [ ] Data retention policies (soft delete, 7-year audit retention)
- [ ] Access controls and logging
- [ ] Privacy notice capability (22 languages — pre-translated PDFs outside LIIMS)

---

## Appendix D: SOP-Derived Processing Details

These details are extracted from the BHARAT Study SOPs and are hard-coded into the aliquoting and processing workflows.

### Plasma Processing Protocol
1. Select 2 highest-volume EDTA tubes (2-2.5mL each) per participant.
2. Must process within 30 minutes of blood draw.
3. Centrifuge at 3500 rpm for 15 minutes at room temperature.
4. Aspirate plasma layer without disturbing buffy coat.
5. Aliquot into 5 pre-labelled cryovials (P1-P5), 500µL each.
6. Not all samples yield 5 aliquots — record actual count.
7. Snap freeze in liquid nitrogen (2L steel LN2 can).
8. Transfer to ABDOS -80°C boxes (81 slots, 4 aliquots per participant per box).
9. **Monthly consolidation**: P1 and P2 transferred from -80°C to -150°C.
10. Cryovial caps colour-coded by age group.

### Epigenetics Processing Protocol
1. Aliquot from EDTA vials immediately after collection.
2. 4 aliquots × 570µL in 1.5mL MCT tubes (E1-E4).
3. Place in group-wise cardboard cryo-boxes (9×9 = 81 slots, one box per group).
4. **Rural**: On ice within 2 hours, transport same day on ice → -80°C.
5. **Urban**: Zip-lock bags at room temp → 4°C at IISc for 2-4 hours → -80°C.
6. MCT caps marked with sample code.

### Hair Sampling Protocol
1. Confirm: hair length ≥ 3cm, no dyes/mehndi.
2. Collect ~10 strands from posterior vertex region.
3. Cut close to scalp, trim to 3cm.
4. Place in MCT tube using forceps.
5. Room temperature storage, sort by group (1A-5B).
6. Urban and rural samples stored separately.

### Urine Collection Protocol
1. Pre-labelled cryovials with fill line (3.5-4mL).
2. Midstream urine collection.
3. Acceptance criteria: sterile container, correct label, ≤4mL, cold chain maintained.
4. Transport at 4°C in insulated boxes.
5. Store at -80°C, urban/rural stored separately.

### Cheek Swab / ICC Protocol
1. Rub sterile cotton swab against inner cheeks for 10 seconds.
2. Smear onto charged glass slide (labelled with volunteer ID + CS1).
3. Fix with 10% NBF for ~60 minutes at room temperature.
4. Transport in slide box on ice (4°C).
5. Store at 4°C until ICC processing.
6. ICC: Permeabilize (0.5% Triton X-100, 20-30 min) → Block (3% BSA, 1 hr) → Primary antibody (anti-CML/CEL 1:300, overnight 4°C) → Secondary antibody (1:700, 2 hr RT) → DAPI (1:1000, 5 min) → Mount (ProLong Gold) → Image (Olympus IX73, Aurox, Green 0.42s / Blue 0.26s exposure) → Analyze (Fiji/ImageJ).

### Field Event Operational Details

**Rural mass sampling** (40-60 volunteers/day):
- Entry/screening room: registration, wrist tags, vitals (BP, SpO2, temp, grip strength, height/weight, AGE reader), urine/stool kit collection.
- Sample collection room: up to 4 phlebotomists (venous blood), cheek swab, hair.
- Processing room: 2 centrifuges, 2 LN2 tanks, portable inverter generator.

**Urban scheduled sampling** (3-4 volunteers/day):
- Single room with functional zoning.
- Hospital clinical team handles registration, vitals, and metadata (ODK).
- Healthians provides phlebotomists.
- WhatsApp groups used for participant coordination (outside LIIMS).

### Partner Lab Coordination
- Partners informed 1 day in advance: location, date, time, sample count.
- Healthians: provides phlebotomists (urban), performs biochemical testing, generates reports.
- 1mg: no phlebotomists (rural phlebotomy via public health team), arranges sample pickup, performs biochemical testing.
- Reports: rural = printed by public health team for distribution; urban = emailed to volunteers.

---

## Appendix E: Exclusion Criteria (Reference)

These are captured in ODK forms, not in LIIMS. Listed here for reference:

- Recent infection or antibiotic consumption within last 2 weeks
- Alcohol consumption within past 1 week
- Chronic cardiac disorders (heart failure, cardiomyopathy, congenital/valvular heart disease)
- Chronic pulmonary disorders (interstitial lung disease, severe COPD, pulmonary hypertension)
- Chronic neurological disorders (recurrent stroke, neurodegenerative diseases, demyelinating disorders)
- Chronic GI disorders (chronic liver disease ≥ Stage 2, chronic pancreatitis, IBD)
- Chronic kidney disease (Stage 3+)
- Autoimmune diseases
- Organ transplant recipients
- Female participants menstruating on day of sampling

---

## Appendix F: ODK Metadata Collected (Reference)

These data elements are captured via ODK forms and synced to LIIMS. Listed here for field mapping reference:

**Personal Data**: Demographics, exercise patterns, dietary habits, smoking/alcohol/sleep, food frequency questionnaire, DASS-21 (depression/anxiety/stress), family medical history, WHO-QOL, MMSE (cognitive screening).

**Physical Examination**: Anthropometry (height, weight, BMI), head-to-toe assessment (skin, nails, hair), general physical exam (pallor, icterus, cyanosis, clubbing, lymphadenopathy, edema, thyroid), functional tests (grip strength, single breath test, AGE reader), systemic examination (cardiovascular, respiratory, abdominal, musculoskeletal), frailty assessment (FRAIL questionnaire, ≥60 years only).

**Rural vs Urban**: Rural collects personal data + frailty before sampling day; vitals/physical exam on sampling day. Urban collects everything on sampling day.

---

*Document Version: 2.0*
*Last Updated: February 2026*
*Authors: LIIMS Development Roundtable*
*Revision: Comprehensive update incorporating 20 rounds of stakeholder interviews and 11 BHARAT Study SOPs.*
