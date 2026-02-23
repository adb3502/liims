"""Import merged_blood_biochemistry_data.csv into LIMS partner lab results.

Reads the wide-format CSV (82 test columns per participant row), creates
canonical tests for any new columns, and stores individual PartnerLabResult
records linked to participants.

Run via: docker compose exec api python -m app.scripts.import_blood_biochemistry /path/to/csv
"""

import asyncio
import csv
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import select

from app.database import async_session_factory
from app.models.enums import MatchStatus, PartnerName
from app.models.participant import Participant
from app.models.partner import (
    CanonicalTest,
    PartnerLabImport,
    PartnerLabResult,
)
from app.models.user import User

# Map CSV column names to canonical test definitions
# (csv_column, display_name, category, unit, ref_low, ref_high)
TEST_DEFINITIONS: dict[str, tuple[str, str, str, str | None, str | None]] = {
    "Absolute_Basophil_Count": ("Absolute Basophil Count", "CBC - Differential", "10^3/uL", None, None),
    "Absolute_Eosinophil_Count": ("Absolute Eosinophil Count", "CBC - Differential", "10^3/uL", None, None),
    "Absolute_Lymphocyte_Count": ("Absolute Lymphocyte Count", "CBC - Differential", "10^3/uL", None, None),
    "Absolute_Monocyte_Count": ("Absolute Monocyte Count", "CBC - Differential", "10^3/uL", None, None),
    "Absolute_Neutrophil_Count": ("Absolute Neutrophil Count", "CBC - Differential", "10^3/uL", None, None),
    "AG_Ratio": ("A/G Ratio", "Liver Panel", None, "1.0", "2.5"),
    "Albumin": ("Albumin", "Liver Panel", "g/dL", "3.5", "5.5"),
    "Alkaline_Phosphatase": ("Alkaline Phosphatase", "Liver Panel", "U/L", "44", "147"),
    "Apolipoprotein_A1": ("Apolipoprotein A1", "Lipid Panel", "mg/dL", "120", "176"),
    "Basophils": ("Basophils %", "CBC - Differential", "%", "0", "1"),
    "Bilirubin_Direct": ("Bilirubin Direct", "Liver Panel", "mg/dL", "0", "0.3"),
    "Bilirubin_Indirect": ("Bilirubin Indirect", "Liver Panel", "mg/dL", "0.1", "1.0"),
    "Bilirubin_Total": ("Bilirubin Total", "Liver Panel", "mg/dL", "0.1", "1.2"),
    "BUN": ("Blood Urea Nitrogen", "Renal Panel", "mg/dL", "7", "20"),
    "BUN_Creatinine_Ratio": ("BUN/Creatinine Ratio", "Renal Panel", None, "10", "20"),
    "Calcium": ("Calcium", "Electrolytes", "mg/dL", "8.5", "10.5"),
    "Chloride": ("Chloride", "Electrolytes", "mEq/L", "98", "106"),
    "Cholesterol_Total": ("Total Cholesterol", "Lipid Panel", "mg/dL", "0", "200"),
    "Cortisol": ("Cortisol", "Endocrine", "ug/dL", "6.2", "19.4"),
    "Creatinine": ("Creatinine", "Renal Panel", "mg/dL", "0.6", "1.2"),
    "CRP": ("C-Reactive Protein", "Inflammation", "mg/L", "0", "5"),
    "Eosinophils": ("Eosinophils %", "CBC - Differential", "%", "1", "4"),
    "ESR": ("Erythrocyte Sedimentation Rate", "Inflammation", "mm/hr", "0", "20"),
    "Estimated_Average_Glucose": ("Estimated Average Glucose", "Biochemistry", "mg/dL", None, None),
    "Ferritin": ("Ferritin", "Iron Studies", "ng/mL", "20", "250"),
    "Folate": ("Folate", "Vitamins", "ng/mL", "3", "17"),
    "Free_T3": ("Free T3", "Thyroid", "pg/mL", "2.0", "4.4"),
    "Free_T4": ("Free T4", "Thyroid", "ng/dL", "0.82", "1.77"),
    "GFR_Estimated": ("Estimated GFR", "Renal Panel", "mL/min/1.73m2", "90", None),
    "GGT": ("Gamma-Glutamyl Transferase", "Liver Panel", "U/L", "9", "48"),
    "Globulin": ("Globulin", "Liver Panel", "g/dL", "2.0", "3.5"),
    "Glucose_Fasting": ("Fasting Glucose", "Biochemistry", "mg/dL", "70", "110"),
    "Green_King_Index": ("Green-King Index", "Hematology Index", None, None, None),
    "HbA1c": ("HbA1c", "Biochemistry", "%", "4.0", "5.7"),
    "HCT": ("Hematocrit", "Hematology", "%", "36", "46"),
    "HDL_Cholesterol": ("HDL Cholesterol", "Lipid Panel", "mg/dL", "40", "60"),
    "HDL_LDL_Ratio": ("HDL/LDL Ratio", "Lipid Panel", None, None, None),
    "Hematocrit": ("Hematocrit (dup)", "Hematology", "%", "36", "46"),
    "Hemoglobin": ("Hemoglobin", "Hematology", "g/dL", "12.0", "17.0"),
    "Homocysteine": ("Homocysteine", "Biochemistry", "umol/L", "5", "15"),
    "Insulin_Fasting": ("Fasting Insulin", "Endocrine", "uIU/mL", "2.6", "24.9"),
    "Iron_Serum": ("Serum Iron", "Iron Studies", "ug/dL", "60", "170"),
    "LDL_Cholesterol": ("LDL Cholesterol", "Lipid Panel", "mg/dL", "0", "100"),
    "LDL_HDL_Ratio": ("LDL/HDL Ratio", "Lipid Panel", None, None, None),
    "Lymphocytes": ("Lymphocytes %", "CBC - Differential", "%", "20", "40"),
    "MCH": ("Mean Corpuscular Hemoglobin", "Hematology", "pg", "27", "31"),
    "MCHC": ("Mean Corpuscular Hb Conc.", "Hematology", "g/dL", "32", "36"),
    "MCV": ("Mean Corpuscular Volume", "Hematology", "fL", "80", "100"),
    "Mentzer_Index": ("Mentzer Index", "Hematology Index", None, None, None),
    "Monocytes": ("Monocytes %", "CBC - Differential", "%", "2", "8"),
    "MPV": ("Mean Platelet Volume", "Hematology", "fL", "7.5", "11.5"),
    "Neutrophils": ("Neutrophils %", "CBC - Differential", "%", "40", "60"),
    "Non_HDL_Cholesterol": ("Non-HDL Cholesterol", "Lipid Panel", "mg/dL", None, "130"),
    "PDW": ("Platelet Distribution Width", "Hematology", "fL", "9", "17"),
    "Phosphorus": ("Phosphorus", "Electrolytes", "mg/dL", "2.5", "4.5"),
    "Platelet_Count": ("Platelet Count", "Hematology", "thousand/uL", "150", "400"),
    "Potassium": ("Potassium", "Electrolytes", "mEq/L", "3.5", "5.0"),
    "RBC_Count": ("RBC Count", "Hematology", "million/uL", "4.0", "5.5"),
    "RDW_CV": ("RDW-CV", "Hematology", "%", "11.5", "14.5"),
    "RDW_SD": ("RDW-SD", "Hematology", "fL", "35", "56"),
    "RDWI": ("RDW Index", "Hematology Index", None, None, None),
    "SGOT_AST": ("SGOT (AST)", "Liver Panel", "U/L", "0", "40"),
    "SGOT_SGPT_Ratio": ("AST/ALT Ratio", "Liver Panel", None, None, None),
    "SGPT_ALT": ("SGPT (ALT)", "Liver Panel", "U/L", "0", "41"),
    "Sodium": ("Sodium", "Electrolytes", "mEq/L", "136", "145"),
    "TIBC": ("Total Iron Binding Capacity", "Iron Studies", "ug/dL", "250", "370"),
    "Total_HDL_Ratio": ("Total/HDL Ratio", "Lipid Panel", None, None, None),
    "Total_Protein": ("Total Protein", "Liver Panel", "g/dL", "6.0", "8.3"),
    "Total_T3": ("Total T3", "Thyroid", "ng/dL", "80", "200"),
    "Total_T4": ("Total T4", "Thyroid", "ug/dL", "5.1", "14.1"),
    "Transferrin_Saturation": ("Transferrin Saturation", "Iron Studies", "%", "20", "50"),
    "Triglycerides": ("Triglycerides", "Lipid Panel", "mg/dL", "0", "150"),
    "TSH": ("TSH", "Thyroid", "mIU/L", "0.4", "4.0"),
    "UIBC": ("Unsaturated Iron Binding Capacity", "Iron Studies", "ug/dL", "150", "300"),
    "Urea": ("Urea", "Renal Panel", "mg/dL", "15", "40"),
    "Urea_Creatinine_Ratio": ("Urea/Creatinine Ratio", "Renal Panel", None, None, None),
    "Uric_Acid": ("Uric Acid", "Renal Panel", "mg/dL", "3.5", "7.2"),
    "Vitamin_B12": ("Vitamin B12", "Vitamins", "pg/mL", "200", "900"),
    "Vitamin_D": ("Vitamin D (25-OH)", "Vitamins", "ng/mL", "30", "100"),
    "VLDL_Cholesterol": ("VLDL Cholesterol", "Lipid Panel", "mg/dL", None, "30"),
    "WBC_Count": ("WBC Count", "Hematology", "thousand/uL", "4.0", "11.0"),
}

# Non-test columns to skip
SKIP_COLUMNS = {"Participant_ID", "Provider", "Age", "urban/rural", "Sample_Date", "Sample_Month", "Sample_Year"}

PROVIDER_MAP = {
    "1MG": PartnerName.ONE_MG,
    "Healthians": PartnerName.HEALTHIANS,
}


def _to_decimal(val: str) -> Decimal | None:
    if not val or val.strip() == "":
        return None
    try:
        return Decimal(val.strip())
    except InvalidOperation:
        return None


def _parse_date(row: dict) -> str | None:
    """Try to parse sample date from the row."""
    d = row.get("Sample_Date", "").strip()
    if d:
        return d
    m = row.get("Sample_Month", "").strip()
    y = row.get("Sample_Year", "").strip()
    if m and y:
        return f"{m}/1/{y}"
    return None


async def import_csv(csv_path: str) -> None:
    path = Path(csv_path)
    if not path.exists():
        print(f"ERROR: File not found: {csv_path}")
        return

    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Read {len(rows)} rows from {path.name}")

    async with async_session_factory() as session:
        # Get admin user
        admin = (await session.execute(select(User).limit(1))).scalar_one()

        # Load existing canonical tests
        existing_tests = {}
        result = await session.execute(select(CanonicalTest))
        for t in result.scalars().all():
            existing_tests[t.canonical_name] = t

        # Create missing canonical tests
        test_map: dict[str, uuid.UUID] = {}
        new_count = 0
        for col_name, (display, category, unit, ref_low, ref_high) in TEST_DEFINITIONS.items():
            # Canonical name: lowercase, underscored
            canon = col_name.lower()

            if canon in existing_tests:
                test_map[col_name] = existing_tests[canon].id
            else:
                tid = uuid.uuid4()
                session.add(CanonicalTest(
                    id=tid,
                    canonical_name=canon,
                    display_name=display,
                    category=category,
                    standard_unit=unit or "",
                    reference_range_low=Decimal(ref_low) if ref_low else None,
                    reference_range_high=Decimal(ref_high) if ref_high else None,
                ))
                test_map[col_name] = tid
                new_count += 1

        if new_count:
            await session.flush()
            print(f"Created {new_count} new canonical tests")

        # Load existing participants by code
        part_result = await session.execute(
            select(Participant.participant_code, Participant.id)
        )
        participant_map: dict[str, uuid.UUID] = {
            r[0]: r[1] for r in part_result.all()
        }
        print(f"Found {len(participant_map)} existing participants in DB")

        # Group rows by provider
        by_provider: dict[str, list[dict]] = {}
        for row in rows:
            prov = row.get("Provider", "Unknown")
            by_provider.setdefault(prov, []).append(row)

        total_results = 0
        total_matched = 0
        total_unmatched = 0

        for provider_name, provider_rows in by_provider.items():
            partner = PROVIDER_MAP.get(provider_name)
            if not partner:
                print(f"  WARNING: Unknown provider '{provider_name}', skipping {len(provider_rows)} rows")
                continue

            # Create import record
            import_id = uuid.uuid4()
            matched = sum(1 for r in provider_rows if r["Participant_ID"] in participant_map)
            session.add(PartnerLabImport(
                id=import_id,
                partner_name=partner,
                import_date=datetime.now(timezone.utc),
                source_file_name=path.name,
                records_total=len(provider_rows),
                records_matched=matched,
                records_failed=len(provider_rows) - matched,
                imported_by=admin.id,
                notes=f"Blood biochemistry import from {provider_name}",
            ))
            await session.flush()

            # Process each row
            for row in provider_rows:
                p_code = row["Participant_ID"].strip()
                p_id = participant_map.get(p_code)
                match_status = MatchStatus.AUTO_MATCHED if p_id else MatchStatus.UNMATCHED

                if p_id:
                    total_matched += 1
                else:
                    total_unmatched += 1

                date_str = _parse_date(row)

                # Create result for each non-empty test value
                for col_name in TEST_DEFINITIONS:
                    val = row.get(col_name, "").strip()
                    if not val:
                        continue

                    test_id = test_map.get(col_name)
                    defn = TEST_DEFINITIONS[col_name]
                    unit = defn[2] or ""
                    ref_low = defn[3]
                    ref_high = defn[4]

                    # Check if abnormal
                    is_abnormal = False
                    num_val = _to_decimal(val)
                    if num_val is not None:
                        if ref_low and num_val < Decimal(ref_low):
                            is_abnormal = True
                        if ref_high and num_val > Decimal(ref_high):
                            is_abnormal = True

                    session.add(PartnerLabResult(
                        id=uuid.uuid4(),
                        import_id=import_id,
                        participant_id=p_id,
                        participant_code_raw=p_code,
                        test_date=None,  # Would need date parsing
                        test_name_raw=col_name,
                        canonical_test_id=test_id,
                        test_value=val,
                        test_unit=unit,
                        is_abnormal=is_abnormal,
                        match_status=match_status,
                    ))
                    total_results += 1

            print(f"  {provider_name}: {len(provider_rows)} participants, {matched} matched")

        await session.commit()

        print(f"\nImport complete!")
        print(f"  Total lab results created: {total_results:,}")
        print(f"  Participants matched to LIMS: {total_matched}")
        print(f"  Participants not in LIMS yet: {total_unmatched}")
        print(f"  (Unmatched results stored with participant_code_raw for future linking)")


if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "/data/merged_blood_biochemistry_data.csv"
    asyncio.run(import_csv(csv_file))
