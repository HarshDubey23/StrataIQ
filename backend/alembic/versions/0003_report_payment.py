"""report payment: when a project's report was paid for, and the payment link it was paid through

Revision ID: 0003_report_payment
Revises: 0002_field_research
Create Date: 2026-11-14
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_report_payment"
down_revision = "0002_field_research"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("projects", sa.Column("payment_ref", sa.String(120), nullable=True))


def downgrade():
    op.drop_column("projects", "payment_ref")
    op.drop_column("projects", "paid_at")
