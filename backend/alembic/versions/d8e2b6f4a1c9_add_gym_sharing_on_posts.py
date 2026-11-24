"""let people show their gym on posts and check-ins

Revision ID: d8e2b6f4a1c9
Revises: c4d9a2e6f1b3
Create Date: 2026-11-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8e2b6f4a1c9'
down_revision: Union[str, Sequence[str], None] = 'c4d9a2e6f1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_profiles', sa.Column('share_gym', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    with op.batch_alter_table('fitness_posts') as batch:
        batch.add_column(sa.Column('gym_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_fitness_posts_gym_id', 'fitness_gyms', ['gym_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('fitness_posts') as batch:
        batch.drop_constraint('fk_fitness_posts_gym_id', type_='foreignkey')
        batch.drop_column('gym_id')
    op.drop_column('fitness_profiles', 'share_gym')
