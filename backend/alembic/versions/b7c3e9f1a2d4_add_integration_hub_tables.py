"""Add integration hub tables (connectors, webhooks, deliveries)

Revision ID: b7c3e9f1a2d4
Revises: 894366a8346d
Create Date: 2026-02-25T06:42:05.023022
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = 'b7c3e9f1a2d4'
down_revision: Union[str, None] = '894366a8346d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- integration_connectors ---
    op.create_table(
        'integration_connectors',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organisation_id', sa.String(), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon_url', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=False, server_default='general'),
        sa.Column('base_url', sa.String(), nullable=False),
        sa.Column('auth_type', sa.Enum('api_key', 'oauth2', 'bearer', 'basic', 'webhook_secret', 'none', name='connectorauthtype'), nullable=True, server_default='bearer'),
        sa.Column('auth_config', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('headers', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('rate_limit_rpm', sa.Integer(), nullable=True, server_default='60'),
        sa.Column('status', sa.Enum('active', 'inactive', 'error', 'pending_auth', 'rate_limited', name='connectorstatus'), nullable=True, server_default='inactive'),
        sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('request_count', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('error_count', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('capabilities', sa.JSON(), nullable=True, server_default='[]'),
        sa.Column('supported_events', sa.JSON(), nullable=True, server_default='[]'),
        sa.Column('config_schema', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('user_config', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('is_built_in', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('is_sandboxed', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('version', sa.String(), nullable=True, server_default="'1.0.0'"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_connector_org_slug', 'integration_connectors', ['organisation_id', 'slug'])
    op.create_index('ix_integration_connectors_organisation_id', 'integration_connectors', ['organisation_id'])
    op.create_index('ix_integration_connectors_slug', 'integration_connectors', ['slug'])
    op.create_index('ix_integration_connectors_category', 'integration_connectors', ['category'])

    # --- webhook_endpoints ---
    op.create_table(
        'webhook_endpoints',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('connector_id', sa.String(), sa.ForeignKey('integration_connectors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('event_type', sa.Enum('incoming', 'outgoing', name='webhookeventtype'), nullable=True, server_default='incoming'),
        sa.Column('url', sa.String(), nullable=True),
        sa.Column('path_suffix', sa.String(), nullable=True),
        sa.Column('hmac_secret', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('event_filters', sa.JSON(), nullable=True, server_default='[]'),
        sa.Column('headers', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('max_retries', sa.Integer(), nullable=True, server_default='3'),
        sa.Column('retry_delay_seconds', sa.Integer(), nullable=True, server_default='60'),
        sa.Column('trigger_count', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('failure_count', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('last_triggered', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('path_suffix'),
    )
    op.create_index('ix_webhook_endpoints_connector_id', 'webhook_endpoints', ['connector_id'])
    op.create_index('ix_webhook_endpoints_path_suffix', 'webhook_endpoints', ['path_suffix'])

    # --- webhook_deliveries ---
    op.create_table(
        'webhook_deliveries',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('webhook_id', sa.String(), sa.ForeignKey('webhook_endpoints.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('response_status', sa.Integer(), nullable=True),
        sa.Column('response_body', sa.Text(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('attempt', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_webhook_deliveries_webhook_id', 'webhook_deliveries', ['webhook_id'])
    op.create_index('idx_delivery_webhook_time', 'webhook_deliveries', ['webhook_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('webhook_deliveries')
    op.drop_table('webhook_endpoints')
    op.drop_table('integration_connectors')
    op.execute("DROP TYPE IF EXISTS connectorstatus")
    op.execute("DROP TYPE IF EXISTS connectorauthtype")
    op.execute("DROP TYPE IF EXISTS webhookeventtype")
