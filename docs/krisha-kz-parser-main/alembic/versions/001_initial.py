"""initial

Revision ID: 001
Revises:
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("interval_minutes", sa.Integer, nullable=False, server_default="30"),
        sa.Column(
            "status",
            sa.Enum("active", "paused", "deleted", name="taskstatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "listings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("advert_id", sa.String(64), nullable=False),
        sa.Column("listing_url", sa.String(2048), nullable=False),
        sa.Column("parsed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_listings_task_advert", "listings", ["task_id", "advert_id"], unique=True)

    op.create_table(
        "phones",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("listing_id", sa.Integer, sa.ForeignKey("listings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column(
            "waha_status",
            sa.Enum("pending", "sent", "failed", name="wahastatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("collected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_phones_task_phone", "phones", ["task_id", "phone"], unique=True)


def downgrade() -> None:
    op.drop_table("phones")
    op.drop_table("listings")
    op.drop_table("tasks")
    op.execute("DROP TYPE IF EXISTS taskstatus")
    op.execute("DROP TYPE IF EXISTS wahastatus")
