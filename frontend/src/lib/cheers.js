export const CHEERS = [
  { key: 'strong', emoji: '💪', label: 'Força!' },
  { key: 'fire', emoji: '🔥', label: 'Tá pegando fogo!' },
  { key: 'clap', emoji: '👏', label: 'Mandou bem!' },
  { key: 'go', emoji: '🚀', label: 'Bora!' },
];

export const cheerOf = (key) => CHEERS.find((cheer) => cheer.key === key) ?? CHEERS[0];
