import dynamic from 'next/dynamic';

const loadSortable = () => import('../Sortable');
const loadPicker = () => import('./ExercisePicker');
const loadSummary = () => import('./SessionSummary');

export const SortableList = dynamic(() => loadSortable().then(m => m.SortableList));
export const SortableItem = dynamic(() => loadSortable().then(m => m.SortableItem));
export const DragHandle = dynamic(() => loadSortable().then(m => m.DragHandle));
export const ExercisePicker = dynamic(loadPicker);
export const SessionSummary = dynamic(loadSummary);

const idle = (run) => {
  if (typeof window === 'undefined') return () => {};
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
};

export function preloadSheets({ summary = false } = {}) {
  return idle(() => {
    loadSortable();
    loadPicker();
    if (summary) loadSummary();
  });
}
