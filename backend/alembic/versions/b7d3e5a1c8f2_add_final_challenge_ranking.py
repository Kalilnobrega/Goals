"""freeze the final ranking of finished challenges and allow longer notification details

Revision ID: b7d3e5a1c8f2
Revises: a5f8c2e9d4b6
Create Date: 2026-11-25 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d3e5a1c8f2'
down_revision: Union[str, Sequence[str], None] = 'a5f8c2e9d4b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_challenges', sa.Column('final_ranking', sa.JSON(), nullable=True))
    op.add_column('fitness_challenges', sa.Column('finalized_at', sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table('fitness_notifications') as batch:
        batch.alter_column('detail', type_=sa.String(60), existing_type=sa.String(20), existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('fitness_notifications') as batch:
        batch.alter_column('detail', type_=sa.String(20), existing_type=sa.String(60), existing_nullable=True)
    op.drop_column('fitness_challenges', 'finalized_at')
    op.drop_column('fitness_challenges', 'final_ranking')
