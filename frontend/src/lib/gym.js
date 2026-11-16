export const MUSCLE_GROUPS = [
  { value: 'chest', label: 'Peito' },
  { value: 'back', label: 'Costas' },
  { value: 'shoulders', label: 'Ombros' },
  { value: 'biceps', label: 'Bíceps' },
  { value: 'triceps', label: 'Tríceps' },
  { value: 'legs', label: 'Pernas' },
  { value: 'glutes', label: 'Glúteos' },
  { value: 'abs', label: 'Abdômen' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Outros' },
];

export const EQUIPMENT = [
  { value: 'barbell', label: 'Barra' },
  { value: 'dumbbell', label: 'Halteres' },
  { value: 'machine', label: 'Máquina' },
  { value: 'cable', label: 'Cabo' },
  { value: 'smith', label: 'Smith' },
  { value: 'bodyweight', label: 'Peso corporal' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Elástico' },
  { value: 'other', label: 'Outro' },
];

const labelOf = (list) => (value) => list.find(item => item.value === value)?.label ?? value;

export const muscleLabel = labelOf(MUSCLE_GROUPS);
export const equipmentLabel = labelOf(EQUIPMENT);

export const normalize = (text) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function apiError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const message = detail[0]?.msg;
    if (message) return message.replace(/^Value error, /, '');
  }
  return fallback;
}
