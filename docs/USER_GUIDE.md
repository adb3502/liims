# LIIMS User Guide

**Longevity India Information Management System**

A comprehensive laboratory information management system for the Longevity India longitudinal cohort study ("Bharat Study"). LIIMS tracks participants from enrollment through sample collection, processing, storage, and analysis across multiple collection sites.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Roles and Permissions](#2-roles-and-permissions)
3. [Getting Started](#3-getting-started)
4. [Dashboard](#4-dashboard)
5. [Participant Management](#5-participant-management)
6. [Sample Lifecycle](#6-sample-lifecycle)
7. [Storage Management](#7-storage-management)
8. [Field Operations](#8-field-operations)
9. [Partner Integrations](#9-partner-integrations)
10. [Instruments and Analysis](#10-instruments-and-analysis)
11. [Reports and Dashboards](#11-reports-and-dashboards)
12. [Notifications](#12-notifications)
13. [File Management](#13-file-management)
14. [Administration](#14-administration)
15. [Offline / Field Use](#15-offline--field-use)

---

## 1. System Overview

LIIMS manages the complete lifecycle of the Longevity India cohort study:

1. **Participant enrollment** -- from ODK field collection or manual data entry
2. **Consent tracking** -- household, individual, DBS storage, and proxy consents
3. **Sample collection and transport** -- registration, field collection, cold-chain transport
4. **Sample processing** -- aliquoting, volume tracking, processing timers
5. **Storage** -- hierarchical freezer/rack/box/position management with temperature monitoring
6. **Analysis** -- instrument runs, plate design, TECAN worklist generation, omics results
7. **ICC workflow** -- 10-step immunocytochemistry processing pipeline
8. **Partner lab integration** -- CSV import from Healthians, 1mg, Lalpath, DecodeAge
9. **Reporting** -- real-time dashboards, PDF reports, ad-hoc query builder
10. **Quality control** -- audit trails, QC templates, deviation tracking

### Participant Coding Convention

Each participant receives a code in the format: `{GroupCode}-{Number}`

- **Group Code:** A code like A1, A2, B1, etc., derived from the collection site and demographic group
- **Number:** Sequential participant number within the site's allocated range
- **Wave:** Study wave number (starting from 1)

### Sample Coding Convention

Samples are coded based on their parent participant code plus a type suffix (e.g., P1-P5 for plasma aliquots, E1-E4 for epigenetics, CS1 for cheek swab, R1 for RBC smear, H1 for hair, etc.).

---

## 2. Roles and Permissions

LIIMS uses role-based access control (RBAC) with seven roles, from most privileged to least:

| Role | Description | Key Capabilities |
|------|-------------|------------------|
| **super_admin** | System administrator | Full access to everything. Create users, manage settings, delete records, manage scheduled reports, configure system. |
| **lab_manager** | Laboratory manager | Manage participants, samples, storage, instruments, field events. Approve discard requests. View all data. Cannot create users or change system settings. |
| **lab_technician** | Laboratory staff | Register and process samples, manage storage positions, operate instruments, create ICC records, create plates. Cannot create participants or manage users. |
| **field_coordinator** | Field team lead | Create and manage field events, register participants, collect samples, issue stool kits, record transports. Cannot manage storage or instruments. |
| **data_entry** | Data entry operator | Create participants, record consents, register samples, digitize paper forms. Cannot manage storage, instruments, or approve discards. |
| **collaborator** | External collaborator | Read-only access to participants, samples, storage, instruments, and dashboards. Cannot create or modify anything. |
| **pi_researcher** | Principal investigator | Read access to all data plus query builder access, report generation, and field event viewing. Cannot modify operational data. |

### Permission Matrix (Summary)

| Feature | super_admin | lab_manager | lab_technician | field_coordinator | data_entry | collaborator | pi_researcher |
|---------|:-----------:|:-----------:|:--------------:|:-----------------:|:----------:|:------------:|:-------------:|
| View dashboard | X | X | X | X | X | X | X |
| Create participants | X | X | - | X | X | - | - |
| Edit participants | X | X | - | - | X | - | - |
| Delete participants | X | X | - | - | - | - | - |
| View participants | X | X | X | X | X | X | X |
| Create samples | X | X | X | X | - | - | - |
| Change sample status | X | X | X | X | - | - | - |
| Approve discards | X | X | - | - | - | - | - |
| Manage storage | X | X | X | - | - | - | - |
| Create freezers | X | X | - | - | - | - | - |
| Manage field events | X | X | - | X | - | - | - |
| View field events | X | X | - | X | X | - | X |
| Manage instruments | X | X | - | - | - | - | - |
| Operate instruments | X | X | X | - | - | - | - |
| Generate reports | X | X | - | - | - | - | X |
| Query builder | X | X | - | - | - | - | X |
| Manage users | X | - | - | - | - | - | - |
| System settings | X | - | - | - | - | - | - |
| Partner imports | X | X | - | - | - | - | - |
| Stool kits | X | X | - | X | - | - | - |
| Generate labels | X | X | X | X | X | - | - |

### Role-Based Access Details

#### super_admin
Full system access. Can:
- Create, edit, and delete any record
- Manage all users and assign roles
- Configure system settings (freezer thresholds, session timeouts, notification preferences)
- View audit logs and access logs
- Manage scheduled report automation
- Configure watch directories and file integrity verification
- Reset user passwords and manage account status
- Access system health dashboard

#### lab_manager
Laboratory operations leadership. Can:
- Create and edit participants, samples, and storage records
- View comprehensive dashboards and analytics
- Approve/reject discard requests
- Create new freezers and manage storage allocation
- Configure ODK sync and partner lab CSV imports
- Manage field events and field coordinators
- Approve instrument operations
- Generate reports and view analytics
- View all audit logs (read-only)
- Cannot modify system settings or manage users

#### lab_technician
Hands-on laboratory staff. Can:
- Register and process samples (status transitions)
- Create aliquots and track volumes
- Assign samples to storage positions
- Operate instruments and manage runs
- Create ICC records and advance processing steps
- Create plates and generate TECAN worklists
- View storage inventory and sample locations
- Cannot create freezers, approve discards, or manage users

#### field_coordinator
Field operations management. Can:
- Create and manage field events
- Register participants during field work
- Manage event rosters and participant check-ins
- Issue stool kits and record collection status
- Record sample transport details
- View field event dashboards and check-in metrics
- Bulk digitize paper form data
- Cannot manage storage, instruments, or approve discards

#### data_entry
Administrative data entry. Can:
- Create new participant records
- Record consents and demographic data
- Register samples
- Generate labels for samples
- View participant and sample data
- Cannot manage storage, instruments, or field operations

#### collaborator
External research partners. Can:
- View participant records (read-only)
- View sample inventory (read-only)
- View storage locations (read-only)
- View instrument dashboards (read-only)
- View analysis results (read-only)
- Cannot create, edit, or delete any records

#### pi_researcher
Principal investigator and senior research staff. Can:
- View all participant data
- View all sample and storage data
- View all analysis results
- Access query builder for ad-hoc data exploration
- Generate reports (enrollment, inventory, quality)
- View field event dashboards
- Cannot modify operational data or manage users

---

## 3. Getting Started

### Accessing LIIMS

**URL**: `http://localhost:3080` (within IISc network or via VPN)

The LIIMS application is self-hosted on the IISc lab workstation. To access it:

1. **From IISc Network**: Open your browser and navigate to `http://localhost:3080`. You should see the login page.
2. **From Remote Location**: Connect to IISc VPN first, then navigate to the same URL.
3. **Mobile/Tablet**: The application works on tablets with modern browsers (Chrome, Safari, Firefox). Recommended for field use.

### Logging In

1. On the login page, enter your **email address** (the email used to create your account).
2. Enter your **password**.
3. Click **"Log In"**.

**If you forget your password**, contact your system administrator. Do not attempt to reset via email as LIIMS does not support password reset links (passwords are managed directly by admins for security).

**Your account is created by a super admin.** If you do not have credentials, contact your lab manager or system administrator to request account creation.

### Account Security

- **Password requirements**: Minimum 8 characters. Recommended: 12+ characters with mix of uppercase, lowercase, numbers, and symbols.
- **Account lockout**: After 5 failed login attempts within 15 minutes, your account is temporarily locked for 15 minutes. Try again later.
- **Session expiry**: Sessions expire after 24 hours (configurable by admin). You will be automatically logged out and need to log in again.
- **Concurrent sessions**: Limited to 3 active sessions. If you log in from a 4th device, the oldest session is automatically ended. (Useful to prevent account sharing.)
- **Changing your password**:
  1. Click your profile icon or name in the top-right corner
  2. Select **"Change Password"**
  3. Enter your current password and new password
  4. Click **"Update"**
  - All existing sessions are revoked when you change your password. You will need to log in again on all devices.

### First Login - Navigation Tour

Upon first login, you will see:

1. **Dashboard**: The main overview page showing enrollment, inventory, field ops, and quality metrics.
2. **Sidebar Navigation** (left side):
   - **Dashboard** -- Main dashboard
   - **Participants** -- Participant registry and consent management
   - **Samples** -- Sample lifecycle management
   - **Storage** -- Freezer and biobank management
   - **Field Ops** -- Field events and check-ins
   - **Partners** -- Partner lab integrations (lab results, ODK sync, stool kits)
   - **Instruments** -- Instrument management and analysis
   - **Reports** -- Analytics dashboards, report generation, query builder
   - **Admin** (if you're an admin) -- User management, settings, audit logs, file manager

3. **Top-Right Menu**:
   - **Notifications Bell**: Shows unread notifications (click to dismiss)
   - **Profile Dropdown**: Change password, view account info, log out
   - **Help** (if available): Link to this documentation

### Account Security

- **Password requirements:** Minimum 8 characters.
- **Account lockout:** After too many failed login attempts, your account is temporarily locked for 15 minutes.
- **Session expiry:** Sessions expire after the configured period (default 24 hours). You will need to log in again.
- **Concurrent sessions:** Limited to 3 active sessions by default. Logging in from a fourth device will require an existing session to end.
- **Changing your password:** Go to your profile menu (top-right) and select "Change Password". All existing sessions are revoked when you change your password.

### Navigation

The application uses a sidebar navigation with the following sections:

- **Dashboard** -- System overview with key metrics
- **Participants** -- Participant registry and consent management
- **Samples** -- Sample lifecycle management
- **Storage** -- Freezer, rack, and box management
- **Field Ops** -- Field event planning and check-in
- **Partners** -- Partner lab imports, ODK sync, stool kits
- **Instruments** -- Instrument management, runs, plates, ICC
- **Reports** -- Dashboards, report generation, query builder
- **Admin** -- User management, settings, audit logs (admin only)

The notification bell icon (top-right) shows your unread notification count.

---

## 4. Dashboard

The main dashboard provides a real-time overview of the study across multiple dimensions. Dashboard data is cached and refreshed every 15 minutes for fast loading. Most users see the dashboard upon login.

### Overview Panel (Top of Page)

Quick summary cards showing:
- **Total Participants** -- Enrolled count across all sites and waves
- **Total Samples** -- Count across all statuses and types
- **Active Freezers** -- Number of operational freezer units
- **Recent Field Events** -- Count of field events in the last 30 days

Each card links to the corresponding detail view.

### Enrollment Dashboard

Detailed view of participant enrollment progress:
- **Total Enrollment** -- Line chart showing cumulative enrollment over time (by day, week, or month)
- **By Site** -- Bar chart comparing enrollment numbers across sites (IISc, Jigani, Jayanagar)
- **Demographics** --
  - Age group distribution (18-29, 30-44, 45-59, 60-74, 75+) as a horizontal bar chart
  - Sex distribution (Male vs Female) as a pie or doughnut chart
  - Site-wise age/sex breakdown
- **Wave Progress** -- Status of Wave 1 enrollment vs targets
- **Filters** -- Filter by site, age group, or date range to drill down

### Inventory Dashboard

Sample tracking and storage capacity overview:
- **Sample Counts by Type** --
  - Plasma, Epigenetics, Hair, Cheek Swab, RBC Smear, Urine, Stool Kit, Extra Blood
  - Shown as bar chart or table
- **Sample Status Distribution** --
  - Breakdown by status: collected, received, processing, stored, reserved, in_analysis, depleted, discarded
  - Shows current bottlenecks (e.g., many samples in "processing" longer than expected)
- **Storage Utilization** --
  - Freezer capacity as a stacked bar chart (free vs occupied positions)
  - Breakdown by temperature: -150C, -80C, +4C, room temp
  - Alerts when freezer exceeds 90% capacity
- **Low-Volume Warnings** --
  - Samples with volume < 100 microliters (configurable threshold)
  - Linked to sample detail for volume management
- **Pending Processing** -- Count of samples registered but not yet in "processing" status

### Field Operations Dashboard

Field event tracking and participation metrics:
- **Upcoming Events** -- List of planned field events for the next 30 days
  - Event name, date, site, expected participant count
  - Status indicator (planned, in_progress, completed)
- **Check-In Rates** --
  - For each recent event, percentage of roster participants who checked in
  - Trend line showing check-in rates over events
- **Collection Completion** --
  - For each event, percentage of participants who had samples collected
  - Breakdown by sample type (plasma, epigenetics, etc.)
- **Transport Status** --
  - Samples in transit (recorded transport time but not yet received)
  - Average cold chain time for recent events

### Instrument Dashboard

Laboratory analysis status and queuing:
- **Active Runs** --
  - List of instrument runs currently in progress or scheduled
  - Instrument name, run type (proteomics, metabolomics, etc.), sample count, status
- **Run Success Rate** --
  - Percentage of completed runs marked as "success" vs "failed"
  - Trend over the last 30 days
- **Samples Queued** --
  - Count of samples awaiting analysis by instrument/run type
  - Average wait time in queue

### Quality Dashboard

Data quality and assurance metrics:
- **QC Pass/Fail Rates** --
  - Percentage of processed samples passing QC by sample type
  - Identifies sample types with quality issues
- **Deviations** --
  - Count of open deviations by category (temperature excursion, protocol deviation, consent withdrawal)
  - Average resolution time for closed deviations
- **ICC Processing Status** --
  - Distribution of ICC records by processing step (received, fixation, permeabilization, etc.)
  - Identifies bottlenecks in the ICC workflow
- **Omics Data Coverage** --
  - Percentage of samples with completed omics results (proteomics, metabolomics)
  - Coverage by sample type and site

### Dashboard Customization

Some dashboards allow filtering and drill-down:
- Click a bar or data point to filter related views
- Export dashboard data as CSV or PDF
- Save custom dashboard configurations (planned feature)

---

## 5. Participant Management

### Registering a Participant

**Manual Registration** (for offline enrollments or paper-based data entry):

1. Navigate to **Participants** in the sidebar.
2. Click **"+ New Participant"** or **"Create"** button.
3. Fill in the required fields:
   - **Collection Site** -- Select from dropdown: IISc, Jigani, or Jayanagar
   - **Participant Code** -- System auto-generates (e.g., A1-001, B2-042) based on site and allocated range, or you can manually enter if provided by field coordinator
   - **Group Code** -- Demographic/collection group identifier (e.g., A1, B2, C3). Used for storage organization and stratification.
   - **Name** -- Full name (optional, used for reference only)
   - **Age Group** -- Select one: 18-29, 30-44, 45-59, 60-74, 75+
   - **Sex** -- Male or Female
   - **Date of Birth** (optional) -- Helps verify age calculations and is useful for partner lab matching
   - **Enrollment Date** -- Date participant was enrolled (usually same as field event date)
   - **Wave** -- Study wave number (default: 1). Multi-wave support for future expansion.
4. Click **Save**.

**Automated Registration** (via ODK Central):

Participants can also be enrolled automatically from ODK field forms. See [Partner Integrations > ODK Central Sync](#odk-central-sync) for setup details.

### Searching Participants

The participant list supports multiple search and filter capabilities:

**Fuzzy Search**:
- Type any part of the participant code, name, or even a typo
- Example: Searching "A1-05" finds "A1-050", "A1-051", "A1-052", etc.
- Example: Searching "Joh" finds "John Smith", "Johanna Doe", etc.

**Filters** (click "Filters" button to reveal):
- **Collection Site** -- Filter by IISc, Jigani, or Jayanagar
- **Age Group** -- 18-29, 30-44, 45-59, 60-74, 75+
- **Sex** -- Male, Female
- **Wave** -- Wave 1, Wave 2, etc.
- **Enrollment Status** -- (future: enrolled, withdrawn, completed)
- Multiple filters can be combined

**Sorting**:
- Click any column header to sort ascending/descending
- Available columns: Code, Name, Site, Age Group, Sex, Enrollment Date, Sample Count

**Pagination**:
- Results are paginated (default 20 per page)
- Use page navigation controls at the bottom to move through pages
- Change "Per Page" dropdown to show 10, 20, 50, or 100 results per page

**URL Parameters** (for advanced users):
- Search: `?search=A1-05`
- Page: `?page=2&per_page=50`
- Combined: `?search=A1&site=iisc&page=1&per_page=20`

### Participant Detail View

Clicking a participant row opens the detail view showing comprehensive information:

**Basic Information** (top of page):
- Participant code (e.g., A1-001)
- Full name
- Date of birth
- Age group
- Sex
- Collection site
- Enrollment date
- Enrollment source (manual, ODK, partner import, etc.)
- Wave number

**Consents Section**:
- List of all consents recorded for this participant
- Status of each consent (given, withdrawn, not recorded)
- For each consent record:
  - Consent type
  - Date given/withdrawn
  - Witness name (who recorded the consent)
  - Form version
  - Notes

**Sample Inventory**:
- Count of samples by type: Plasma, Epigenetics, Hair, Cheek Swab, RBC Smear, Urine, Stool Kit, Extra Blood
- Count by status: Collected, Received, Processing, Stored, In Analysis, Completed
- Quick links to view all samples for this participant

**Completion Metrics**:
- Percentage of data fields completed (enrollment vs samples vs analysis)
- Pending consents or missing data

**Actions** (buttons in detail view):
- **Add Consent** -- Record a new consent event
- **Register Sample** -- Register a new sample for this participant
- **Edit Participant** -- Update demographic information (name, age group, etc.)
- **View Samples** -- Jump to the sample list filtered for this participant
- **Generate Labels** -- Print labels for samples for this participant

### Managing Consents

Consents track ethical approvals and data/sample use permissions:

**Recording a Consent**:

1. Open the participant detail page.
2. Click **"Add Consent"** in the Consents section.
3. Select the consent type:
   - **Household Consent** -- Household head/guardian consent for all household members
   - **Individual Consent** -- Individual participant's personal consent
   - **DBS Storage** -- Consent specifically for storing dried blood spots
   - **Proxy Interview** -- Consent for collecting data via a proxy (family member, guardian) instead of participant
4. Record:
   - **Consent Given?** -- Yes or No
   - **Date** -- Date consent was obtained (signature date)
   - **Witness Name** -- Name of field staff who recorded consent
   - **Form Version** -- Version of consent form used
   - **Notes** -- Any special circumstances (language barrier, interpreter used, etc.)
5. Click **Save**.

**Consent Withdrawal** (recording a consent withdrawal):

1. Open the participant detail page.
2. Find the consent in the Consents list.
3. Click the consent to edit or click **"Withdraw"**.
4. Record:
   - **Withdrawal Date** -- Date participant withdrew consent
   - **Reason** -- (optional) Why they withdrew (privacy concerns, health issue, changed mind, etc.)
   - **Effective For** -- Which samples/data does withdrawal apply to? (e.g., "All future analysis", "Only genomic sequencing", etc.)
5. Click **Save**.

**Consent Impact**:
- Samples from a participant with withdrawn consent may be marked as restricted or discarded depending on the consent terms
- Lab managers receive a notification when consent is withdrawn so they can update sample status
- Audit trail is maintained to show when and why consent changed

---

## 6. Sample Lifecycle

### Sample Types

| Type | Code Suffix | Description | Quantity | Typical Use |
|------|-------------|-------------|----------|-------------|
| Plasma | P1-P5 | Blood plasma (after centrifugation) | 5 aliquots | Biochemistry, metabolomics, proteomics |
| Epigenetics | E1-E4 | Whole blood for methylation/epigenetic analysis | 4 aliquots | DNA methylation, epigenetic clocks |
| Extra Blood | B1 | Backup whole blood | 1 aliquot | Contingency if other samples fail |
| RBC Smear | R1 | Red blood cells on glass slide | 1 slide | Immunocytochemistry (ICC), microscopy |
| Cheek Swab | CS1 | Buccal epithelial cells (oral swab) | 1 sample | Alternative DNA source, saliva microbiome |
| Hair | H1, H2 | Hair strands with follicle root | 2 samples | Heavy metal analysis, stress biomarkers |
| Urine | U1 | Spot urine sample | 1 sample | Metabolomics, kidney function markers |
| Stool Kit | SK | Stool collection kit (DecodeAge) | 1 kit | Gut microbiome analysis, metagenomics |

**Sample Code Format**: {Participant Code}-{Sample Type Code}
- Example: A1-001-P1 (Participant A1-001, Plasma aliquot 1)
- Auto-generated by system when sample is registered

### Sample Status Workflow

The workflow diagram below shows how samples progress through the system:

```
┌─────────────┐
│ registered  │  Sample record created, awaiting collection
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ collected   │  Collected at field event or in lab
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ transported     │  In cold chain to lab (optional)
└──────┬──────────┘
       │
       ▼
┌─────────────┐
│ received    │  Received at lab, registered in LIMS
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ processing  │  Active processing (aliquoting, extraction, etc.)
└──────┬──────┘
       │
       ├────────────────────────────────────────┐
       │                                        │
       ▼                                        ▼
┌──────────────┐                         ┌──────────────┐
│ stored       │  Stored in freezer      │ in_analysis  │  Sent to instrument/partner
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       ├────────────────────────────────────────┤
       │                                        │
       ▼                                        ▼
┌──────────────────┐                   ┌──────────────────┐
│ pending_discard  │  Marked for       │ completed        │  Analysis done, results
└──────┬───────────┘  discard (needs   └──────────────────┘  received and stored
       │              approval)
       │
       ├─ approved ─────▶ discarded
       │
       └─ rejected ─────▶ stored

Additional terminal states:
- depleted: All volume used up
- discarded: Approved for discard, no longer usable
```

**Status Definitions**:
- **registered**: Initial state, sample record exists but not yet collected
- **collected**: Sample physically collected from participant
- **transported**: Sample in transit to lab (e.g., in cooler with cold chain tracking)
- **received**: Arrived at lab, checked in, inspected for quality
- **processing**: Active work (extracting DNA, aliquoting, etc.). Timer starts here.
- **stored**: In freezer, reserved for future use
- **reserved**: Allocated to a specific analysis but not yet removed from storage
- **in_analysis**: Sent to instrument or partner lab, awaiting results
- **completed**: Analysis done, results received, final data archived
- **pending_discard**: Technician requested discard, awaiting lab manager approval
- **discarded**: Approved for discard, physically destroyed, no longer usable
- **depleted**: Entire volume used up (0 microliters remaining)

### Registering a Sample

**Manual Registration** (for field-collected or lab-prepared samples):

1. Navigate to **Samples** > **Register** or from a participant detail page, click **"Register Sample"**.
2. **Select Participant**: Search by code (e.g., "A1-001"). System will show matching participants.
3. **Choose Sample Type**: Plasma, Epigenetics, Hair, Cheek Swab, RBC Smear, Urine, Stool Kit, or Extra Blood.
4. **Enter Collection Details**:
   - **Collection Date/Time** -- When sample was collected (at field event or in lab)
   - **Collector Name** -- Name of staff who collected the sample
   - **Collection Site** -- IISc, Jigani, or Jayanagar
   - **Initial Volume** (optional) -- Volume in microliters (e.g., 500 µL for plasma)
   - **Notes** -- Any relevant info (e.g., "Difficult draw, second attempt")
5. Click **Register**.

The system will auto-generate the sample code (e.g., A1-001-P1 for first plasma aliquot). Sample status is set to "registered" (not yet collected unless you mark it otherwise).

**Sample List View**:

Navigate to **Samples** to browse all samples:
- **Search**: Type sample code, participant code, or sample type
- **Filters**: Filter by status, sample type, participant, collection site, date range
- **Sorting**: Click column headers to sort
- **Pagination**: Navigate pages or change per-page count
- **Bulk Actions**: Select multiple samples to bulk-change status or bulk-assign to storage

### Changing Sample Status

**Manual Status Transitions**:

1. Open the sample detail page.
2. View the current status and available next statuses (only valid transitions are shown).
3. Click the status transition button (e.g., "Mark as Collected", "Mark as Received", "Move to Processing").
4. Enter optional information:
   - **Notes** -- Why the change, any issues encountered
   - **Location/Context** -- Where the sample is (which freezer, which technician, etc.)
   - **DateTime** -- Timestamp of the transition (defaults to now)
5. Confirm the transition.

**Invalid Transitions**: The system prevents impossible transitions. For example, you cannot go from "processing" back to "collected" — the system enforces forward progress through the workflow.

**Status Transition Examples**:
- Field technician: collected (at event) → transported (in cooler) → received (arrives at lab)
- Lab technician: received → processing (aliquoting) → stored (in freezer)
- Analysis: stored → in_analysis (sent to mass spec) → completed (results returned)

### Processing Timer & Alerts

When a sample enters the **"processing"** status:
1. A timer automatically starts
2. If processing exceeds the configured threshold (default: 7 days), a **warning notification** is generated
3. Lab staff are alerted to resolve the bottleneck
4. Admin can adjust the threshold in **Admin** > **Settings** > **Processing Timer Threshold**

### Generating Aliquots

When you have a bulk sample (e.g., whole blood), you typically split it into aliquots for different analyses:

1. Open the parent sample detail page (e.g., whole blood sample).
2. Click **"Generate Aliquots"** button.
3. The system displays the pre-configured aliquot scheme for that sample type:
   - Plasma: 5 aliquots (P1-P5)
   - Epigenetics: 4 aliquots (E1-E4)
   - Hair: 2 aliquots (H1-H2)
   - etc.
4. The system auto-creates child samples with individual codes and inherits metadata (participant, collection date, etc.)
5. Each aliquot starts with equal initial volume (original volume / aliquot count)
6. Click **"Confirm"** to create all aliquots at once.

After aliquot generation, each aliquot is a separate sample with its own status, volume tracking, and storage location.

### Volume Tracking

Track the volume of samples to ensure sufficient material for analysis:

1. Open the sample detail page.
2. View **Current Volume** field (shows remaining volume in microliters).
3. **Withdraw Volume** (when you use part of the sample):
   - Click **"Withdraw Volume"** button
   - Enter the volume withdrawn (in µL)
   - Enter the reason: DNA extraction, proteomics analysis, quality check, depleted, spill/loss, other
   - Optionally note the date and technician
   - Click **"Confirm"**
4. The system automatically:
   - Subtracts the volume from the current total
   - Updates the sample status to "depleted" if volume reaches 0 µL
   - Logs the withdrawal in the audit trail
5. **View Volume History**: Click **"Volume History"** to see all withdrawals with dates, amounts, and reasons.

**Important**: Negative volumes are not allowed. If you try to withdraw more than the remaining volume, the system rejects the transaction.

### Discard Workflow

When a sample needs to be removed from the study (contamination, expired, consent withdrawal, etc.):

**Step 1 - Technician Requests Discard**:
1. Open the sample detail page
2. Click **"Request Discard"** button
3. Select the reason:
   - **Contamination**: Physical or microbial contamination detected
   - **Depleted**: All volume used up
   - **Consent Withdrawal**: Participant withdrew consent for this sample type
   - **Expired**: Sample beyond acceptable storage/use period
   - **Damage**: Tube leakage, breakage, etc.
   - **Other**: Specify in notes
4. Add optional notes
5. Click **"Request Discard"**
6. Sample status changes to **"pending_discard"**

**Step 2 - Lab Manager Reviews & Approves/Rejects**:
1. Lab manager receives a notification that a discard request is pending
2. Lab manager navigates to **Samples** > **Discard Requests**
3. Reviews the pending request:
   - Sample code and participant
   - Reason
   - Technician notes
4. **Approve**: Click **"Approve Discard"** to authorize destruction
   - Sample status changes to **"discarded"**
   - Lab notes the approval
5. **Reject**: Click **"Reject"** to send the sample back to "stored" status
   - Used if the technician made a mistake or if the issue was resolved
   - Lab manager can add notes explaining why it wasn't discarded

**Step 3 - Physical Destruction**:
- Once approved, the sample is physically destroyed (incinerated or biohazard disposal per protocol)
- Lab manager notes the destruction date in the system (optional audit trail)

**Audit Trail**:
- All discard requests, approvals, and rejections are logged with timestamps and user info
- Cannot be edited or deleted — creates a permanent record

---

## 7. Storage Management

### Storage Hierarchy

```
Freezer (e.g., "-80C Freezer #1")
  |
  +-- Rack (e.g., "Rack A")
       |
       +-- Box (e.g., "Plasma Box 001", 9x9 grid)
            |
            +-- Position (row 1, col 1) -> Sample
            +-- Position (row 1, col 2) -> [empty]
            ...
```

### Freezer Types

| Type | Description |
|------|-------------|
| minus_150 | Ultra-low temperature (-150C) |
| minus_80 | Standard deep freeze (-80C) |
| plus_4 | Refrigerator (+4C) |
| room_temp | Room temperature storage |

### Creating a Freezer

Only **lab_manager** and **super_admin** roles can create freezers.

1. Navigate to **Storage** > **Freezers**.
2. Click **"+ New Freezer"** or **"Create Freezer"**.
3. Enter the following information:
   - **Name**: e.g., "-80C Freezer #1" or "Ultra-low -150C Unit"
   - **Type**: Select from dropdown:
     - **minus_150** -- Ultra-low freezer (-150°C)
     - **minus_80** -- Standard deep freezer (-80°C)
     - **plus_4** -- Refrigerator (+4°C)
     - **room_temp** -- Room temperature storage (18-25°C)
   - **Location**: Physical location (building, room, shelf), e.g., "Lab Wing B, Room 203, Bench 1"
   - **Manufacturer & Model**: e.g., "Panasonic MDF-U731VH" (optional, for maintenance tracking)
   - **Serial Number** (optional): For warranty/service tracking
4. Click **Save**.

The freezer is created but empty. Now you need to add racks and boxes.

### Creating Racks and Boxes

**Adding Racks**:

1. Open a freezer detail page.
2. Scroll to the "Racks" section.
3. Click **"Add Rack"** to add a single rack or **"Batch Create Racks"** for multiple racks.
4. For single rack:
   - Enter rack name (e.g., "Rack A", "Rack 1")
   - Click **Save**
5. For batch create:
   - Enter the number of racks to create (e.g., 10)
   - Specify naming pattern (e.g., "Rack A", "Rack B", etc.)
   - Click **Save**

**Adding Boxes**:

1. Open a rack detail page (click on the rack in the freezer).
2. Scroll to the "Boxes" section.
3. Click **"+ Add Box"**.
4. Enter the following:
   - **Name**: e.g., "Plasma Box 001" or "Epigenetics Box 005"
   - **Box Type**: Select from pre-configured types:
     - **cryo_81** -- 9x9 grid (81 positions), standard cryovial box
     - **cryo_100** -- 10x10 grid (100 positions), alternative layout
     - **abdos_81** -- 9x9 grid (81 positions), ABDOS standard
     - **custom** -- Custom grid, specify rows and columns
   - **Grid Dimensions** (if custom type): Rows and Columns (e.g., 8 rows x 12 columns = 96-well plate format)
   - **Sample Type** (optional): If this box is dedicated to one sample type, e.g., "Plasma" or "Epigenetics"
5. Click **Save**.

The system automatically creates grid positions based on the box type. A 9x9 box creates 81 positions (row 1 col 1 through row 9 col 9), etc.

### Assigning Samples to Storage

**Manual assignment:**
1. Open a box detail page to see the grid.
2. Click an empty position.
3. Search for and select a sample.
4. Confirm assignment.

**Auto-assign:**
1. From a sample detail page, click **"Auto-Assign to Storage"**.
2. Select the target freezer and optionally a group code.
3. The system finds the best available position (same group code, most-filled box first).

**Bulk assign:**
1. Select multiple samples from the sample list.
2. Click **"Bulk Assign"**.
3. The system assigns them to the next available positions.

### Box Grid View

The box detail page shows a visual grid of all positions:
- **Green** -- Occupied by a sample (shows sample code on hover)
- **Empty** -- Available for assignment
- Click any position to assign or unassign a sample.

### Consolidation

To consolidate samples from one box to another (e.g., from -80C to -150C):
1. Open the source box.
2. Click **"Consolidate"**.
3. Select the target box.
4. All samples are moved to the target, filling from the first empty position.

### Temperature Monitoring

1. Navigate to a freezer detail page.
2. View the temperature event log.
3. To record an event (excursion, failure, maintenance, recovery):
   - Click **"Record Temperature Event"**
   - Enter event type, start time, observed temperature, and notes
4. Events flagged as requiring sample review generate notifications.
5. Lab managers can add resolution notes to close temperature events.

### Storage Search

1. Navigate to **Storage** > **Search**.
2. Enter a sample code.
3. The system returns the full storage path: Freezer > Rack > Box > Position (row, column).

---

## 8. Field Operations

Field Operations (Field Ops) manages all activities related to participant collection in the field.

### Field Events

Field events represent a scheduled collection day at a study site. Examples:
- "Urban Scheduled Collection at IISc, Feb 15, 2025 (Wave 1, Urban Group 1)"
- "Rural Mass Collection at Jigani, Feb 20, 2025 (Wave 1, Rural Group A)"

**Creating a Field Event** (field_coordinator and above):

1. Navigate to **Field Ops** > **Events**.
2. Click **"+ New Event"** or **"Create Event"**.
3. Fill in the following:
   - **Event Name**: e.g., "Rural Collection - Jigani Site, Batch 3"
   - **Event Date**: When the event will occur (or occurred)
   - **Collection Site**: IISc, Jigani, or Jayanagar
   - **Event Type**:
     - **rural_mass** -- Unscheduled mass collection (participants walk in)
     - **urban_scheduled** -- Pre-registered, scheduled appointments
   - **Expected Participant Count**: Estimated number to show up
   - **Field Coordinator**: Primary person leading the event
   - **Wave**: Wave 1, Wave 2, etc.
   - **Description** (optional): Notes about the event
4. Click **Save**.

The event is created with status **"planned"**.

**Event Status Workflow**:
- **planned** → **in_progress** (when event begins) → **completed** (when event ends)
- Alternative: **planned** → **cancelled** (if event doesn't happen)

### Managing Participants at Events

**Adding Participants to an Event**:

1. Open the event detail page.
2. Scroll to the "Roster" section.
3. Click **"Add Participants"** or **"Manage Roster"**.
4. **Search and select** participants to add:
   - Type participant code or name
   - System shows matching participants
   - Click each to add to the roster
5. Alternatively, **upload a CSV** with participant codes (one per line) to bulk-add
6. Click **Save Roster**.

The roster now shows all participants scheduled for this event with columns:
- Participant Code
- Name
- Age Group
- Sex
- Check-in Status (not_checked_in, checked_in, samples_collected)
- Number of Samples Collected
- Check-in Time

**Viewing and Filtering the Roster**:
- Search by participant code or name
- Filter by check-in status
- Sort by code, name, check-in time
- Print the roster for field use

### Check-In

During a field event, participants "check in" and staff record data about the visit:

**Performing a Check-In**:

1. Open the event detail page.
2. Find the participant in the roster.
3. Click **"Check In"** or the participant row.
4. A check-in form appears with fields:
   - **Check-In Time** (auto-filled with current time, can adjust)
   - **Wrist Tag Issued?** -- Did you issue an identifying wrist tag? (Yes/No)
   - **Consent Verified?** -- Did you review and verify the participant's consent form? (Yes/No)
   - **Samples Collected?** -- Which sample types were collected?
     - Checkboxes for: Plasma, Epigenetics, Hair, Cheek Swab, RBC Smear, Urine
     - For each selected, optionally record volume
   - **Partner Lab Samples?** -- If blood is being drawn by partner lab (Healthians), record the partner name and whether drawn
   - **Stool Kit Issued?** -- Was a stool collection kit (DecodeAge) given? (Yes/No)
   - **Stool Kit Code** -- If issued, the unique kit code for tracking
   - **Urine Collected?** -- Was a urine sample collected? (Yes/No)
   - **Notes** -- Any special circumstances (difficulty drawing blood, participant concerns, etc.)
   - **Samples in Transit** -- If transporting samples now, record destination and method
5. Click **"Complete Check-In"** or **"Save"**.

The system now:
- Records the check-in time and staff member
- Registers sample records for each sample type collected
- Auto-assigns sample codes
- Issues a stool kit tracker entry if applicable
- Updates the roster status to "checked_in" and "samples_collected"

**Check-In Workflow Example**:
1. Participant A1-001 arrives at field event
2. Staff member (field coordinator) opens the event, finds A1-001 in the roster
3. Clicks "Check In" and records:
   - Check-in time: 10:15 AM
   - Wrist tag: Yes
   - Consent verified: Yes
   - Samples: Plasma, Epigenetics, RBC Smear (3 collections)
   - Stool kit: Yes, Code SK-12345
   - Notes: "Participant in good health, easy collection"
4. System registers 3 sample records:
   - A1-001-P1 (plasma) -- status "collected"
   - A1-001-E1 (epigenetics) -- status "collected"
   - A1-001-R1 (RBC smear) -- status "collected"
5. System issues stool kit SK-12345 for A1-001

### Bulk Digitization

For offline or paper-based collection, you can batch-enter data after the event:

1. Open the event detail page.
2. Click **"Bulk Digitize"** or **"Batch Data Entry"**.
3. A spreadsheet-like interface appears with rows for each participant on the roster.
4. For each participant, fill in columns:
   - Check-in time
   - Samples collected (checkboxes or sample codes)
   - Volumes (if known)
   - Partner lab info
   - Stool kit info
   - Notes
5. Click **"Submit Batch"** to process all entries at once.

The system validates all entries and:
- Registers all samples for each participant
- Issues stool kits
- Updates event roster
- Reports any errors (e.g., invalid participant code, duplicate entries)

**Use Case**: Field staff collected data on paper during a rural collection. Back at the office, a data entry operator transcribes all paper forms into LIIMS via bulk digitization instead of clicking check-in one by one.

### Field Event Dashboard

Navigate to **Field Ops** > **Dashboard** to see:
- **Upcoming Events** (next 30 days) with expected participant counts
- **Recent Events** (last 30 days) with actual check-in rates and completion percentages
- **Check-In Trends** over time (line chart showing check-in % per event)
- **Collection Rates** by sample type per event
- **Transport Summary** -- samples currently in transit from field to lab

---

## 9. Partner Integrations

LIIMS integrates with external data sources to enrich participant and sample data without manual re-entry. All integrations follow a review-before-acceptance model to ensure data quality.

### Partner Lab CSV Import (Healthians, 1mg, Lalpath, DecodeAge)

Import blood test results from partner laboratory networks.

**Import Workflow:**

1. Navigate to **Partners** > **Lab Results** > **Import**.
2. Select the partner lab from the dropdown (Healthians, 1mg, Lalpath, DecodeAge).
3. Upload the CSV file (max 10 MB). The CSV should contain:
   - Participant identifiers (ID, code, name, DOB)
   - Test names (lab-specific names)
   - Test results (values)
   - Collection/report dates
   - Optional: reference ranges, units

4. **Auto-Detection**: The system automatically:
   - Detects CSV column structure
   - Attempts to match participant codes (fuzzy matching on names/DOBs if code is unavailable)
   - Maps partner test names to canonical test names via the test dictionary
   - Identifies mismatches and ambiguities

5. **Preview**: Review the mapping preview:
   - Shows matched and unmatched participants
   - Shows matched and unmapped tests
   - Highlights suspicious mappings (low confidence scores)

6. **Configure Mappings** (if needed):
   - Manually map columns if auto-detection failed
   - Manually map unmatched tests to canonical names
   - Resolve participant ambiguities

7. **Execute Import**: Confirm and process the import.
   - All matched results are created in LIIMS
   - Results are linked to participants
   - Partner test names are logged for audit trail

8. **View Results**:
   - Navigate to **Partners** > **Lab Results** > **Results List**
   - Browse all imported results with match status: auto_matched, manual_mapped, unmatched
   - Click any result to view details: participant, test name, value, units, reference range, collection date
   - Filter by partner lab, participant, test name, or date range
   - Sort by match status to review unmatched records

**Important Notes**:
- Unmatched participants are reported but do NOT create new participant records. Contact the partner lab to clarify the participant code.
- Unmatched test names remain in the system for manual review. Lab managers can create new canonical tests if needed.
- All import activity is audit-logged. Import history can be viewed at **Partners** > **Lab Results** > **Import History**.

### Canonical Test Dictionary

Maintain standardized test definitions across all partner laboratories.

**Dictionary Maintenance:**

1. Navigate to **Partners** > **Canonical Tests**.
2. Browse or search existing tests.
3. **Create a new test**:
   - Name (e.g., "Hemoglobin")
   - Category (e.g., "Hematology")
   - Standard unit (e.g., "g/dL")
   - Reference range (optional): min and max values for normal adult range
4. **Add partner aliases**: For each partner lab, record alternative names (e.g., Healthians: "HGB", 1mg: "HB").
5. **Save**.

During partner CSV imports, the system uses these aliases to auto-match test names. If a partner test name is not in the dictionary, it remains unmatched and requires manual review.

**Test Categories** (examples):
- Hematology (RBC, WBC, hemoglobin, etc.)
- Chemistry (electrolytes, kidney function, liver function, etc.)
- Immunology (antibodies, immune markers)
- Metabolomics (lipids, glucose, amino acids, etc.)
- Epigenetics (methylation, clock age, etc.)
- Genomics (SNP arrays, sequencing results, etc.)

### Stool Kit Tracking (DecodeAge Partnership)

Track stool kit distribution, collection, and result reporting via DecodeAge, a specialized metagenomics partner.

**Kit Workflow:**

1. Navigate to **Partners** > **Stool Kits**.
2. **Issue a Kit**:
   - Select a participant from the roster
   - Optionally link to a field event (auto-populates event date)
   - Record the kit code (provided by DecodeAge)
   - Record issue date
   - Click "Issue"
   - Sample status changes to "issued"

3. **Track Kit Status**: Kit progresses through these statuses:
   - **issued**: Kit given to participant
   - **pickup_scheduled**: DecodeAge has scheduled pickup
   - **collected_by_decodeage**: DecodeAge has collected the kit from participant
   - **processing**: Kit undergoing metagenomics analysis
   - **results_received**: Analysis complete, results returned to LIIMS

4. **Update Status**:
   - Open the stool kit detail page
   - Click "Update Status"
   - Select the new status
   - Add optional notes (e.g., "Delayed pickup due to weather")

5. **View Results** (when available):
   - Stool kit results appear in **Partners** > **Lab Results** > **Results List** under DecodeAge
   - Results include microbial taxonomy, abundance counts, diversity metrics
   - Results are linked to the participant and associated sample

6. **Filter and Search**:
   - Filter by participant, status, field event, or issue date
   - Search by participant code or kit code
   - View metrics: total kits issued, percentage collected, percentage results received

**Typical Timeline**:
- Issued at field event: Day 0
- Pickup scheduled by DecodeAge: Days 1-3
- Collected: Days 3-7
- Processing: Days 7-30
- Results received: Days 30-45

### ODK Central Sync (Field Data Collection)

LIIMS integrates with ODK Central for automated participant enrollment from field forms.

**Setup (Admin)**:

1. Navigate to **Admin** > **ODK Sync Settings**.
2. Enter ODK Central credentials:
   - ODK Central URL
   - Project ID
   - Username and password
3. **Map ODK Forms**: Link each ODK form to LIIMS participant creation fields:
   - ODK field name (e.g., `individual_name`) → LIIMS field (e.g., `participant_name`)
   - Specify data type conversions (date format, numeric ranges, etc.)
   - Mark required vs optional fields
4. **Save configuration**.

**Automatic Sync**:

- Every 60 minutes (configurable), LIIMS pulls new submissions from ODK Central
- New submissions are processed and matched to existing participants or used to create new participants
- Submission status is tracked: pending, processed, failed, duplicate
- Failures are logged with detailed error messages

**Manual Sync**:

1. Navigate to **Partners** > **ODK Sync**.
2. Click **"Trigger Sync Now"** to immediately pull latest submissions (useful if urgent).

**View Submissions**:

1. Navigate to **Partners** > **ODK Sync** > **Submissions**.
2. Browse all synced submissions with:
   - ODK submission ID
   - Field submission timestamp
   - Processing status
   - Matched participant (if any)
   - Created/updated participant details
3. **View Details**: Click a submission to see:
   - Original ODK form data
   - Parsed LIIMS fields
   - Participant created/updated
   - Any validation errors

**Sync Logs**:

1. Navigate to **Partners** > **ODK Sync** > **Sync History**.
2. View a chronological log of sync operations:
   - Sync timestamp
   - Count of submissions found
   - Count successfully processed
   - Count of failures/duplicates
   - Link to detailed sync report
3. Drill into any sync to review individual submission outcomes

**Troubleshooting**:

- **Failed syncs**: Check ODK Central connectivity. Review error logs for field mapping issues.
- **Duplicate participants**: The system identifies duplicate ODK submissions (same phone ID, same timestamp). Mark as duplicate to prevent double-enrollment.
- **Missing participants**: If an ODK submission references a participant code not in LIIMS, sync fails. Manually create the participant first, then re-sync.

---

## 10. Instruments and Analysis

### Instrument Management

1. Navigate to **Instruments**.
2. The dashboard shows all instruments, their types, and active run counts.
3. **Create instrument** (Admin): Name, type (liquid_handler, mass_spec, other), manufacturer, model, software, location, watch directory path.

### Instrument Runs

A "run" represents a single instrument execution (e.g., a mass spectrometry analysis batch):

1. Navigate to **Instruments** > **Runs**.
2. Click **"+ New Run"** to create a run linked to an instrument.
3. Set run type (proteomics, metabolomics, plate_prep, other).
4. **Add samples** to the run manually or via plate assignment.
5. **Start run**: Click "Start" when the instrument begins.
6. **Complete run**: Mark as completed (success or failure) when done.
7. **Upload results**: Attach omics result data.

**Run Status Workflow:** planned -> in_progress -> completed (or failed)

### Plate Design

Plates are used for mass spectrometry and liquid handler workflows:

1. Navigate to **Instruments** > **Plates**.
2. **Create a plate**: Name, link to a run, set dimensions (default 8x12 = 96-well).
3. **Assign wells manually**: Select well positions and assign samples.
4. **Stratified randomization**: Click "Randomize" to automatically distribute samples across the plate, stratified by demographics (age group, sex, site) to avoid batch effects.
5. **Apply QC template**: Select a QC template to auto-place QC, blank, and pooled samples at standard positions.
6. **View grid**: See the plate layout with sample codes in each well, color-coded by type.

### TECAN Worklist Generation

For TECAN Freedom EVOware liquid handlers:

1. Open a plate detail page.
2. Click **"Generate TECAN Worklist"**.
3. Choose format: JSON (for preview) or CSV (for import into EVOware).
4. The CSV can be downloaded and loaded directly into the liquid handler software.

### Omics Results

After a run completes:

1. Upload results via the run detail page or view them in **Instruments** > **Omics**.
2. Browse result sets (proteomics, metabolomics).
3. Query individual results by sample, participant, or feature ID.
4. Results include feature name, quantification value, imputation flag, and confidence score.

### ICC Workflow

Immunocytochemistry processing follows a 10-step workflow:

1. Navigate to **Instruments** > **ICC**.
2. **Create ICC record**: Link to a sample (typically RBC smear), set initial status to "received".
3. **Advance through steps**: Click "Advance" to move to the next step:
   - received -> fixation -> permeabilization -> blocking -> primary_antibody -> secondary_antibody -> dapi_staining -> mounted -> imaging -> analysis_complete
4. At each step, record relevant details:
   - **Fixation**: Reagent, duration, datetime
   - **Antibody**: Panel name, secondary antibody
   - **Imaging**: Microscope settings (JSONB)
   - **Analysis**: Software used, results (JSONB)
5. Attach image file paths at the imaging step.

---

## 11. Reports and Dashboards

### Real-Time Dashboards

Navigate to **Reports** to access pre-built dashboards:

- **Enrollment Dashboard**: Enrollment trends, demographics, site comparisons
- **Inventory Dashboard**: Sample counts by type/status, storage utilization
- **Quality Dashboard**: QC pass rates, deviation counts, ICC progress

### On-Demand PDF Reports

1. Navigate to **Reports** > **Report Generator**.
2. Select report type:
   - **Enrollment Summary** -- Demographics, site breakdown, trends
   - **Inventory Summary** -- Samples by type/status, storage utilization, low-volume warnings
   - **Quality Summary** -- QC rates, deviations, ICC processing, omics coverage
   - **Compliance** -- Consent coverage, audit trail summary, DPDP compliance checklist
3. Optionally apply filters.
4. Click **"Generate"** to download the PDF.

### Scheduled Reports

Administrators can schedule automatic report generation and email delivery:

1. Navigate to **Admin** > **Scheduled Reports**.
2. Click **"+ New Schedule"**.
3. Configure:
   - Report name and type
   - Cron schedule (e.g., `0 8 * * 1` for every Monday at 8 AM)
   - Recipients (email addresses)
   - Optional filters
4. Preview the report before activating.

### Query Builder

For ad-hoc data exploration:

1. Navigate to **Reports** > **Query Builder**.
2. Select an entity (participants, samples, etc.).
3. Add filters (field, operator, value).
4. Select which columns to display.
5. Click **"Execute"** to view results.
6. Click **"Export CSV"** to download results as a spreadsheet.

Available entities depend on the system configuration. Each entity shows its queryable fields with data types.

---

## 12. Notifications

### Notification Center

Click the bell icon in the top-right corner to open the notification center.

### Notification Types

| Type | Severity | Who Receives | Trigger |
|------|----------|--------------|---------|
| ODK Sync Failure | Critical | super_admin, lab_manager | ODK sync task fails |
| Freezer Capacity Warning | Warning | lab_manager, lab_technician | Freezer exceeds capacity threshold |
| Freezer Temp Event | Critical | lab_manager, lab_technician | Temperature excursion recorded |
| Consent Withdrawal | Warning | lab_manager | Participant withdraws consent |
| Import Error | Warning | lab_manager | Partner CSV import has failures |
| Backup Stale | Critical | super_admin | No recent database backup detected |
| Discard Request | Info | lab_manager | Technician requests sample discard |
| Processing Timer Exceeded | Warning | lab_technician | Sample in processing too long |
| System Alert | Varies | Varies | System-generated alerts |
| File Discovered | Info | lab_manager | New file found in watch directory |
| File Integrity Failed | Critical | super_admin, lab_manager | SHA-256 checksum mismatch on NAS file |

### Managing Notifications

- Click a notification to view details.
- Click **"Mark as Read"** to dismiss a single notification.
- Click **"Mark All Read"** to dismiss all.
- Filter by type, severity, or read/unread status.

---

## 13. File Management

### Overview

LIIMS tracks files stored on the lab NAS (network-attached storage). Files are never uploaded through the browser -- they are discovered by periodic scans of configured watch directories. Only file metadata (path, size, SHA-256 checksum, category) is stored in the database.

### Watch Directories

Administrators configure directories on the NAS to monitor:

1. Navigate to **Admin** > **File Manager**.
2. Click **"Add Watch Directory"**.
3. Enter the NAS path, file pattern (e.g., `*.raw`, `*.mzML`), category, and optionally link to an instrument.
4. Scans run automatically every 5 minutes. You can also trigger a manual scan.

### File Categories

| Category | Description |
|----------|-------------|
| instrument_output | Raw data from instruments |
| partner_data | Partner lab data files |
| icc_image | Microscopy images from ICC |
| report | Generated reports |
| omics_data | Omics analysis output |
| other | Uncategorized files |

### Browsing Files

1. Navigate to **Admin** > **File Manager** (or view files from related entity pages).
2. Search by file name, filter by category or instrument.
3. View file metadata: path, size, checksum, discovery date, processing status.

### File Association

Link discovered files to LIIMS entities:

1. Open a file detail.
2. Click **"Associate"**.
3. Select entity type (instrument_run, sample, plate, etc.) and entity ID.

### Integrity Verification

LIIMS periodically verifies file integrity by recalculating SHA-256 checksums:

- Automatic verification runs hourly via Celery.
- Manual verification: Click **"Verify Integrity"** on any file.
- If a checksum mismatch is detected, a critical notification is generated.

---

## 14. Administration

### User Management

*Role required: super_admin (full), lab_manager (view only)*

**Viewing Users**:

1. Navigate to **Admin** > **Users**.
2. View all system users with columns:
   - Email
   - Name
   - Role (super_admin, lab_manager, lab_technician, field_coordinator, data_entry, collaborator, pi_researcher)
   - Status (Active, Inactive, Locked)
   - Last Login (date/time)
   - Created Date
3. **Search**: Type email or name to filter
4. **Filter**: Filter by role or status
5. **Sort**: Click column headers to sort

**Creating a New User** (super_admin only):

1. Click **"+ New User"** or **"Create User"**.
2. Enter:
   - **Email** -- Must be unique; this is the login email
   - **Full Name** -- User's name
   - **Role** -- Select from 7 roles (see [Roles and Permissions](#2-roles-and-permissions))
   - **Initial Password** -- Temporary password (user should change on first login)
   - **Active** -- Check to activate immediately (uncheck to create inactive)
3. Click **Save**.

The user receives no automatic email. You must communicate the email and initial password to them separately (via secure channel).

**Editing a User** (super_admin only):

1. Click the user row to open the detail page.
2. Edit fields:
   - **Full Name** -- Update as needed
   - **Role** -- Change role (e.g., promote from lab_technician to lab_manager)
   - **Active** -- Check/uncheck to activate/deactivate
3. Click **Save**.

Changes take effect immediately. If the user is currently logged in, they remain logged in but permissions update for their next action.

**Deactivating a User** (soft delete):

1. Open the user detail page.
2. Uncheck the **"Active"** checkbox.
3. Click **Save**.

The user cannot log in. Their historical data, audit trails, and records are preserved in the system. You can reactivate at any time.

**Resetting a User's Password** (super_admin only):

1. Click the user row.
2. Click **"Reset Password"** button.
3. Enter a new temporary password.
4. Click **Save**.

An email is NOT sent. You must communicate the new password to the user separately. They should change it immediately upon next login.

**Viewing User Activity**:

Click **"Last Login"** link to see details of the user's most recent session (date, time, IP address).

### System Settings

*Role required: super_admin*

Settings control system-wide behavior. Be careful when changing settings as they affect all users.

**Accessing Settings**:

1. Navigate to **Admin** > **Settings**.
2. Settings are organized by category (expand each category).

**Setting Categories**:

- **Session Management**:
  - **Session Timeout** (minutes): How long before sessions expire (default: 1440 = 24 hours)
  - **Max Concurrent Sessions**: Maximum active sessions per user (default: 3)
  - **Failed Login Attempts**: Allowed attempts before lockout (default: 5)
  - **Lockout Duration** (minutes): How long account is locked after failed attempts (default: 15)

- **Sample Processing**:
  - **Processing Timer Threshold** (hours): Alert if sample in "processing" status longer than this (default: 168 = 7 days)
  - **Default Aliquot Count**: Number of aliquots per sample type by default

- **Storage**:
  - **Freezer Capacity Alert Threshold** (%): Alert when freezer exceeds this % capacity (default: 90)
  - **Low Volume Threshold** (microliters): Alert for samples below this volume (default: 100)

- **Field Operations**:
  - **ODK Sync Interval** (minutes): How often to sync with ODK Central (default: 60)
  - **Field Event Roster Timeout** (hours): Time to cache roster data for offline use

- **Partner Integrations**:
  - **Partner Import Max File Size** (MB): Maximum CSV file size (default: 10)
  - **Canonical Test Auto-Match Confidence** (%): Minimum similarity score to auto-match test names (default: 80)

- **Notifications**:
  - **Email SMTP Server**: For sending notifications (set by admin)
  - **Backup Alert Enabled**: Enable/disable stale backup warnings

- **Audit & Compliance**:
  - **Audit Log Retention** (days): How long to keep audit logs (default: 730 = 2 years)
  - **Enable Data Anonymization**: For DPDP compliance (future feature)

**Editing a Setting**:

1. Find the setting by category.
2. Click **"Edit"** or the value field.
3. Enter the new value. Type validation is enforced (string, number, boolean, JSON).
4. Click **Save**.

All changes are audit-logged with timestamp, who made the change, old value, and new value.

**Resetting to Defaults**:

Click **"Reset to Default"** to revert a setting to its original value.

### Audit Logs

*Role required: super_admin, lab_manager (read-only)*

Audit logs provide a complete history of all system changes for compliance and troubleshooting.

**Viewing Audit Logs**:

1. Navigate to **Admin** > **Audit Logs**.
2. View a chronological list (most recent first) of all recorded changes.
3. Each entry shows:
   - **Timestamp**: When the change occurred
   - **User**: Email of the user who made the change
   - **Action**: What was done (create, update, delete, approve, transition_status, etc.)
   - **Entity Type**: What was changed (participant, sample, freezer, user, setting, etc.)
   - **Entity ID**: ID of the entity changed
   - **Old Value**: Previous value (for updates)
   - **New Value**: New value (for updates)
   - **IP Address**: User's IP when they made the change
   - **Notes**: Additional context if provided

**Filtering Audit Logs**:

- **User**: Filter by specific user email
- **Action**: Filter by action type (create, update, delete, approve, etc.)
- **Entity Type**: Filter by what was changed (participant, sample, freezer, etc.)
- **Date Range**: Filter by date range (e.g., last 7 days, January 2025)
- **Entity ID**: Find all changes to a specific record (e.g., participant A1-001)

**Examples**:
- Find all changes to a specific participant: Filter Entity Type = "participant", Entity ID = "A1-001"
- Find who changed system settings: Filter Action = "update_setting"
- Find all discard approvals: Filter Action = "approve_discard"
- Find activity by a user: Filter User = "user@iisc.ac.in"

**Exporting Audit Logs**:

Click **"Export as CSV"** to download audit logs for external audits or record-keeping.

**Retention Policy**:

Audit logs are retained for the period configured in System Settings (default: 730 days = 2 years). Older logs are automatically archived but not deleted.

### Labels

Generate printable labels for sample tubes and slides:

1. Navigate to the label generation feature (accessible from sample registration or directly).
2. Enter participant codes and collection date.
3. Choose either:
   - **Full ZIP**: All 5 label documents (cryovial, epigenetics, samples, EDTA, SST/Fl/Blood)
   - **Single group**: One specific label type
4. Download the generated .docx file(s) and print on A4 paper.

### QR Codes

1. Generate QR codes for individual samples from the sample detail page.
2. Batch-generate QR codes for multiple samples (downloaded as ZIP).
3. Scan QR codes using the lookup endpoint to quickly identify samples and their storage locations.

---

## 15. Offline / Field Use

### PWA Support

The LIIMS frontend is designed as a Progressive Web App (PWA) for field use:

- **Offline capability**: Core field operations (check-in, basic data entry) can work offline.
- **Sync**: When connectivity is restored, offline mutations are synced to the server.

### Offline Sync Mechanism

1. **Pull data**: Before going to a field event, the app pulls relevant participant and sample data for offline caching.
2. **Work offline**: Record check-ins and collection data without connectivity.
3. **Push changes**: When back online, push all offline changes. The system detects conflicts (if someone else edited the same record while you were offline).
4. **Conflict resolution**: Server timestamp wins. Conflicts are reported back and can be manually reviewed.

### Field Event Workflow (Typical Day)

1. **Before the event**: Pull latest data for offline use. Print labels and prepare materials.
2. **At the event**:
   - Open the field event in LIIMS.
   - As participants arrive, check them in (record check-in time, verify consent, issue wrist tag).
   - Record samples collected for each participant.
   - Issue stool kits as needed.
   - Record partner lab sample handoffs.
3. **During transport**: Record the transport (origin, destination, cold chain method, departure/arrival times).
4. **Back at lab**: Sync offline data. Begin sample receiving and processing.
5. **Post-event**: Use bulk digitize to enter any remaining paper-form data.
