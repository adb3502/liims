"""One-time backfill: update participant.enrollment_date from lab result or ODK data.

All 994 participants were bulk-imported and received the same enrollment_date
(the import timestamp). This script corrects enrollment_date for each participant
using the earliest available evidence, in priority order:

  1. MIN(PartnerLabResult.test_date) for the participant
  2. MIN(OdkSubmission.created_at) linked to the participant
  3. Leave unchanged (enrollment_date_source stays 'bulk_import')

Also sets enrollment_date_source to:
  'sample_date'     — updated from lab result test_date
  'odk_submission'  — updated from ODK submission timestamp
  'bulk_import'     — not updated (no evidence found)

Only participants whose enrollment_date equals the bulk import sentinel timestamp
are considered for update. That timestamp is detected automatically as the mode
(most common) enrollment_date across all participants.

Usage:
  cd backend
  python -m app.scripts.backfill_enrollment_dates [--dry-run]
"""

import argparse
import asyncio
import logging
import sys
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import func, select, update

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


async def run_backfill(dry_run: bool = False) -> None:
    """Execute the enrollment date backfill."""
    # Import inside async context to allow app bootstrap
    from app.database import async_session_factory
    from app.models.participant import Participant
    from app.models.partner import OdkSubmission, PartnerLabResult

    async with async_session_factory() as db:
        # ── Step 1: Detect bulk import sentinel date ─────────────────
        dates_q = select(Participant.enrollment_date).where(
            Participant.is_deleted == False  # noqa: E712
        )
        date_rows = (await db.execute(dates_q)).scalars().all()
        if not date_rows:
            logger.info("No participants found. Nothing to do.")
            return

        # The sentinel is the most common enrollment_date (bulk import date)
        counter: Counter = Counter()
        for d in date_rows:
            # Normalize to date-only for grouping (ignore sub-second variance)
            key = d.date() if hasattr(d, "date") else d
            counter[key] += 1
        sentinel_date, sentinel_count = counter.most_common(1)[0]
        logger.info(
            "Detected bulk import sentinel date: %s (%d participants)",
            sentinel_date,
            sentinel_count,
        )

        # ── Step 2: Get all participants with the sentinel date ───────
        sentinel_dt_start = datetime(
            sentinel_date.year, sentinel_date.month, sentinel_date.day,
            tzinfo=timezone.utc,
        )
        sentinel_dt_end = datetime(
            sentinel_date.year, sentinel_date.month, sentinel_date.day,
            23, 59, 59, tzinfo=timezone.utc,
        )
        candidates_q = (
            select(Participant.id, Participant.participant_code, Participant.enrollment_date)
            .where(
                Participant.is_deleted == False,  # noqa: E712
                Participant.enrollment_date >= sentinel_dt_start,
                Participant.enrollment_date <= sentinel_dt_end,
            )
        )
        candidate_rows = (await db.execute(candidates_q)).all()
        logger.info("Found %d candidate participants to potentially update.", len(candidate_rows))

        participant_ids = [r[0] for r in candidate_rows]
        if not participant_ids:
            logger.info("No candidates found. Nothing to do.")
            return

        # ── Step 3: Earliest PartnerLabResult.test_date per participant ─
        lab_dates_q = (
            select(
                PartnerLabResult.participant_id,
                func.min(PartnerLabResult.test_date).label("earliest_test_date"),
            )
            .where(
                PartnerLabResult.participant_id.in_(participant_ids),
                PartnerLabResult.test_date.isnot(None),
            )
            .group_by(PartnerLabResult.participant_id)
        )
        lab_date_rows = (await db.execute(lab_dates_q)).all()
        lab_dates: dict = {r[0]: r[1] for r in lab_date_rows}
        logger.info("Lab result dates found for %d participants.", len(lab_dates))

        # ── Step 4: Earliest OdkSubmission.created_at per participant ──
        odk_dates_q = (
            select(
                OdkSubmission.participant_id,
                func.min(OdkSubmission.created_at).label("earliest_odk"),
            )
            .where(
                OdkSubmission.participant_id.in_(participant_ids),
                OdkSubmission.participant_id.isnot(None),
            )
            .group_by(OdkSubmission.participant_id)
        )
        odk_date_rows = (await db.execute(odk_dates_q)).all()
        odk_dates: dict = {r[0]: r[1] for r in odk_date_rows}
        logger.info("ODK submission dates found for %d participants.", len(odk_dates))

        # ── Step 5: Apply updates ─────────────────────────────────────
        updated_sample = 0
        updated_odk = 0
        skipped = 0

        for pid, pcode, current_dt in candidate_rows:
            lab_date = lab_dates.get(pid)
            odk_date = odk_dates.get(pid)

            if lab_date is not None:
                # Convert date → datetime (midnight UTC)
                new_dt = datetime(
                    lab_date.year, lab_date.month, lab_date.day,
                    tzinfo=timezone.utc,
                )
                source = "backfill_lab_date"
                updated_sample += 1
            elif odk_date is not None:
                new_dt = odk_date if odk_date.tzinfo else odk_date.replace(tzinfo=timezone.utc)
                source = "backfill_odk"
                updated_odk += 1
            else:
                # No better evidence; mark as bulk_import and move on
                if not dry_run:
                    await db.execute(
                        update(Participant)
                        .where(Participant.id == pid)
                        .values(enrollment_date_source="bulk_import")
                    )
                skipped += 1
                logger.debug("No evidence for %s — keeping bulk_import date.", pcode)
                continue

            logger.info(
                "%-12s  %s -> %s  [%s]",
                pcode,
                current_dt.date() if current_dt else "None",
                new_dt.date(),
                source,
            )

            if not dry_run:
                await db.execute(
                    update(Participant)
                    .where(Participant.id == pid)
                    .values(
                        enrollment_date=new_dt,
                        enrollment_date_source=source,
                    )
                )

        if not dry_run:
            await db.commit()
            logger.info(
                "Committed. Updated from sample_date: %d, odk_submission: %d, skipped: %d.",
                updated_sample,
                updated_odk,
                skipped,
            )
        else:
            logger.info(
                "[DRY RUN] Would update from sample_date: %d, odk_submission: %d, skip: %d.",
                updated_sample,
                updated_odk,
                skipped,
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill participant enrollment dates.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be changed without committing to the database.",
    )
    args = parser.parse_args()

    if args.dry_run:
        logger.info("DRY RUN mode — no changes will be written.")

    asyncio.run(run_backfill(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
