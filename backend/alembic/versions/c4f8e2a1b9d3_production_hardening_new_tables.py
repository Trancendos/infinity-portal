"""Production hardening: billing, workflows, artifacts, errors, security, AI training

Revision ID: c4f8e2a1b9d3
Revises: b7c3e9f1a2d4
Create Date: 2026-02-26 00:00:00.000000

Adds 15 new tables:
- usage_metrics, billing_accounts, invoices (Zero-Net-Cost / Monetisation)
- feature_flags (Runtime feature toggles)
- error_events (Structured error registry)
- workflow_definitions, workflow_executions (Workflow engine)
- artifact_repositories, artifacts, artifact_downloads (Artifact repository)
- ai_training_datasets, ai_model_evaluations, user_feedback (AI Builder)
- crypto_shred_events (GDPR Art. 17)
- merkle_audit_batches (On-chain audit log)
"""
from alembic import op
import sqlalchemy as sa

revision = 'c4f8e2a1b9d3'
down_revision = 'b7c3e9f1a2d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- usage_metrics ----
    op.create_table(
        'usage_metrics',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('date', sa.String(), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('api_calls', sa.Integer(), default=0),
        sa.Column('api_calls_failed', sa.Integer(), default=0),
        sa.Column('ai_generations', sa.Integer(), default=0),
        sa.Column('ai_tokens_input', sa.BigInteger(), default=0),
        sa.Column('ai_tokens_output', sa.BigInteger(), default=0),
        sa.Column('ai_cost_usd', sa.String(), default='0.000000'),
        sa.Column('storage_bytes_used', sa.BigInteger(), default=0),
        sa.Column('storage_bytes_uploaded', sa.BigInteger(), default=0),
        sa.Column('compute_seconds', sa.Integer(), default=0),
        sa.Column('build_minutes', sa.Integer(), default=0),
        sa.Column('active_users', sa.Integer(), default=0),
        sa.Column('kanban_tasks_created', sa.Integer(), default=0),
        sa.Column('documents_created', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date', 'organisation_id', 'user_id', name='uq_usage_date_org_user'),
    )
    op.create_index('idx_usage_date_org', 'usage_metrics', ['date', 'organisation_id'])

    # ---- billing_accounts ----
    op.create_table(
        'billing_accounts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('stripe_customer_id', sa.String(), nullable=True),
        sa.Column('stripe_subscription_id', sa.String(), nullable=True),
        sa.Column('stripe_payment_method_id', sa.String(), nullable=True),
        sa.Column('plan', sa.String(), default='free'),
        sa.Column('plan_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('plan_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('billing_email', sa.String(), nullable=True),
        sa.Column('billing_name', sa.String(), nullable=True),
        sa.Column('billing_address', sa.JSON()),
        sa.Column('currency', sa.String(), default='GBP'),
        sa.Column('tax_id', sa.String(), nullable=True),
        sa.Column('custom_ai_generations_limit', sa.Integer(), nullable=True),
        sa.Column('custom_storage_gb_limit', sa.Integer(), nullable=True),
        sa.Column('custom_users_limit', sa.Integer(), nullable=True),
        sa.Column('custom_api_calls_limit', sa.Integer(), nullable=True),
        sa.Column('balance_credits', sa.Integer(), default=0),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organisation_id'),
        sa.UniqueConstraint('stripe_customer_id'),
    )

    # ---- invoices ----
    op.create_table(
        'invoices',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('billing_account_id', sa.String(), sa.ForeignKey('billing_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('stripe_invoice_id', sa.String(), nullable=True),
        sa.Column('subtotal_pence', sa.Integer(), default=0),
        sa.Column('tax_pence', sa.Integer(), default=0),
        sa.Column('total_pence', sa.Integer(), default=0),
        sa.Column('amount_paid_pence', sa.Integer(), default=0),
        sa.Column('currency', sa.String(), default='GBP'),
        sa.Column('status', sa.String(), default='draft'),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('line_items', sa.JSON()),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('pdf_url', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('stripe_invoice_id'),
    )
    op.create_index('idx_invoice_billing_account', 'invoices', ['billing_account_id'])
    op.create_index('idx_invoice_org', 'invoices', ['organisation_id'])

    # ---- feature_flags ----
    op.create_table(
        'feature_flags',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('enabled', sa.Boolean(), default=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('rollout_percentage', sa.Integer(), default=100),
        sa.Column('conditions', sa.JSON()),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key', 'organisation_id', name='uq_feature_flag_key_org'),
    )
    op.create_index('idx_feature_flag_key', 'feature_flags', ['key'])

    # ---- error_events ----
    op.create_table(
        'error_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('error_code', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), default='error'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('stack_trace', sa.Text(), nullable=True),
        sa.Column('context', sa.JSON()),
        sa.Column('request_id', sa.String(), nullable=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('endpoint', sa.String(), nullable=True),
        sa.Column('http_method', sa.String(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('is_resolved', sa.Boolean(), default=False),
        sa.Column('occurrence_count', sa.Integer(), default=1),
        sa.Column('first_seen_at', sa.DateTime(timezone=True)),
        sa.Column('last_seen_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_error_code', 'error_events', ['error_code'])
    op.create_index('idx_error_unresolved', 'error_events', ['is_resolved', 'severity'])

    # ---- workflow_definitions ----
    op.create_table(
        'workflow_definitions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('trigger_type', sa.String(), default='manual'),
        sa.Column('trigger_config', sa.JSON()),
        sa.Column('steps', sa.JSON()),
        sa.Column('status', sa.String(), default='draft'),
        sa.Column('timeout_seconds', sa.Integer(), default=300),
        sa.Column('max_retries', sa.Integer(), default=3),
        sa.Column('tags', sa.JSON()),
        sa.Column('run_count', sa.Integer(), default=0),
        sa.Column('success_count', sa.Integer(), default=0),
        sa.Column('failure_count', sa.Integer(), default=0),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_status', sa.String(), nullable=True),
        sa.Column('version', sa.Integer(), default=1),
        sa.Column('previous_version_id', sa.String(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_workflow_org_status', 'workflow_definitions', ['organisation_id', 'status'])

    # ---- workflow_executions ----
    op.create_table(
        'workflow_executions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('workflow_id', sa.String(), sa.ForeignKey('workflow_definitions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('triggered_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('trigger_type', sa.String(), nullable=True),
        sa.Column('trigger_data', sa.JSON()),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('step_results', sa.JSON()),
        sa.Column('current_step_id', sa.String(), nullable=True),
        sa.Column('final_output', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_step_id', sa.String(), nullable=True),
        sa.Column('tokens_consumed', sa.Integer(), default=0),
        sa.Column('cost_usd', sa.String(), default='0.000000'),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_execution_workflow_status', 'workflow_executions', ['workflow_id', 'status'])

    # ---- artifact_repositories ----
    op.create_table(
        'artifact_repositories',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('artifact_type', sa.String(), nullable=False),
        sa.Column('visibility', sa.String(), default='org'),
        sa.Column('tags', sa.JSON()),
        sa.Column('extra_metadata', sa.JSON()),
        sa.Column('artifact_count', sa.Integer(), default=0),
        sa.Column('total_downloads', sa.Integer(), default=0),
        sa.Column('total_size_bytes', sa.BigInteger(), default=0),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_artifact_repo_org_type', 'artifact_repositories', ['organisation_id', 'artifact_type'])

    # ---- artifacts ----
    op.create_table(
        'artifacts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('repository_id', sa.String(), sa.ForeignKey('artifact_repositories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('uploaded_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('version', sa.String(), default='1.0.0'),
        sa.Column('artifact_type', sa.String(), nullable=False),
        sa.Column('storage_url', sa.String(), nullable=True),
        sa.Column('storage_key', sa.String(), nullable=True),
        sa.Column('checksum_sha256', sa.String(), nullable=True),
        sa.Column('size_bytes', sa.BigInteger(), default=0),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('data_classification', sa.String(), default='internal'),
        sa.Column('tags', sa.JSON()),
        sa.Column('extra_metadata', sa.JSON()),
        sa.Column('preview_url', sa.String(), nullable=True),
        sa.Column('download_count', sa.Integer(), default=0),
        sa.Column('last_downloaded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_latest', sa.Boolean(), default=True),
        sa.Column('previous_version_id', sa.String(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_artifact_repo_name', 'artifacts', ['repository_id', 'name'])

    # ---- artifact_downloads ----
    op.create_table(
        'artifact_downloads',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('artifact_id', sa.String(), sa.ForeignKey('artifacts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('downloaded_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_artifact_download_artifact', 'artifact_downloads', ['artifact_id'])

    # ---- ai_training_datasets ----
    op.create_table(
        'ai_training_datasets',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('approved_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('source_type', sa.String(), nullable=False),
        sa.Column('data_points_count', sa.Integer(), default=0),
        sa.Column('quality_score', sa.String(), nullable=True),
        sa.Column('status', sa.String(), default='draft'),
        sa.Column('storage_url', sa.String(), nullable=True),
        sa.Column('data_classification', sa.String(), default='confidential'),
        sa.Column('tags', sa.JSON()),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )

    # ---- ai_model_evaluations ----
    op.create_table(
        'ai_model_evaluations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('evaluated_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('model_provider', sa.String(), nullable=False),
        sa.Column('model_name', sa.String(), nullable=False),
        sa.Column('benchmark_name', sa.String(), nullable=False),
        sa.Column('benchmark_version', sa.String(), default='1.0'),
        sa.Column('overall_score', sa.String(), nullable=True),
        sa.Column('accuracy_score', sa.String(), nullable=True),
        sa.Column('latency_p50_ms', sa.Integer(), nullable=True),
        sa.Column('latency_p95_ms', sa.Integer(), nullable=True),
        sa.Column('latency_p99_ms', sa.Integer(), nullable=True),
        sa.Column('cost_per_1k_tokens_usd', sa.String(), nullable=True),
        sa.Column('tokens_per_second', sa.String(), nullable=True),
        sa.Column('test_prompts_count', sa.Integer(), default=0),
        sa.Column('passed_count', sa.Integer(), default=0),
        sa.Column('failed_count', sa.Integer(), default=0),
        sa.Column('results_detail', sa.JSON()),
        sa.Column('evaluated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_eval_model_benchmark', 'ai_model_evaluations', ['model_name', 'benchmark_name'])

    # ---- user_feedback ----
    op.create_table(
        'user_feedback',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('generation_request_id', sa.String(), nullable=True),
        sa.Column('content_type', sa.String(), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('feedback_category', sa.String(), nullable=True),
        sa.Column('feedback_text', sa.Text(), nullable=True),
        sa.Column('is_helpful', sa.Boolean(), nullable=True),
        sa.Column('included_in_dataset_id', sa.String(), nullable=True),
        sa.Column('anonymised_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_feedback_org_date', 'user_feedback', ['organisation_id', 'created_at'])

    # ---- crypto_shred_events ----
    op.create_table(
        'crypto_shred_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('initiated_by', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('target_user_id', sa.String(), nullable=True),
        sa.Column('target_entity_type', sa.String(), nullable=False),
        sa.Column('target_entity_id', sa.String(), nullable=False),
        sa.Column('dek_destroyed', sa.Boolean(), default=False),
        sa.Column('tables_affected', sa.JSON()),
        sa.Column('records_affected', sa.Integer(), default=0),
        sa.Column('legal_basis', sa.String(), nullable=True),
        sa.Column('request_reference', sa.String(), nullable=True),
        sa.Column('merkle_hash', sa.String(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by', sa.String(), nullable=True),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_shred_target_user', 'crypto_shred_events', ['target_user_id'])
    op.create_index('idx_shred_org_status', 'crypto_shred_events', ['organisation_id', 'status'])

    # ---- merkle_audit_batches ----
    op.create_table(
        'merkle_audit_batches',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('batch_number', sa.Integer(), nullable=False),
        sa.Column('event_count', sa.Integer(), nullable=False),
        sa.Column('first_event_id', sa.String(), nullable=True),
        sa.Column('last_event_id', sa.String(), nullable=True),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('merkle_root', sa.String(), nullable=False),
        sa.Column('leaf_hashes', sa.JSON()),
        sa.Column('chain_network', sa.String(), nullable=True),
        sa.Column('chain_tx_hash', sa.String(), nullable=True),
        sa.Column('chain_block_number', sa.Integer(), nullable=True),
        sa.Column('anchored_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('batch_number', 'organisation_id', name='uq_merkle_batch_org'),
    )
    op.create_index('idx_merkle_root', 'merkle_audit_batches', ['merkle_root'])


def downgrade() -> None:
    op.drop_table('merkle_audit_batches')
    op.drop_table('crypto_shred_events')
    op.drop_table('user_feedback')
    op.drop_table('ai_model_evaluations')
    op.drop_table('ai_training_datasets')
    op.drop_table('artifact_downloads')
    op.drop_table('artifacts')
    op.drop_table('artifact_repositories')
    op.drop_table('workflow_executions')
    op.drop_table('workflow_definitions')
    op.drop_table('error_events')
    op.drop_table('feature_flags')
    op.drop_table('invoices')
    op.drop_table('billing_accounts')
    op.drop_table('usage_metrics')