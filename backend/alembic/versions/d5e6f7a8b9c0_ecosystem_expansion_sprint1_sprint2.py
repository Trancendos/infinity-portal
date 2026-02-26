"""Ecosystem Expansion Sprint 1 & 2 — new tables for integration connectors, webhooks, observability, compliance, vulnerability, code gen

Revision ID: d5e6f7a8b9c0
Revises: c4f8e2a1b9d3
Create Date: 2026-02-26 05:00:00.000000

New tables:
- (Sprint 1) No new DB tables — logging/analytics/compliance/vulnerability use in-memory storage
- (Sprint 2) No new DB tables — code_engine and version_history use in-memory storage
- Pydantic deprecation fixes: .dict() → .model_dump() in 5 routers
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'd5e6f7a8b9c0'
down_revision = 'c4f8e2a1b9d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Sprint 1 & 2 engines (logging_system, analytics_engine, compliance_framework,
    vulnerability_scanner, code_engine, version_history) use in-memory storage
    for development. For production persistence, the following tables should be
    created. This migration adds them as optional persistence tables.
    """

    # ── Structured Logs (optional persistence) ────────────────────────────────
    op.create_table(
        'structured_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('timestamp', sa.String(50), nullable=False),
        sa.Column('level', sa.String(20), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('message', sa.Text, nullable=False),
        sa.Column('service', sa.String(100), nullable=False),
        sa.Column('organisation_id', sa.String(36), nullable=True),
        sa.Column('correlation_id', sa.String(50), nullable=True),
        sa.Column('request_id', sa.String(50), nullable=True),
        sa.Column('user_id', sa.String(36), nullable=True),
        sa.Column('trace_id', sa.String(50), nullable=True),
        sa.Column('span_id', sa.String(50), nullable=True),
        sa.Column('duration_ms', sa.Float, nullable=True),
        sa.Column('metadata', sa.JSON, nullable=True),
        sa.Column('tags', sa.JSON, nullable=True),
        sa.Column('error', sa.JSON, nullable=True),
        sa.Column('stack_trace', sa.Text, nullable=True),
    )
    op.create_index('ix_structured_logs_level', 'structured_logs', ['level'])
    op.create_index('ix_structured_logs_category', 'structured_logs', ['category'])
    op.create_index('ix_structured_logs_timestamp', 'structured_logs', ['timestamp'])
    op.create_index('ix_structured_logs_org', 'structured_logs', ['organisation_id'])
    op.create_index('ix_structured_logs_correlation', 'structured_logs', ['correlation_id'])

    # ── Vulnerability Scans (optional persistence) ────────────────────────────
    op.create_table(
        'vulnerability_scans',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('scanned_at', sa.String(50), nullable=False),
        sa.Column('ecosystem', sa.String(50), nullable=False),
        sa.Column('organisation_id', sa.String(36), nullable=True),
        sa.Column('scanned_by', sa.String(36), nullable=True),
        sa.Column('package_count', sa.Integer, nullable=False, default=0),
        sa.Column('vulnerability_count', sa.Integer, nullable=False, default=0),
        sa.Column('critical_count', sa.Integer, nullable=False, default=0),
        sa.Column('high_count', sa.Integer, nullable=False, default=0),
        sa.Column('medium_count', sa.Integer, nullable=False, default=0),
        sa.Column('low_count', sa.Integer, nullable=False, default=0),
        sa.Column('sla_breached_count', sa.Integer, nullable=False, default=0),
        sa.Column('scan_duration_ms', sa.Integer, nullable=True),
        sa.Column('vulnerabilities', sa.JSON, nullable=True),
        sa.Column('error', sa.Text, nullable=True),
    )
    op.create_index('ix_vuln_scans_org', 'vulnerability_scans', ['organisation_id'])
    op.create_index('ix_vuln_scans_ecosystem', 'vulnerability_scans', ['ecosystem'])
    op.create_index('ix_vuln_scans_scanned_at', 'vulnerability_scans', ['scanned_at'])

    # ── Compliance Reports (optional persistence) ─────────────────────────────
    op.create_table(
        'compliance_reports',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('framework', sa.String(50), nullable=False),
        sa.Column('organisation_id', sa.String(36), nullable=False),
        sa.Column('generated_at', sa.String(50), nullable=False),
        sa.Column('generated_by', sa.String(36), nullable=True),
        sa.Column('total_controls', sa.Integer, nullable=False, default=0),
        sa.Column('passing', sa.Integer, nullable=False, default=0),
        sa.Column('failing', sa.Integer, nullable=False, default=0),
        sa.Column('warning', sa.Integer, nullable=False, default=0),
        sa.Column('not_tested', sa.Integer, nullable=False, default=0),
        sa.Column('overall_score', sa.Float, nullable=False, default=0.0),
        sa.Column('certification_ready', sa.Boolean, nullable=False, default=False),
        sa.Column('control_results', sa.JSON, nullable=True),
        sa.Column('critical_findings', sa.JSON, nullable=True),
        sa.Column('recommendations', sa.JSON, nullable=True),
    )
    op.create_index('ix_compliance_reports_org', 'compliance_reports', ['organisation_id'])
    op.create_index('ix_compliance_reports_framework', 'compliance_reports', ['framework'])
    op.create_index('ix_compliance_reports_generated_at', 'compliance_reports', ['generated_at'])

    # ── Generated Projects (optional persistence) ─────────────────────────────
    op.create_table(
        'generated_projects',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), nullable=False, unique=True),
        sa.Column('project_name', sa.String(255), nullable=False),
        sa.Column('project_type', sa.String(50), nullable=False),
        sa.Column('language', sa.String(50), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('organisation_id', sa.String(36), nullable=True),
        sa.Column('generated_by', sa.String(36), nullable=True),
        sa.Column('generated_at', sa.String(50), nullable=False),
        sa.Column('total_files', sa.Integer, nullable=False, default=0),
        sa.Column('total_lines', sa.Integer, nullable=False, default=0),
        sa.Column('ai_model_used', sa.String(100), nullable=True),
        sa.Column('features', sa.JSON, nullable=True),
        sa.Column('file_manifest', sa.JSON, nullable=True),
    )
    op.create_index('ix_gen_projects_org', 'generated_projects', ['organisation_id'])
    op.create_index('ix_gen_projects_type', 'generated_projects', ['project_type'])

    # ── Version History (optional persistence) ────────────────────────────────
    op.create_table(
        'version_history_entries',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('version_number', sa.Integer, nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.String(255), nullable=False),
        sa.Column('entity_name', sa.String(255), nullable=False),
        sa.Column('change_type', sa.String(50), nullable=False),
        sa.Column('message', sa.Text, nullable=True),
        sa.Column('author', sa.String(36), nullable=True),
        sa.Column('timestamp', sa.String(50), nullable=False),
        sa.Column('snapshot_id', sa.String(36), nullable=False),
        sa.Column('previous_snapshot_id', sa.String(36), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=True),
        sa.Column('size_bytes', sa.Integer, nullable=True),
        sa.Column('tags', sa.JSON, nullable=True),
        sa.Column('metadata', sa.JSON, nullable=True),
    )
    op.create_index('ix_vh_entity', 'version_history_entries', ['entity_type', 'entity_id'])
    op.create_index('ix_vh_author', 'version_history_entries', ['author'])
    op.create_index('ix_vh_timestamp', 'version_history_entries', ['timestamp'])

    op.create_table(
        'version_snapshots',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('size_bytes', sa.Integer, nullable=False),
        sa.Column('created_at', sa.String(50), nullable=False),
        sa.Column('content', sa.Text, nullable=True),
        sa.Column('metadata', sa.JSON, nullable=True),
    )
    op.create_index('ix_vs_content_hash', 'version_snapshots', ['content_hash'])


def downgrade() -> None:
    op.drop_table('version_snapshots')
    op.drop_table('version_history_entries')
    op.drop_table('generated_projects')
    op.drop_table('compliance_reports')
    op.drop_table('vulnerability_scans')
    op.drop_table('structured_logs')