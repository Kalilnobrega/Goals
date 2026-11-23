"""add manual check-ins: challenge option and check-in fields on posts

Revision ID: b8e4f1a6c3d7
Revises: a7d2e9c4f6b1
Create Date: 2026-11-24 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8e4f1a6c3d7'
down_revision: Union[str, Sequence[str], None] = 'a7d2e9c4f6b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_challenges', sa.Column('allow_manual', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('fitness_posts', sa.Column('minutes', sa.Integer(), nullable=True))
    op.add_column('fitness_posts', sa.Column('performed_on', sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_posts') as batch_op:
        batch_op.drop_column('performed_on')
        batch_op.drop_column('minutes')
    with op.batch_alter_table('fitness_challenges') as batch_op:
        batch_op.drop_column('allow_manual')
