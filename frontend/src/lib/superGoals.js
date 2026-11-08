import { addGoalsToSuperGoal, removeGoalFromSuperGoal } from './api';

export function restoreSuperGoal(goalId, previousId, currentId) {
  if (previousId) return addGoalsToSuperGoal(previousId, [goalId]);
  return removeGoalFromSuperGoal(currentId, goalId);
}

export function superGoalTitle(superGoals, id) {
  return superGoals.find(sg => sg.id === id)?.title ?? 'supermeta';
}
