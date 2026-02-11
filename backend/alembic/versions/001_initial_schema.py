"""Initial schema - all LIIMS tables.

Revision ID: 001
Revises: None
Create Date: 2026-02-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pg_trgm extension for fuzzy search
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # --- User & Auth ---

    op.create_table(
        "user",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_user_email", "user", ["email"])
    op.create_index("ix_user_role", "user", ["role"])

    op.create_table(
        "user_session",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_session_user_id", "user_session", ["user_id"])
    op.create_index("ix_user_session_token_hash", "user_session", ["token_hash"])

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("old_values", postgresql.JSONB, nullable=True),
        sa.Column("new_values", postgresql.JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("additional_context", postgresql.JSONB, nullable=True),
    )
    op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"])
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    op.create_index("ix_audit_log_timestamp", "audit_log", ["timestamp"])
    op.create_index("ix_audit_log_action", "audit_log", ["action"])

    # --- Collection Site ---

    op.create_table(
        "collection_site",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(20), unique=True, nullable=False),
        sa.Column("participant_range_start", sa.Integer, nullable=False),
        sa.Column("participant_range_end", sa.Integer, nullable=False),
        sa.Column("city", sa.String(100), server_default="Bangalore"),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_collection_site_code", "collection_site", ["code"])

    # --- Participant ---

    op.create_table(
        "participant",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("participant_code", sa.String(20), unique=True, nullable=False),
        sa.Column("group_code", sa.String(5), nullable=False),
        sa.Column("participant_number", sa.Integer, nullable=False),
        sa.Column("age_group", sa.Integer, nullable=False),
        sa.Column("sex", sa.String(1), nullable=False),
        sa.Column("date_of_birth", sa.Date, nullable=True),
        sa.Column("collection_site_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collection_site.id"), nullable=False),
        sa.Column("enrollment_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("enrollment_source", sa.String(20), server_default="odk"),
        sa.Column("odk_submission_id", sa.String(100), nullable=True),
        sa.Column("wave", sa.Integer, server_default="1", nullable=False),
        sa.Column("completion_pct", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_participant_code", "participant", ["participant_code"])
    op.create_index("ix_participant_group_code", "participant", ["group_code"])
    op.create_index("ix_participant_site", "participant", ["collection_site_id"])
    op.create_index("ix_participant_wave", "participant", ["wave"])
    # pg_trgm GIN index for fuzzy search on participant_code
    op.execute(
        "CREATE INDEX ix_participant_code_trgm ON participant USING gin (participant_code gin_trgm_ops)"
    )

    # --- Consent ---

    op.create_table(
        "consent",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participant.id"), nullable=False),
        sa.Column("consent_type", sa.String(20), nullable=False),
        sa.Column("consent_given", sa.Boolean, nullable=False),
        sa.Column("consent_date", sa.Date, nullable=False),
        sa.Column("is_proxy", sa.Boolean, server_default="false"),
        sa.Column("witness_name", sa.String(200), nullable=True),
        sa.Column("form_version", sa.String(20), nullable=True),
        sa.Column("withdrawal_date", sa.Date, nullable=True),
        sa.Column("withdrawal_reason", sa.Text, nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_consent_participant", "consent", ["participant_id"])
    op.create_index("ix_consent_type", "consent", ["consent_type"])

    # --- Freezer ---

    op.create_table(
        "freezer",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("freezer_type", sa.String(20), nullable=False),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("total_capacity", sa.Integer, nullable=True),
        sa.Column("rack_count", sa.Integer, nullable=True),
        sa.Column("slots_per_rack", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_freezer_type", "freezer", ["freezer_type"])

    op.create_table(
        "freezer_temperature_event",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("freezer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("freezer.id"), nullable=False),
        sa.Column("event_type", sa.String(20), nullable=False),
        sa.Column("event_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observed_temp_c", sa.Numeric(5, 1), nullable=True),
        sa.Column("reported_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("samples_affected_count", sa.Integer, nullable=True),
        sa.Column("resolution_notes", sa.Text, nullable=True),
        sa.Column("requires_sample_review", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_temp_event_freezer", "freezer_temperature_event", ["freezer_id"])
    op.create_index("ix_temp_event_start", "freezer_temperature_event", ["event_start"])

    # --- Storage Rack ---

    op.create_table(
        "storage_rack",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("freezer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("freezer.id"), nullable=False),
        sa.Column("rack_name", sa.String(50), nullable=False),
        sa.Column("position_in_freezer", sa.Integer, nullable=True),
        sa.Column("capacity", sa.Integer, nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rack_freezer", "storage_rack", ["freezer_id"])

    # --- Storage Box ---

    op.create_table(
        "storage_box",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rack_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("storage_rack.id"), nullable=False),
        sa.Column("box_name", sa.String(100), nullable=False),
        sa.Column("box_label", sa.String(200), nullable=True),
        sa.Column("rows", sa.Integer, server_default="9", nullable=False),
        sa.Column("columns", sa.Integer, server_default="9", nullable=False),
        sa.Column("box_type", sa.String(20), server_default="cryo_81"),
        sa.Column("box_material", sa.String(20), nullable=True),
        sa.Column("position_in_rack", sa.Integer, nullable=True),
        sa.Column("group_code", sa.String(5), nullable=True),
        sa.Column("collection_site_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collection_site.id"), nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_box_rack", "storage_box", ["rack_id"])
    op.create_index("ix_box_group_code", "storage_box", ["group_code"])

    # --- Storage Position ---

    op.create_table(
        "storage_position",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("box_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("storage_box.id"), nullable=False),
        sa.Column("row", sa.Integer, nullable=False),
        sa.Column("column", sa.Integer, nullable=False),
        sa.Column("sample_id", postgresql.UUID(as_uuid=True), nullable=True),  # FK added after sample table
        sa.Column("occupied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("box_id", "row", "column", name="uq_box_row_col"),
    )
    op.create_index("ix_position_box", "storage_position", ["box_id"])
    op.create_index("ix_position_sample", "storage_position", ["sample_id"])

    # --- Sample ---

    op.create_table(
        "sample",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sample_code", sa.String(30), unique=True, nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participant.id"), nullable=False),
        sa.Column("sample_type", sa.String(20), nullable=False),
        sa.Column("sample_subtype", sa.String(10), nullable=True),
        sa.Column("parent_sample_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("initial_volume_ul", sa.Numeric(10, 2), nullable=True),
        sa.Column("remaining_volume_ul", sa.Numeric(10, 2), nullable=True),
        sa.Column("collection_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("collected_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("collection_site_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collection_site.id"), nullable=True),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("storage_location_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("storage_position.id"), nullable=True),
        sa.Column("storage_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stored_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("has_deviation", sa.Boolean, server_default="false"),
        sa.Column("deviation_notes", sa.Text, nullable=True),
        sa.Column("qr_code_url", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("wave", sa.Integer, server_default="1", nullable=False),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_sample_code", "sample", ["sample_code"])
    op.create_index("ix_sample_participant", "sample", ["participant_id"])
    op.create_index("ix_sample_type", "sample", ["sample_type"])
    op.create_index("ix_sample_status", "sample", ["status"])
    op.create_index("ix_sample_parent", "sample", ["parent_sample_id"])
    op.create_index("ix_sample_wave", "sample", ["wave"])
    # pg_trgm GIN index for fuzzy search on sample_code
    op.execute(
        "CREATE INDEX ix_sample_code_trgm ON sample USING gin (sample_code gin_trgm_ops)"
    )

    # Add the FK from storage_position.sample_id -> sample.id now that sample exists
    op.create_foreign_key(
        "fk_storage_position_sample", "storage_position", "sample",
        ["sample_id"], ["id"],
    )

    # --- Sample Status History ---

    op.create_table(
        "sample_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sample_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample.id"), nullable=False),
        sa.Column("previous_status", sa.String(20), nullable=True),
        sa.Column("new_status", sa.String(20), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("changed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("location_context", sa.String(200), nullable=True),
        sa.Column("storage_rule_override_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sample_status_history_sample", "sample_status_history", ["sample_id"])
    op.create_index("ix_sample_status_history_changed_at", "sample_status_history", ["changed_at"])

    # --- Sample Discard Request ---

    op.create_table(
        "sample_discard_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sample_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample.id"), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("reason_notes", sa.Text, nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_discard_request_sample", "sample_discard_request", ["sample_id"])
    op.create_index("ix_discard_request_status", "sample_discard_request", ["status"])

    # --- Field Event ---

    op.create_table(
        "field_event",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_name", sa.String(200), nullable=False),
        sa.Column("event_date", sa.Date, nullable=False),
        sa.Column("collection_site_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collection_site.id"), nullable=False),
        sa.Column("event_type", sa.String(20), nullable=False),
        sa.Column("expected_participants", sa.Integer, nullable=True),
        sa.Column("actual_participants", sa.Integer, nullable=True),
        sa.Column("status", sa.String(20), nullable=True),
        sa.Column("coordinator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("partner_lab", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("wave", sa.Integer, server_default="1", nullable=False),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_field_event_date", "field_event", ["event_date"])
    op.create_index("ix_field_event_site", "field_event", ["collection_site_id"])
    op.create_index("ix_field_event_status", "field_event", ["status"])

    # --- Field Event Participant ---

    op.create_table(
        "field_event_participant",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("field_event.id"), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participant.id"), nullable=False),
        sa.Column("check_in_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("wrist_tag_issued", sa.Boolean, server_default="false"),
        sa.Column("consent_verified", sa.Boolean, server_default="false"),
        sa.Column("samples_collected", postgresql.JSONB, nullable=True),
        sa.Column("partner_samples", postgresql.JSONB, nullable=True),
        sa.Column("stool_kit_issued", sa.Boolean, server_default="false"),
        sa.Column("urine_collected", sa.Boolean, server_default="false"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_status", sa.String(20), server_default="synced"),
        sa.Column("offline_id", sa.String(100), nullable=True),
        sa.UniqueConstraint("event_id", "participant_id", name="uq_event_participant"),
    )
    op.create_index("ix_fep_event", "field_event_participant", ["event_id"])
    op.create_index("ix_fep_participant", "field_event_participant", ["participant_id"])

    # --- Sample Transport ---

    op.create_table(
        "sample_transport",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("field_event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("field_event.id"), nullable=True),
        sa.Column("transport_type", sa.String(20), nullable=False),
        sa.Column("origin", sa.String(200), nullable=False),
        sa.Column("destination", sa.String(200), nullable=False),
        sa.Column("departure_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("arrival_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cold_chain_method", sa.String(200), nullable=True),
        sa.Column("courier_name", sa.String(200), nullable=True),
        sa.Column("sample_count", sa.Integer, nullable=True),
        sa.Column("box_count", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("verified_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_transport_field_event", "sample_transport", ["field_event_id"])

    op.create_table(
        "sample_transport_item",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("transport_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample_transport.id"), nullable=False),
        sa.Column("sample_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample.id"), nullable=True),
        sa.Column("box_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("storage_box.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transport_item_transport", "sample_transport_item", ["transport_id"])

    # --- ODK Integration ---

    op.create_table(
        "odk_form_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("form_id", sa.String(100), nullable=False),
        sa.Column("form_name", sa.String(200), nullable=False),
        sa.Column("form_version", sa.String(50), nullable=False),
        sa.Column("field_mapping", postgresql.JSONB, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_odk_form_config_form_id", "odk_form_config", ["form_id"])

    op.create_table(
        "odk_sync_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sync_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sync_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("submissions_found", sa.Integer, nullable=True),
        sa.Column("submissions_processed", sa.Integer, nullable=True),
        sa.Column("submissions_failed", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_odk_sync_log_status", "odk_sync_log", ["status"])
    op.create_index("ix_odk_sync_log_started", "odk_sync_log", ["sync_started_at"])

    op.create_table(
        "odk_submission",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("odk_instance_id", sa.String(100), unique=True, nullable=False),
        sa.Column("odk_form_id", sa.String(100), nullable=False),
        sa.Column("odk_form_version", sa.String(50), nullable=True),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participant.id"), nullable=True),
        sa.Column("participant_code_raw", sa.String(50), nullable=True),
        sa.Column("submission_data", postgresql.JSONB, nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_status", sa.String(20), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_odk_submission_instance", "odk_submission", ["odk_instance_id"])
    op.create_index("ix_odk_submission_participant", "odk_submission", ["participant_id"])
    op.create_index("ix_odk_submission_status", "odk_submission", ["processing_status"])

    # --- Canonical Test Dictionary ---

    op.create_table(
        "canonical_test",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("canonical_name", sa.String(200), unique=True, nullable=False),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("standard_unit", sa.String(50), nullable=True),
        sa.Column("reference_range_low", sa.Numeric(10, 4), nullable=True),
        sa.Column("reference_range_high", sa.Numeric(10, 4), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_canonical_test_name", "canonical_test", ["canonical_name"])
    op.create_index("ix_canonical_test_category", "canonical_test", ["category"])

    op.create_table(
        "test_name_alias",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("canonical_test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("canonical_test.id"), nullable=False),
        sa.Column("partner_name", sa.String(20), nullable=False),
        sa.Column("alias_name", sa.String(200), nullable=False),
        sa.Column("alias_unit", sa.String(50), nullable=True),
        sa.Column("unit_conversion_factor", sa.Numeric(10, 6), server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_alias_canonical_test", "test_name_alias", ["canonical_test_id"])
    op.create_index("ix_alias_partner", "test_name_alias", ["partner_name"])

    # --- Partner Lab Results ---

    op.create_table(
        "partner_lab_import",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("partner_name", sa.String(20), nullable=False),
        sa.Column("import_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_file_name", sa.String(500), nullable=True),
        sa.Column("source_file_path", sa.String(1000), nullable=True),
        sa.Column("records_total", sa.Integer, nullable=True),
        sa.Column("records_matched", sa.Integer, nullable=True),
        sa.Column("records_failed", sa.Integer, nullable=True),
        sa.Column("imported_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_partner_import_partner", "partner_lab_import", ["partner_name"])
    op.create_index("ix_partner_import_date", "partner_lab_import", ["import_date"])

    op.create_table(
        "partner_lab_result",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("import_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("partner_lab_import.id"), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participant.id"), nullable=True),
        sa.Column("participant_code_raw", sa.String(50), nullable=True),
        sa.Column("test_date", sa.Date, nullable=True),
        sa.Column("test_name_raw", sa.String(200), nullable=True),
        sa.Column("canonical_test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("canonical_test.id"), nullable=True),
        sa.Column("test_value", sa.String(100), nullable=True),
        sa.Column("test_unit", sa.String(50), nullable=True),
        sa.Column("reference_range", sa.String(100), nullable=True),
        sa.Column("is_abnormal", sa.Boolean, nullable=True),
        sa.Column("raw_data", postgresql.JSONB, nullable=True),
        sa.Column("match_status", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_partner_result_import", "partner_lab_result", ["import_id"])
    op.create_index("ix_partner_result_participant", "partner_lab_result", ["participant_id"])
    op.create_index("ix_partner_result_test", "partner_lab_result", ["canonical_test_id"])

    # --- Stool Kit ---

    op.create_table(
        "stool_kit",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participant.id"), nullable=False),
        sa.Column("field_event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("field_event.id"), nullable=True),
        sa.Column("kit_code", sa.String(100), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("issued_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("status", sa.String(30), server_default="issued", nullable=False),
        sa.Column("decodeage_pickup_date", sa.Date, nullable=True),
        sa.Column("results_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_stool_kit_participant", "stool_kit", ["participant_id"])
    op.create_index("ix_stool_kit_status", "stool_kit", ["status"])

    # --- Instrument ---

    op.create_table(
        "instrument",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("instrument_type", sa.String(20), nullable=False),
        sa.Column("manufacturer", sa.String(100), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("software", sa.String(100), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("watch_directory", sa.String(1000), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("configuration", postgresql.JSONB, nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_instrument_type", "instrument", ["instrument_type"])

    op.create_table(
        "qc_template",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("template_data", postgresql.JSONB, nullable=False),
        sa.Column("run_type", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )

    # --- Instrument Run ---

    op.create_table(
        "instrument_run",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("instrument_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("instrument.id"), nullable=False),
        sa.Column("run_name", sa.String(200), nullable=True),
        sa.Column("run_type", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("method_name", sa.String(200), nullable=True),
        sa.Column("batch_id", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("raw_data_path", sa.String(1000), nullable=True),
        sa.Column("raw_data_size_bytes", sa.BigInteger, nullable=True),
        sa.Column("raw_data_verified", sa.Boolean, server_default="false"),
        sa.Column("qc_status", sa.String(20), nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_run_instrument", "instrument_run", ["instrument_id"])
    op.create_index("ix_run_status", "instrument_run", ["status"])
    op.create_index("ix_run_type", "instrument_run", ["run_type"])

    # --- Plate ---

    op.create_table(
        "plate",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("plate_name", sa.String(200), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("instrument_run.id"), nullable=True),
        sa.Column("qc_template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("qc_template.id"), nullable=True),
        sa.Column("rows", sa.Integer, server_default="8"),
        sa.Column("columns", sa.Integer, server_default="12"),
        sa.Column("randomization_config", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )
    op.create_index("ix_plate_run", "plate", ["run_id"])

    # --- Instrument Run Sample ---

    op.create_table(
        "instrument_run_sample",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("instrument_run.id"), nullable=False),
        sa.Column("sample_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample.id"), nullable=False),
        sa.Column("plate_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plate.id"), nullable=True),
        sa.Column("well_position", sa.String(10), nullable=True),
        sa.Column("plate_number", sa.Integer, server_default="1"),
        sa.Column("sample_order", sa.Integer, nullable=True),
        sa.Column("is_qc_sample", sa.Boolean, server_default="false"),
        sa.Column("qc_type", sa.String(50), nullable=True),
        sa.Column("injection_volume_ul", sa.Numeric(10, 2), nullable=True),
        sa.Column("volume_withdrawn_ul", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_run_sample_run", "instrument_run_sample", ["run_id"])
    op.create_index("ix_run_sample_sample", "instrument_run_sample", ["sample_id"])

    # --- Omics Results ---

    op.create_table(
        "omics_result_set",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("instrument_run.id"), nullable=False),
        sa.Column("result_type", sa.String(20), nullable=False),
        sa.Column("analysis_software", sa.String(200), nullable=True),
        sa.Column("software_version", sa.String(50), nullable=True),
        sa.Column("import_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("source_file_path", sa.String(1000), nullable=True),
        sa.Column("total_features", sa.Integer, nullable=True),
        sa.Column("total_samples", sa.Integer, nullable=True),
        sa.Column("qc_summary", postgresql.JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_omics_result_set_run", "omics_result_set", ["run_id"])
    op.create_index("ix_omics_result_set_type", "omics_result_set", ["result_type"])

    op.create_table(
        "omics_result",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("result_set_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("omics_result_set.id"), nullable=False),
        sa.Column("sample_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample.id"), nullable=False),
        sa.Column("feature_id", sa.String(200), nullable=False),
        sa.Column("feature_name", sa.String(500), nullable=True),
        sa.Column("quantification_value", sa.Float, nullable=True),
        sa.Column("is_imputed", sa.Boolean, server_default="false"),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_omics_result_set_sample", "omics_result", ["result_set_id", "sample_id"])
    op.create_index("ix_omics_result_set_feature", "omics_result", ["result_set_id", "feature_id"])

    # --- ICC Processing ---

    op.create_table(
        "icc_processing",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sample_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sample.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("fixation_reagent", sa.String(200), nullable=True),
        sa.Column("fixation_duration_min", sa.Integer, nullable=True),
        sa.Column("fixation_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("antibody_panel", sa.String(500), nullable=True),
        sa.Column("secondary_antibody", sa.String(500), nullable=True),
        sa.Column("microscope_settings", postgresql.JSONB, nullable=True),
        sa.Column("image_file_paths", postgresql.JSONB, nullable=True),
        sa.Column("analysis_software", sa.String(100), server_default="Fiji/ImageJ"),
        sa.Column("analysis_results", postgresql.JSONB, nullable=True),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_icc_sample", "icc_processing", ["sample_id"])
    op.create_index("ix_icc_status", "icc_processing", ["status"])

    # --- Notification ---

    op.create_table(
        "notification",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("recipient_role", sa.String(20), nullable=True),
        sa.Column("notification_type", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_read", sa.Boolean, server_default="false"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_sent", sa.Boolean, server_default="false"),
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notification_recipient", "notification", ["recipient_id"])
    op.create_index("ix_notification_role", "notification", ["recipient_role"])
    op.create_index("ix_notification_type", "notification", ["notification_type"])
    op.create_index("ix_notification_read", "notification", ["is_read"])
    op.create_index("ix_notification_created", "notification", ["created_at"])

    # --- System Setting ---

    op.create_table(
        "system_setting",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("value_type", sa.String(10), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
        sa.UniqueConstraint("category", "key", name="uq_setting_category_key"),
    )
    op.create_index("ix_setting_category", "system_setting", ["category"])

    # --- Scheduled Report ---

    op.create_table(
        "scheduled_report",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("report_name", sa.String(200), nullable=False),
        sa.Column("report_type", sa.String(30), nullable=False),
        sa.Column("schedule", sa.String(50), nullable=False),
        sa.Column("recipients", postgresql.JSONB, nullable=False),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
    )

    # --- Dashboard Cache ---

    op.create_table(
        "dashboard_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("dashboard_type", sa.String(30), nullable=False),
        sa.Column("cache_data", postgresql.JSONB, nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computation_duration_ms", sa.Integer, nullable=True),
        sa.Column("next_refresh_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_dashboard_cache_type", "dashboard_cache", ["dashboard_type"])


def downgrade() -> None:
    op.drop_table("dashboard_cache")
    op.drop_table("scheduled_report")
    op.drop_table("system_setting")
    op.drop_table("notification")
    op.drop_table("icc_processing")
    op.drop_table("omics_result")
    op.drop_table("omics_result_set")
    op.drop_table("instrument_run_sample")
    op.drop_table("plate")
    op.drop_table("instrument_run")
    op.drop_table("qc_template")
    op.drop_table("instrument")
    op.drop_table("stool_kit")
    op.drop_table("partner_lab_result")
    op.drop_table("partner_lab_import")
    op.drop_table("test_name_alias")
    op.drop_table("canonical_test")
    op.drop_table("odk_submission")
    op.drop_table("odk_sync_log")
    op.drop_table("odk_form_config")
    op.drop_table("sample_transport_item")
    op.drop_table("sample_transport")
    op.drop_table("field_event_participant")
    op.drop_table("field_event")
    op.drop_table("sample_discard_request")
    op.drop_table("sample_status_history")
    op.drop_constraint("fk_storage_position_sample", "storage_position", type_="foreignkey")
    op.drop_table("sample")
    op.drop_table("storage_position")
    op.drop_table("storage_box")
    op.drop_table("storage_rack")
    op.drop_table("freezer_temperature_event")
    op.drop_table("freezer")
    op.drop_table("consent")
    op.drop_table("participant")
    op.drop_table("collection_site")
    op.drop_table("audit_log")
    op.drop_table("user_session")
    op.drop_table("user")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
