export const CHEERS = [
  { key: 'strong', emoji: '💪', label: 'Força!' },
  { key: 'go', emoji: '🚀', label: 'Bora!' },
];

export const cheerOf = (key) => CHEERS.find((cheer) => cheer.key === key) ?? CHEERS[0];
