# BHARAT Study SOPs -- Comprehensive Summary

> Generated from 11 Standard Operating Procedures in `BHARAT SOPS/`

---

## 1. Study Overview

The **BHARAT Study (Longevity India)** is a multi-site, cross-sectional aging and longevity research study conducted by the **Indian Institute of Science (IISc), Bengaluru**. The study collects biological samples and clinical/lifestyle metadata from volunteers across five age groups (18--75+) at both urban hospital sites and rural community camps.

**Study goals**: Investigate biological aging markers including epigenetic patterns, advanced glycation end products (AGEs), metabolomics, and biochemistry across diverse Indian populations.

**Participant groups** (10 groups by age x sex):

| Age Range | Group Code (Male) | Group Code (Female) |
|-----------|-------------------|---------------------|
| 18--29    | 1A                | 1B                  |
| 30--44    | 2A                | 2B                  |
| 45--59    | 3A                | 3B                  |
| 60--74    | 4A                | 4B                  |
| 75+       | 5A                | 5B                  |

**Participant code format**: `{group}{sex}-{number}` e.g. `1A-001`

**Centre-wise number ranges**:
- MSR (M.S. Ramaiah Memorial Hospital): 001--100
- Sathya Sai Hospital (SSSSMH): 101--200
- Baptist Hospital (BBH): 201--400
- Air Force Command Hospital (CHAF): 401--500
- Additional centres: non-overlapping ranges assigned by coordination team

---

## 2. SOP Index

| # | SOP Title | Category | File |
|---|-----------|----------|------|
| 1 | Volunteer Identification | Recruitment & Enrollment | `SOP- Volunteer identification.docx` |
| 2 | On-Ground Setup (Rural & Urban) | Field Operations | `On-Ground Setup_SOP.docx` |
| 3 | Metadata Collection | Data Collection | `BHARAT STUDY_Metadata collection SOP.docx` |
| 4 | Sample Code Generation & Labelling | Sample Management | `LABELS_SOP_BHARAT STUDY.docx` |
| 5 | Plasma Sample Collection & Biobanking | Lab Processing -- Blood | `SOP- Plasma.docx` |
| 6 | Epigenetics Sample Preparation (Rural) | Lab Processing -- Blood | `Epigenetics Rural SOP_BHARAT STUDY.docx` |
| 7 | Epigenetics Sample Preparation (Urban) | Lab Processing -- Blood | `Epigenetics Urban SOP_BHARAT STUDY.docx` |
| 8 | Urine Sample Collection | Sample Collection | `SOP- Urine sample collection.docx` |
| 9 | Hair Sample Collection | Sample Collection | `Hair Sampling_SOP.docx` |
| 10 | AGE Detection in Cheek Cells (ICC) | Lab Processing -- Assay | `BHARAT_Study_SOP_AGE_Detection_in_Cheek Cells.docx` |
| 11 | Communication with Partner Teams | Coordination & Logistics | `SOP- partner team.docx` |

---

## 3. Sample Types and Collection Details

### 3.1 Blood Samples

**Collection**: 4 EDTA vacutainers per participant, plus SST and Fluoride tubes.

**Tubes per participant** (from label SOP):
- EDTA1--EDTA4 (4 tubes)
- SST1--SST2 (2 tubes, serum separator)
- FL1 (1 tube, fluoride/glucose)

**Derived aliquots from blood**:

| Aliquot Type | Code | Count | Volume | Storage | Container |
|-------------|------|-------|--------|---------|-----------|
| Plasma | P1--P5 | 5 | 500 uL each | -80C (P3-P5), -150C (P1-P2) | 2mL cryovials |
| Epigenetics (whole blood) | E1--E4 | 4 | 570 uL each | -80C | 1.5mL MCTs |
| Extra blood | B1 | 1 | -- | -80C | 1.5mL MCT |
| RBC (smear) | R1 | 1 | -- | -- | 1.5mL MCT |

**Plasma processing**:
- Centrifuge 2 highest-volume EDTA vials at 3500 rpm for 15 min at RT
- Must process within 30 minutes of blood draw
- Aspirate plasma layer without disturbing buffy coat
- Snap-freeze in liquid nitrogen immediately after aliquoting
- Color-coded caps by age group
- Hospital: process ~4 participants/day; Rural mass sampling: batch of 4 per centrifuge run (8-vial capacity)

**Plasma long-term biobanking**:
- P1, P2 transferred monthly to -150C freezers (15 racks, 10 slots each, 81-slot boxes)
- P3, P4, P5 remain at -80C
- Storage at IISc Central Facility (E Wing)

**Epigenetics processing**:
- Aliquot from EDTA vials immediately after collection
- Rural: store on ice, transport to IISc same day, place in -80C
- Urban: transport at RT in zip-lock bags, temp store at 4C for 2-4h, then -80C
- Must be on ice within 2 hours (rural)
- Group-wise storage in 9x9 cardboard cryo-boxes (81 slots)

### 3.2 Urine Samples

- **Code**: U (e.g., `1A-001-U`)
- **Container**: 5 mL cryovials (Tarsons), pre-labelled with fill line at 3.5--4 mL
- **Collection**: Midstream urine, collected by participant using provided sterile container
- **Transport**: In insulated boxes at 4C to IISc
- **Storage**: -80C (urban and rural stored separately)
- **Labels**: Cryogenic labels (Cryobabies LCRY-1700)
- **Processing**: Currently stored only; metabolomics analysis pending instrumentation
- **Acceptance criteria**: Sterile container, correct label, volume ~4 mL, cold-chain maintained

### 3.3 Hair Samples

- **Code**: H1--H2 (e.g., `1A-001-H1`)
- **Collection**: ~10 strands from posterior vertex of scalp, cut close to scalp
- **Exclusions**: Hair length <3 cm, or volunteer uses hair dyes/mehndi
- **Standardization**: Trim to exactly 3 cm from scalp end
- **Container**: 1.5 mL MCT tubes
- **Transport**: Room temperature
- **Storage**: Room temperature, sorted by group (1A-5B), urban/rural stored separately
- **Processing**: Currently stored only; no downstream analysis commenced
- **Labels**: Normal labels (NovaJet 84L)

### 3.4 Cheek Cells (Buccal Swab)

- **Code**: CS1 (e.g., `1A-001-CS1`)
- **Collection**: Sterile cotton swab rubbed against inner cheeks for 10 seconds
- **Processing on-site**: Cells smeared onto charged glass slide, fixed with 10% NBF for ~60 min at RT
- **Slide prep**: Two squares marked with hydrophobic pen (assay control + AGE analysis)
- **Transport**: Slide box on ice (4C)
- **Storage**: 4C until ICC staining and imaging
- **Labels**: Normal labels (NovaJet 84L)
- **Downstream assay**: Immunocytochemistry (ICC) for Advanced Glycation End Products (AGEs)
  - Permeabilization (0.5% Triton X-100, 20-30 min)
  - Blocking (3% BSA, 1h)
  - Primary antibody (anti-CML, 1:300, overnight 4C)
  - Secondary antibody (Alexa Fluor 488, 1:700, 2h RT)
  - DAPI counterstain (1:1000, 5 min)
  - Imaging: Olympus IX73 semi-confocal with Aurox/Visionary software
  - Analysis: Fiji (ImageJ) for fluorescence intensity comparison

### 3.5 Stool Samples

- **Kits supplied by**: DecodeAge (industrial partner)
- **Distribution**: Kits given to participants in advance
- **Urban**: Collected from participant residences the following day
- **Rural**: Participants bring to sampling site on collection day
- **Processing**: Handled by DecodeAge (details not in SOPs)

### 3.6 Complete Label Set Per Participant (22 labels)

**Normal labels** (NovaJet 84L, 46x11mm):
- EDTA1, EDTA2, EDTA3, EDTA4 (4)
- SST1, SST2 (2)
- FL1 (1)
- E1, E2, E3, E4 (4) -- epigenetics aliquots
- B1 (1) -- extra blood
- R1 (1) -- RBC
- CS1 (1) -- cheek swab
- H1, H2 (2) -- hair

**Cryogenic labels** (Cryobabies LCRY-1700, 1.28x0.50"):
- P1, P2, P3, P4, P5 (5) -- plasma
- U (1) -- urine

**Total: 22 labels per participant** (16 normal + 6 cryogenic)

---

## 4. Field Operations Workflow

### 4.1 Volunteer Identification and Recruitment

**Urban**:
- Recruitment via Google Forms, social media, word of mouth, outreach events
- Phone screening for eligibility
- Enrolled participants added to batch-specific WhatsApp group
- 3--4 participants scheduled per day
- Fasting and pre-visit instructions sent via WhatsApp
- Stool kit demonstration video shared

**Rural**:
- Door-to-door household visits by public health team, 4--5 days before sampling
- Target: minimum 60 eligible participants per sampling session
- In-person or phone communication
- Urine containers, stool kits, and zip-lock bags distributed during recruitment visit

**Exclusion criteria** (both settings):
- Recent infection or antibiotics (past 2 weeks)
- Alcohol consumption (past 1 week)
- Chronic cardiac/pulmonary/neurological/GI/kidney disease (specified thresholds)
- Autoimmune diseases
- Organ transplant recipients
- Menstruating females on sampling day

### 4.2 On-Ground Setup

#### Rural Setup (3 rooms, ~40--60 volunteers/day)

**Room 1 -- Entry & Screening** (Public Health Team):
- Identity/eligibility verification
- Wrist tag issuance
- Urine + stool kit collection and logging
- Vitals: temperature (IR thermometer), SpO2 (pulse oximeter), BP (digital monitor)
- Anthropometry: height, weight, grip strength (dynamometer)
- AGEs reader measurement

**Room 2 -- Sample Collection** (IISc Team + Phlebotomists):
- Venous blood collection (up to 4 phlebotomists simultaneously)
- Cheek swab collection
- Hair sample collection
- Sequential flow through stations

**Room 3 -- Sample Processing** (IISc Team):
- Plasma separation (centrifugation)
- Blood aliquoting for epigenetics and RBC smears
- Extra blood aliquot storage
- Equipment: 2 liquid nitrogen tanks, 2 centrifuges, portable inverter generator

#### Urban Setup (1 room with functional zones, 3--4 volunteers/day)

Same procedures as rural but all in one clinical area with spatial separation:
- Zone 1: Registration, screening, metadata (Hospital Clinical Team)
- Zone 2: Sample collection (IISc + Healthians phlebotomists)
- Zone 3: Sample processing (IISc Team)

### 4.3 Metadata Collection (ODK)

**Platform**: Open Data Kit (ODK) Collect mobile app, syncing to ODK Central server

**Data collected**:
- Personal/socio-demographic details
- Exercise patterns (frequency, duration, type)
- Dietary/lifestyle habits (smoking, alcohol, sleep)
- Dietary patterns (veg/non-veg, meal frequency, spices, nutritional diversity)
- Food frequency questionnaire
- DASS-21 (depression, anxiety, stress)
- Family medical history (diabetes, CVD, cancer)
- WHO Quality of Life (WHO-QOL) questionnaire
- Mini-Mental State Examination (MMSE) for cognitive screening

**Physical examination**:
- Anthropometry: height, weight, BMI
- Head-to-toe assessment (skin, nails, hair)
- General physical exam (pallor, icterus, cyanosis, clubbing, lymphadenopathy, edema, thyroid)
- Functional tests: grip strength, single breath test, AGE reader, MMSE
- Systemic exam: cardiovascular, respiratory, abdominal, musculoskeletal
- Frailty assessment (age 60+): Simple FRAIL questionnaire

**Workflow differences**:
- Rural: Personal info + frailty assessment collected days before sampling; vitals + physical exam on sampling day
- Urban: Everything collected on sampling day (~40 min per volunteer)

**Data submission**: Forms finalized on device, sent to ODK Central server, IISc downloads as CSV/ZIP

---

## 5. Lab Processing Workflows

### 5.1 Blood Processing Timeline (Critical)

```
Blood draw
  |-- Within 30 min --> Centrifuge for plasma (3500 rpm, 15 min)
  |-- Immediately ----> Aliquot epigenetics (4x 570uL from EDTA)
  |-- Immediately ----> Extra blood aliquot (B1)
  |-- Immediately ----> RBC smear (R1)
  |
  v
Plasma aliquoting (P1-P5, 500uL each)
  |-- Immediately --> Snap freeze in liquid nitrogen
  |
  v
Transfer to -80C storage boxes
  |
  v (monthly)
P1, P2 --> -150C long-term biobank
P3, P4, P5 --> remain at -80C
```

### 5.2 Cheek Cell ICC Workflow

```
Cheek swab collection
  --> Smear on charged glass slide
  --> Fix with 10% NBF (60 min, RT)
  --> Transport on ice (4C)
  --> Store at 4C
  |
  v (lab processing)
Permeabilize (0.5% Triton X-100, 20-30 min)
  --> Block (3% BSA in 0.1% TX-100, 1h)
  --> Primary Ab (anti-CML 1:300, overnight 4C)
  --> Secondary Ab (AF488 1:700, 2h RT)
  --> DAPI (1:1000, 5 min)
  --> Mount (ProLong Gold)
  --> Image (Olympus IX73, green + blue channels)
  --> Analyze (Fiji/ImageJ)
  --> Record in AGE tracker
```

---

## 6. Key Personnel and Roles

| Role | Responsibilities | Setting |
|------|-----------------|---------|
| **IISc Research Team** | Code generation, tube labelling, sample processing, aliquoting, storage, tracking, overall coordination | Both |
| **Hospital Clinical Team** | Registration, eligibility screening, metadata collection (ODK), vitals, physical exam | Urban |
| **Public Health Team** | Door-to-door recruitment, eligibility screening, consent, metadata, kit distribution, report distribution | Rural |
| **Phlebotomists (Healthians)** | Venous blood collection, barcode management | Urban |
| **Phlebotomists (Public Health Team)** | Venous blood collection | Rural (when 1mg is lab partner) |
| **Field Coordinator** | On-ground logistics and workflow management | Rural |
| **Study Coordinator** | Deviation reporting, SOP compliance oversight | Both |
| **IISc Administrator** | ODK server management, QR code distribution, form updates | Both |

---

## 7. Partner Organizations

| Partner | Role | Setting |
|---------|------|---------|
| **Healthians** | Biochemistry lab partner: provides phlebotomists, conducts biochemical testing, generates reports | Primarily urban |
| **1mg** | Biochemistry lab partner: sample pickup and testing (no phlebotomists) | Primarily rural |
| **DecodeAge** | Industrial partner: supplies stool collection kits | Both |

**Report distribution**:
- Urban: Lab reports emailed directly to volunteers
- Rural: Reports shared with public health team, printed and distributed to volunteers

---

## 8. Equipment and Materials Summary

### Field Equipment
- Dynamometer (grip strength)
- IR thermometer (body temperature)
- AGEs reader (DS Medica)
- Digital BP monitor
- Pulse oximeter
- Height and weight scale
- Wrist tags for participant identification

### Lab Equipment
- 2 Centrifuges (8-vial capacity)
- 2 Liquid nitrogen tanks (2L steel cans for snap-freezing, 25L cans for transport)
- -80C deep freezers (SANYO)
- -150C freezers (15 racks, 10 slots each) for long-term biobanking
- Olympus IX73 semi-confocal microscope with Aurox imaging system
- Portable inverter generator (Honda EU30IS, 3000W)
- Dedicated pipettes (Eppendorf: 1-2.5uL, 2-20uL, 20-200uL, 100-1000uL)

### Consumables
- EDTA vacutainers (blood collection)
- SST vacutainers (serum)
- Fluoride tubes (glucose)
- 2mL cryovials (Tarsons, for plasma and urine)
- 1.5mL MCTs (Tarsons Clicklok, for epigenetics/blood/RBC)
- 9x9 cardboard cryo-boxes (Abdos P20606, 81 slots)
- ABDOS -80C storage boxes (81 slots, for plasma)
- NovaJet 84L labels (46x11mm, normal)
- Cryobabies LCRY-1700 labels (1.28x0.50", cryogenic)
- Sterile cotton swabs (LabAids, for cheek cells)
- Charged glass slides (for cheek cell ICC)
- Hydrophobic pen (for slide marking)
- Biohazard waste bags (Tarsons)
- Nitrile gloves (Kimtech)

### Reagents (Cheek Cell ICC)
- 10% Neutral Buffered Formalin (fixation)
- PBS (wash buffer base)
- BSA (SRL 85171, blocking)
- Triton X-100 (HIMEDIA MB031, permeabilization)
- Anti-Carboxymethyl Lysine antibody (abcam ab125145)
- Alexa Fluor 488 secondary antibody (Invitrogen A-11008)
- DAPI (Thermo Fisher D1306, nuclear stain)
- ProLong Gold (mounting medium)

### Software
- ODK Collect (mobile data collection)
- ODK Central (server/data management)
- Python (label generation)
- Fiji/ImageJ (image analysis)
- Visionary (microscope image acquisition)
- Excel (sample tracking, inventory)

---

## 9. Storage Temperature Map

| Sample Type | Temporary Storage | Transport | Long-term Storage |
|-------------|------------------|-----------|-------------------|
| Plasma (P1-P2) | Liquid nitrogen (snap freeze) | Liquid nitrogen (25L can) | -150C |
| Plasma (P3-P5) | Liquid nitrogen (snap freeze) | Liquid nitrogen (25L can) | -80C |
| Epigenetics (rural) | Ice (within 2h) | Ice packs (same day) | -80C |
| Epigenetics (urban) | RT in zip-lock, then 4C (2-4h) | RT | -80C |
| Urine | 4C (insulated box) | 4C | -80C |
| Cheek cell slides | Ice (4C) | Ice (4C) | 4C (until processed) |
| Hair | RT | RT | RT |
| Stool kits | Per DecodeAge protocol | Per DecodeAge protocol | Per DecodeAge protocol |

---

## 10. Quality Control and Deviations

**Common QC checks across SOPs**:
- Cross-check all labels on tubes/MCTs/boxes before transport
- Verify participant identity and eligibility before any sample collection
- Maintain cold-chain documentation
- Track processing time (especially 30-min plasma centrifugation deadline)
- Acceptance/rejection criteria for urine (volume, labelling, sterility, cold-chain)
- Hair exclusion criteria (length <3cm, dyes/mehndi)
- Tinted cheek swabs (nicotine etc.) are discarded

**Deviation protocol**: Any deviation from SOP must be documented and reported to the study coordinator. This includes:
- Delays beyond 2 hours before ice storage (epigenetics)
- Labelling errors
- Transport-related issues
- Workflow modifications at different sites

---

## 11. Key Differences: Urban vs Rural

| Aspect | Urban | Rural |
|--------|-------|-------|
| Volunteers/day | 3--4 | 40--60 |
| Recruitment | Online forms, phone, social media | Door-to-door visits |
| Communication | WhatsApp groups | In-person, phone |
| Setup | 1 room with functional zones | 3 separate rooms |
| Metadata timing | All on sampling day | Personal info days before; vitals on sampling day |
| Phlebotomy | Healthians phlebotomists | Public health team or partner phlebotomists |
| Epigenetics transport | RT in zip-lock, temp 4C, then -80C | Ice packs, same-day transport, direct to -80C |
| Lab partner | Healthians | 1mg |
| Report delivery | Email to volunteers | Print via public health team |
| Stool collection | Picked up from home next day | Brought to sampling site |

---

## 12. LIMS Feature Implications

Based on the SOPs, the LIMS should support:

1. **Participant management**: Code generation with age group/sex/centre encoding, eligibility tracking
2. **Label generation**: 22 labels per participant (16 normal + 6 cryo), pre-printed before sampling day
3. **Sample tracking**: Full chain of custody from collection through aliquoting to storage location
4. **Storage management**: -150C, -80C, 4C, RT locations; box/rack/slot tracking; 81-slot grid boxes
5. **Cold-chain monitoring**: Time-critical processing windows (30 min for plasma, 2h for epigenetics ice)
6. **Field event management**: Urban (hospital-based, small batch) vs Rural (community camp, mass sampling)
7. **ODK integration**: Sync metadata forms from ODK Central
8. **Partner coordination**: Lab partner assignment per event, report tracking
9. **Biochemistry results**: Import from Healthians/1mg reports
10. **ICC assay tracking**: Cheek cell slide processing workflow, imaging parameters, AGE tracker data
11. **QC workflows**: Deviation logging, acceptance/rejection criteria
12. **Inventory**: Consumable tracking (cryovials, labels, kits, reagents)
13. **Biobanking**: Long-term -150C storage with monthly consolidation transfers
14. **Multi-site support**: Different number ranges, different workflows per site
15. **Reporting**: Sample counts by group, processing status, storage utilization
