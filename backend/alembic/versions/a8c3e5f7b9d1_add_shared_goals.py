"""add shared goals

Revision ID: a8c3e5f7b9d1
Revises: f1b6d2c8a9e4
Create Date: 2026-10-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c3e5f7b9d1'
down_revision: Union[str, Sequence[str], None] = 'f1b6d2c8a9e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'goal_groups',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('kind', sa.Enum('COLLABORATIVE', 'CHALLENGE', name='groupkind'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'group_members',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.Enum('LEADER', 'MODERATOR', 'MEMBER', name='grouprole'), nullable=False),
        sa.Column('position', sa.Integer(), server_default='0', nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['group_id'], ['goal_groups.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', 'user_id'),
    )
    with op.batch_alter_table('group_members', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_group_members_group_id'), ['group_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_group_members_user_id'), ['user_id'], unique=False)

    op.create_table(
        'group_invites',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['goal_groups.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('group_invites', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_group_invites_group_id'), ['group_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_group_invites_token'), ['token'], unique=True)

    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('group_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_goals_group_id'), ['group_id'], unique=False)
        batch_op.create_foreign_key('fk_goals_group_id', 'goal_groups', ['group_id'], ['id'])

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('group_task_key', sa.String(length=36), nullable=True))
        batch_op.create_index(batch_op.f('ix_tasks_group_task_key'), ['group_task_key'], unique=False)

    with op.batch_alter_table('task_completions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_task_completions_user_id'), ['user_id'], unique=False)
        batch_op.create_foreign_key('fk_task_completions_user_id', 'users', ['user_id'], ['id'])

    with op.batch_alter_table('goal_entries', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_goal_entries_user_id'), ['user_id'], unique=False)
        batch_op.create_foreign_key('fk_goal_entries_user_id', 'users', ['user_id'], ['id'])

    op.execute(
        "UPDATE task_completions SET user_id = ("
        "SELECT goals.user_id FROM tasks JOIN goals ON goals.id = tasks.goals_id "
        "WHERE tasks.id = task_completions.task_id)"
    )
    op.execute(
        "UPDATE goal_entries SET user_id = ("
        "SELECT goals.user_id FROM goals WHERE goals.id = goal_entries.goal_id)"
    )


def downgrade() -> None:
    with op.batch_alter_table('goal_entries', schema=None) as batch_op:
        batch_op.drop_constraint('fk_goal_entries_user_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_goal_entries_user_id'))
        batch_op.drop_column('user_id')

    with op.batch_alter_table('task_completions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_task_completions_user_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_task_completions_user_id'))
        batch_op.drop_column('user_id')

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tasks_group_task_key'))
        batch_op.drop_column('group_task_key')

    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.drop_constraint('fk_goals_group_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_goals_group_id'))
        batch_op.drop_column('group_id')

    op.drop_table('group_invites')
    op.drop_table('group_members')
    op.drop_table('goal_groups')
    sa.Enum(name='grouprole').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='groupkind').drop(op.get_bind(), checkfirst=True)
