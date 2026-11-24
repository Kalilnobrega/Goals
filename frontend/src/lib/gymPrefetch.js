import {
  getBodyWeights, getExercises, getFitnessOverview, getFitnessStats, getHistory, getPlans,
  getFeed, getProgressExercises, getProgressWorkouts, getWorkouts, peekCache,
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
  '/gym/social': [['fitnessFeed', () => getFeed()]],
};

const refused = new Set();

export function prefetchGymTab(href) {
  (TAB_DATA[href] ?? []).forEach(([key, load]) => {
    if (refused.has(key) || peekCache(key) !== undefined) return;
    load().catch((err) => {
      if (err?.response?.status === 409) refused.add(key);
    });
  });
}

export function prefetchGymTabs() {
  Object.keys(TAB_DATA).forEach(prefetchGymTab);
}
