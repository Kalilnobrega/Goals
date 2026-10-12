export function formatValue(value, unit) {
  if (value === null || value === undefined) return '';
  const number = Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (!unit) return number;
  return unit === 'R$' ? `R$ ${number}` : `${number} ${unit}`;
}

export function formatProgressValue(goal) {
  return `${formatValue(goal.current_value ?? 0)} / ${formatValue(goal.target_value, goal.unit)}`;
}
