"""add full size version to fitness media

Revision ID: f3c7a9e1b5d2
Revises: e5b9c2a7d4f1
Create Date: 2026-11-23 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3c7a9e1b5d2'
down_revision: Union[str, Sequence[str], None] = 'e5b9c2a7d4f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_media', sa.Column('full_key', sa.String(200), nullable=True))
    op.add_column('fitness_media', sa.Column('full_content_type', sa.String(30), nullable=True))
    op.add_column('fitness_media', sa.Column('full_width', sa.Integer(), nullable=True))
    op.add_column('fitness_media', sa.Column('full_height', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_media') as batch_op:
        batch_op.drop_column('full_height')
        batch_op.drop_column('full_width')
        batch_op.drop_column('full_content_type')
        batch_op.drop_column('full_key')
