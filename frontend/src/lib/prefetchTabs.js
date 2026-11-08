import { getGoals, getSuperGoals, getTodayTasks, getStreak, getStats, peekCache } from './api';

const TAB_DATA = {
  '/': [['goals', getGoals], ['today', getTodayTasks], ['streak', getStreak]],
  '/goals': [['goals', getGoals], ['superGoals', getSuperGoals]],
  '/stats': [['stats', getStats]],
};

export function prefetchTab(href) {
  (TAB_DATA[href] ?? []).forEach(([key, load]) => {
    if (peekCache(key) === undefined) load().catch(() => {});
  });
}

export function prefetchAllTabs() {
  Object.keys(TAB_DATA).forEach(prefetchTab);
}
