export function formatValue(value, unit) {
  if (value === null || value === undefined) return '';
  const number = Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (!unit) return number;
  return unit === 'R$' ? `R$ ${number}` : `${number} ${unit}`;
}

export function formatProgressValue(goal) {
  return `${formatValue(goal.current_value ?? 0)} / ${formatValue(goal.target_value, goal.unit)}`;
}

export function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw);
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
