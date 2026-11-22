export const MUSCLE_GROUPS = [
  { value: 'chest', label: 'Peito' },
  { value: 'back', label: 'Costas' },
  { value: 'shoulders', label: 'Ombros' },
  { value: 'biceps', label: 'Bíceps' },
  { value: 'triceps', label: 'Tríceps' },
  { value: 'forearms', label: 'Antebraço' },
  { value: 'quads', label: 'Quadríceps' },
  { value: 'hamstrings', label: 'Posteriores' },
  { value: 'calves', label: 'Panturrilhas' },
  { value: 'adductors', label: 'Adutores' },
  { value: 'glutes', label: 'Glúteos' },
  { value: 'abs', label: 'Abdômen' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Outros' },
];

export const EQUIPMENT = [
  { value: 'barbell', label: 'Barra' },
  { value: 'dumbbell', label: 'Halteres' },
  { value: 'machine', label: 'Máquina de placas' },
  { value: 'plate_loaded', label: 'Máquina com anilhas' },
  { value: 'cable', label: 'Cabo' },
  { value: 'smith', label: 'Smith' },
  { value: 'bodyweight', label: 'Peso corporal' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Elástico' },
  { value: 'cardio', label: 'Aparelho de cardio' },
  { value: 'other', label: 'Outro' },
];

export const GRIPS = [
  { value: 'pronated', label: 'Pronada' },
  { value: 'supinated', label: 'Supinada' },
  { value: 'neutral', label: 'Neutra' },
];

const labelOf = (list) => (value) => list.find(item => item.value === value)?.label ?? value;

export const muscleLabel = labelOf(MUSCLE_GROUPS);
export const equipmentLabel = labelOf(EQUIPMENT);
export const gripLabel = (value) => (value ? labelOf(GRIPS)(value) : 'Outra');

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

export const repsLabel = (min, max) => (max && max !== min ? `${min}–${max}` : `${min}`);

function targetText(tracking, sets, min, max) {
  if (tracking === 'cardio') return `${min} min`;
  if (tracking === 'time') return `${sets} × ${min}s`;
  return `${sets} × ${repsLabel(min, max)}`;
}

export const prescription = (item) => targetText(item.exercise?.tracking, item.target_sets, item.reps_min, item.reps_max);

export function workoutMuscles(workout) {
  const counts = new Map();
  workout.exercises.forEach(({ exercise }) => {
    counts.set(exercise.muscle_group, (counts.get(exercise.muscle_group) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([group]) => muscleLabel(group));
}

export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export const cardioMinutes = (workout) => (workout?.cardio ?? []).reduce((sum, item) => sum + item.minutes, 0);
export const cardioNote = (workout) => (cardioMinutes(workout) ? ` · ${cardioMinutes(workout)} min de cardio` : '');

const kgFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const volumeFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const formatKg = (value) => kgFormat.format(value);

export const formatVolume = (value) => `${volumeFormat.format(value)} kg`;

export function parseKg(text) {
  const clean = String(text).trim().replace(',', '.');
  if (!clean || !/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value <= 1000 ? value : null;
}

export const kgInput = (value) => (value === null || value === undefined ? '' : formatKg(value).replace(/\./g, ''));

export const cleanKgInput = (text) => text.replace(/\./g, ',').replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '').slice(0, 7);

export const REST_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

export function formatRest(seconds) {
  if (!seconds) return 'Sem descanso';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest}s`;
  return rest ? `${minutes}min${String(rest).padStart(2, '0')}` : `${minutes}min`;
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const longDateFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

export const formatMonth = (iso) => monthFormat.format(new Date(iso)).replace(/^./, c => c.toUpperCase());
export const formatWeekday = (iso) => weekdayFormat.format(new Date(iso)).replace('.', '');
export const monthKey = (iso) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}`;
};

export const formatShortDate = (iso) => dateFormat.format(new Date(iso));
export const formatLongDate = (iso) => longDateFormat.format(new Date(iso));
export const formatTime = (iso) => timeFormat.format(new Date(iso));

export const sessionTarget = (item) =>
  item.target_sets ? targetText(item.tracking, item.target_sets, item.reps_min, item.reps_max) : null;

export const FORGOTTEN_AFTER_MS = 4 * 60 * 60 * 1000;

export const parseDay = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const formatDay = (iso) => dateFormat.format(parseDay(iso));
export const formatLongDay = (iso) => longDateFormat.format(parseDay(iso));

export function formatDelta(value, unit = 'kg') {
  const rounded = Math.round(value * 10) / 10;
  if (!rounded) return `0 ${unit}`;
  return `${rounded > 0 ? '+' : '−'}${formatKg(Math.abs(rounded))} ${unit}`;
}

export function daysAgo(iso, today) {
  const date = new Date(iso);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((parseDay(today) - day) / 86400000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 7) return `há ${diff} dias`;
  if (diff < 14) return 'há 1 semana';
  if (diff < 60) return `há ${Math.floor(diff / 7)} semanas`;
  return `em ${formatShortDate(iso)}`;
}

export const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const weekdayOf = (iso) => (parseDay(iso).getDay() + 6) % 7;

export const toIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const mondayOf = (iso) => {
  const date = parseDay(iso);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toIso(date);
};

export const addDays = (iso, days) => {
  const date = parseDay(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
};

export const BODY_REGIONS = [
  { key: 'trunk', label: 'Tronco', groups: ['chest', 'back', 'abs'] },
  { key: 'arms', label: 'Braços', groups: ['shoulders', 'biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'Pernas', groups: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'] },
];

export const MUSCLES = {
  chest_upper: { group: 'chest', label: 'Peitoral superior' },
  chest_mid: { group: 'chest', label: 'Peitoral médio' },
  chest_lower: { group: 'chest', label: 'Peitoral inferior' },
  lats: { group: 'back', label: 'Latíssimo do dorso' },
  infraspinatus: { group: 'back', label: 'Infraespinhal' },
  teres_major: { group: 'back', label: 'Redondo maior' },
  traps_upper: { group: 'back', label: 'Trapézio superior' },
  traps_mid: { group: 'back', label: 'Trapézio médio' },
  rhomboids: { group: 'back', label: 'Romboides' },
  lower_back: { group: 'back', label: 'Lombar' },
  abs_rectus: { group: 'abs', label: 'Reto abdominal' },
  obliques: { group: 'abs', label: 'Oblíquos' },
  delts_front: { group: 'shoulders', label: 'Deltoide anterior' },
  delts_side: { group: 'shoulders', label: 'Deltoide lateral' },
  delts_rear: { group: 'shoulders', label: 'Deltoide posterior' },
  biceps: { group: 'biceps', label: 'Bíceps' },
  brachialis: { group: 'biceps', label: 'Braquial' },
  triceps_long: { group: 'triceps', label: 'Tríceps (cabeça longa)' },
  triceps_lateral: { group: 'triceps', label: 'Tríceps (cabeça lateral)' },
  triceps_medial: { group: 'triceps', label: 'Tríceps (cabeça medial)' },
  brachioradialis: { group: 'forearms', label: 'Braquiorradial' },
  forearm_flexors: { group: 'forearms', label: 'Flexores do antebraço' },
  forearm_extensors: { group: 'forearms', label: 'Extensores do antebraço' },
  rectus_femoris: { group: 'quads', label: 'Reto femoral' },
  vastus_lateralis: { group: 'quads', label: 'Vasto lateral' },
  vastus_medialis: { group: 'quads', label: 'Vasto medial' },
  biceps_femoris: { group: 'hamstrings', label: 'Bíceps femoral' },
  semitendinosus: { group: 'hamstrings', label: 'Semitendíneo' },
  glute_max: { group: 'glutes', label: 'Glúteo máximo' },
  glute_med: { group: 'glutes', label: 'Glúteo médio' },
  adductors: { group: 'adductors', label: 'Adutores' },
  gastrocnemius: { group: 'calves', label: 'Gastrocnêmio' },
  soleus: { group: 'calves', label: 'Sóleo' },
};

export const INTENSITY = [
  { value: 'low', label: 'Baixo', perRep: 3, fixed: 3 },
  { value: 'moderate', label: 'Moderado', perRep: 3.75, fixed: 4 },
  { value: 'high', label: 'Alto', perRep: 4.25, fixed: 5 },
  { value: 'very_high', label: 'Muito alto', perRep: 5, fixed: 8 },
];

export const intensityLabel = (value) => INTENSITY.find(item => item.value === value)?.label ?? '—';

export function setEstimate(value, reps = 10) {
  const level = INTENSITY.find(item => item.value === value);
  return level ? Math.round(reps * level.perRep + level.fixed) : null;
}

export function guessIntensity(muscleGroup, muscles = []) {
  const primary = muscles.filter(item => item.role === 'primary').map(item => item.muscle);
  const groups = new Set(primary.map(muscle => MUSCLES[muscle]?.group));
  const legs = ['quads', 'hamstrings', 'glutes', 'adductors'].filter(group => groups.has(group)).length;
  if (legs >= 2 || (primary.includes('lower_back') && groups.size >= 2)) return 'very_high';
  if (['abs', 'biceps', 'triceps', 'forearms', 'calves', 'shoulders'].includes(muscleGroup)) return 'low';
  if (['chest', 'back'].includes(muscleGroup)) return 'high';
  return 'moderate';
}

export const muscleName = (key) => MUSCLES[key]?.label ?? key;

export const VOLUME_BANDS = [
  { key: 'low', label: 'Volume baixo', short: 'Baixo', color: 'color-mix(in srgb, var(--gym-accent) 40%, var(--gym-surface-3))' },
  { key: 'medium', label: 'Volume médio', short: 'Médio', color: 'var(--gym-accent)' },
  { key: 'high', label: 'Volume alto', short: 'Alto', color: '#f59e0b' },
];

export const volumeBand = (sets) => (sets < 10 ? VOLUME_BANDS[0] : sets <= 20 ? VOLUME_BANDS[1] : VOLUME_BANDS[2]);

const ROLE_CREDIT = { primary: 1, secondary: 0.5, auxiliary: 0.25 };

export const roleCredit = (role) => ROLE_CREDIT[role] ?? 0;

export function muscleSets(entries) {
  const totals = {};
  entries.forEach(({ muscles, sets }) => {
    const credit = {};
    (muscles ?? []).forEach(m => { credit[m.muscle] = Math.max(credit[m.muscle] ?? 0, roleCredit(m.role)); });
    Object.entries(credit).forEach(([muscle, value]) => { totals[muscle] = (totals[muscle] ?? 0) + value * sets; });
  });
  return totals;
}

export const formatSets = (value) => `${formatKg(Math.round(value * 10) / 10)} ${value === 1 ? 'série' : 'séries'}`;

export const SIDE_LABEL = { left: 'E', right: 'D' };
export const SIDE_NAME = { left: 'Esquerda', right: 'Direita' };

export const SIDE_LOAD_EQUIPMENT = ['barbell', 'dumbbell', 'plate_loaded', 'smith', 'cable'];
export const canLoadPerSide = (equipment, unilateral, tracking) => SIDE_LOAD_EQUIPMENT.includes(equipment) && !unilateral && (tracking ?? 'reps') === 'reps';
export const perSide = (item) => item.load_mode === 'side' && canLoadPerSide(item.equipment, item.unilateral, item.tracking);

export const RIR_OPTIONS = [0, 1, 2, 3, 4];
export const rirLabel = (value) => (value >= 4 ? '4+' : String(value));

export const seriesCount = (sets) => new Set(sets.map(entry => (entry.side ? `p${entry.position}` : `s${entry.id}`))).size;

export function renumberSets(sets) {
  const counters = {};
  return sets.map(entry => {
    const key = entry.side ?? 'both';
    counters[key] = (counters[key] ?? 0) + 1;
    return { ...entry, position: counters[key] };
  });
}

export const nextPosition = (sets, side = null) => sets.filter(entry => (entry.side ?? null) === side).length + 1;

export function seriesRows(sets) {
  const pairs = new Map();
  const rows = [];
  sets.forEach(entry => {
    if (!entry.side) {
      rows.push({ key: `s${entry.id}`, position: entry.position, entry });
      return;
    }
    let row = pairs.get(entry.position);
    if (!row) {
      row = { key: `p${entry.position}`, position: entry.position, left: null, right: null };
      pairs.set(entry.position, row);
      rows.push(row);
    }
    row[entry.side] = entry;
  });
  return rows.sort((a, b) => a.position - b.position);
}

export const formatSeconds = (seconds) => (seconds == null ? '—' : seconds < 60 ? `${Math.round(seconds)}s` : formatRest(Math.round(seconds)));

export function exerciseGroups(exercise) {
  const groups = [exercise.muscle_group];
  (exercise.muscles ?? []).forEach(item => {
    const group = MUSCLES[item.muscle]?.group;
    if (item.role === 'primary' && group && !groups.includes(group)) groups.push(group);
  });
  return groups;
}

export function groupsLabel(exercise) {
  const labels = exerciseGroups(exercise).map(muscleLabel);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}` : labels[0];
}

const rankIn = (list) => (value) => {
  const index = list.findIndex(item => item.value === value);
  return index === -1 ? list.length : index;
};

const equipmentRank = rankIn(EQUIPMENT);
const gripRank = rankIn(GRIPS);

const variantOrder = (a, b) => gripRank(a.grip) - gripRank(b.grip) || equipmentRank(a.equipment) - equipmentRank(b.equipment);

export function groupFamilies(exercises, sortByName = true) {
  const byKey = new Map();
  const families = [];
  exercises.forEach(exercise => {
    const key = exercise.family ? `f:${exercise.family}` : `e:${exercise.id}`;
    let family = byKey.get(key);
    if (!family) {
      family = { key, name: exercise.family ?? exercise.name, variants: [] };
      byKey.set(key, family);
      families.push(family);
    }
    family.variants.push(exercise);
  });
  families.forEach(family => family.variants.sort(variantOrder));
  return sortByName ? families.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) : families;
}

const distinct = (values) => [...new Set(values)];

export const hasGrips = (variants) => distinct(variants.map(variant => variant.grip ?? null)).length > 1;

const labelGroup = (variants, labelFor) => distinct(variants.map(labelFor))
  .map(label => ({ label, ids: variants.filter(variant => labelFor(variant) === label).map(variant => variant.id) }));

export function familyLabelGroups(variants) {
  const equipment = labelGroup(variants, variant => equipmentLabel(variant.equipment));
  return hasGrips(variants) ? [labelGroup(variants, variant => gripLabel(variant.grip)), equipment] : [equipment];
}

export function gripGroups(variants) {
  if (!hasGrips(variants)) return [{ grip: null, label: null, variants }];
  return distinct(variants.map(variant => variant.grip ?? null))
    .map(grip => ({ grip, label: gripLabel(grip), variants: variants.filter(variant => (variant.grip ?? null) === grip) }));
}

export function variantRows(variants, current) {
  if (!current || variants.length < 2) return [];
  const grip = current.grip ?? null;
  const rows = [];
  if (hasGrips(variants)) {
    rows.push({
      key: 'grip',
      label: 'Pegada',
      options: gripGroups(variants).map(group => ({
        key: group.grip ?? 'other',
        label: group.label,
        active: group.grip === grip,
        variant: group.variants.find(variant => variant.equipment === current.equipment) ?? group.variants[0],
      })),
    });
  }
  const equipments = distinct(variants.map(variant => variant.equipment));
  if (equipments.length > 1) {
    rows.push({
      key: 'equipment',
      label: 'Equipamento',
      options: variants
        .filter(variant => (variant.grip ?? null) === grip)
        .map(variant => ({ key: variant.id, label: equipmentLabel(variant.equipment), active: variant.id === current.id, variant })),
    });
  }
  return rows;
}

export const variantTitle = (variants) => (hasGrips(variants) ? 'Variação' : 'Equipamento');
export const variantHint = (variants) => (hasGrips(variants) ? 'Mesmo exercício, outra pegada ou equipamento' : 'Mesmo exercício, outro equipamento');

export function familySiblings(exercise, exercises) {
  if (!exercise?.family || !exercises) return [];
  return groupFamilies(exercises.filter(item => item.family === exercise.family))[0]?.variants ?? [];
}

export const TRACKING = [
  { value: 'reps', label: 'Carga e repetições' },
  { value: 'time', label: 'Tempo (isométrico)' },
  { value: 'cardio', label: 'Cardio' },
];

export const hasIncline = (name) => /esteira|corrida|caminhada/i.test(name ?? '');

export function setSummary(entry, tracking = 'reps', extra = false) {
  if (tracking === 'cardio') {
    return [
      formatClock(entry.duration_seconds ?? 0),
      entry.distance_km ? `${formatKg(entry.distance_km)} km` : null,
      entry.speed_kmh ? `${formatKg(entry.speed_kmh)} km/h` : null,
      entry.level ? `nível ${entry.level}` : null,
      entry.incline_pct ? `inclinação ${formatKg(entry.incline_pct)}%` : null,
      entry.calories ? `${entry.calories} kcal` : null,
    ].filter(Boolean).join(' · ');
  }
  if (tracking === 'time') {
    const clock = formatClock(entry.duration_seconds ?? 0);
    return entry.weight_kg > 0 ? `${clock} · ${extra ? 'PC + ' : '+'}${formatKg(entry.weight_kg)} kg` : clock;
  }
  const load = entry.weight_kg > 0 ? `${extra ? 'PC + ' : ''}${formatKg(entry.weight_kg)} kg` : 'Peso corporal';
  return `${load} × ${entry.reps}`;
}

export const SUPERSET_LETTERS = 'ABCDEFGHIJ';

export function supersetUnits(items, groupOf = (item) => item.superset ?? null) {
  const units = [];
  items.forEach((item, index) => {
    const group = groupOf(item, index);
    const last = units.at(-1);
    if (group !== null && last && last.group === group) last.items.push(item);
    else units.push({ group, items: [item] });
  });
  return units.map(unit => (unit.items.length > 1 ? unit : { ...unit, group: null }));
}

export function supersetTurn(items) {
  const open = items.filter(item => !item.target_sets || seriesCount(item.sets) < item.target_sets);
  if (!open.length) return null;
  const least = Math.min(...open.map(item => seriesCount(item.sets)));
  return open.find(item => seriesCount(item.sets) === least) ?? null;
}

export function supersetMarks(items) {
  const marks = [];
  let number = 0;
  supersetUnits(items).forEach(unit => {
    number += 1;
    unit.items.forEach((item, position) => marks.push({
      grouped: unit.group !== null,
      first: unit.group !== null && position === 0,
      last: unit.group === null || position === unit.items.length - 1,
      size: unit.items.length,
      label: unit.group === null ? String(number) : `${number}${SUPERSET_LETTERS[position]}`,
    }));
  });
  return marks;
}
