"""add facts version to users

Revision ID: a2c6e8f1d4b9
Revises: f2d8b4c6a9e3
Create Date: 2026-11-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2c6e8f1d4b9'
down_revision: Union[str, Sequence[str], None] = 'f2d8b4c6a9e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('facts_version', sa.String(16), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('facts_version')
