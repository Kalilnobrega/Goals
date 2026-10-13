/**
 * Formata uma data ISO (vinda da API) como DD/MM/AAAA usando os componentes
 * UTC do valor, nunca o fuso do navegador. Prazos sao guardados como
 * "meia-noite UTC" do dia escolhido — usar new Date(...).toLocaleDateString()
 * converte pro fuso local e pode voltar um dia (ex: meia-noite UTC vira 21h
 * do dia anterior em UTC-3).
 */
export function formatDeadline(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export const WEEKDAYS = [
  { value: 0, short: 'Seg' },
  { value: 1, short: 'Ter' },
  { value: 2, short: 'Qua' },
  { value: 3, short: 'Qui' },
  { value: 4, short: 'Sex' },
  { value: 5, short: 'Sáb' },
  { value: 6, short: 'Dom' },
];

export function formatWeekdays(days) {
  if (!days?.length) return '';
  if (days.length === 7) return 'Todo dia';
  return WEEKDAYS.filter(d => days.includes(d.value)).map(d => d.short).join(', ');
}

export function formatDateTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function cycleNotStarted(goal) {
  return !!goal?.cycle_start_date && new Date(goal.cycle_start_date) > new Date();
}
