import {
  getBodyWeights, getExercises, getFitnessOverview, getFitnessStats, getHistory, getPlans,
  getProgressExercises, getProgressWorkouts, getWorkouts, peekCache,
} from './api';

const TAB_DATA = {
  '/gym': [['fitnessOverview', getFitnessOverview]],
  '/gym/plans': [['fitnessPlans', getPlans]],
  '/gym/workouts': [['fitnessWorkouts', getWorkouts]],
  '/gym/exercises': [['fitnessExercises', getExercises]],
  '/gym/history': [['fitnessHistory', () => getHistory()], ['fitnessWorkouts', getWorkouts]],
  '/gym/progress': [
    ['fitnessStats:3m:all', () => getFitnessStats('3m', null)],
    ['fitnessPlans', getPlans],
    ['fitnessProgressWorkouts', getProgressWorkouts],
    ['fitnessProgress', getProgressExercises],
    ['fitnessBodyWeight', getBodyWeights],
  ],
};

export function prefetchGymTab(href) {
  (TAB_DATA[href] ?? []).forEach(([key, load]) => {
    if (peekCache(key) === undefined) load().catch(() => {});
  });
}

export function prefetchGymTabs() {
  Object.keys(TAB_DATA).forEach(prefetchGymTab);
}
