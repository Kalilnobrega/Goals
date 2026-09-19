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
