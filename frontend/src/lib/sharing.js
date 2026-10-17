export function deleteGoalMessage(goal) {
  if (goal?.group_kind === 'collaborative') {
    return 'Excluir esta meta para todos os participantes? Isso não pode ser desfeito.';
  }
  if (goal?.group_kind === 'challenge') {
    return 'Encerrar o desafio e excluir a sua meta? Os outros participantes ficam com as metas deles como metas pessoais.';
  }
  return 'Excluir esta meta e todas as suas tarefas?';
}
