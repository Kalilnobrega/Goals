export function deleteGoalConfirm(goal) {
  const title = <strong>{goal?.title}</strong>;
  if (goal?.group_kind === 'collaborative') {
    return {
      title: 'Excluir meta para todos',
      message: [<>{title} será excluída para todos os participantes, junto com as tarefas e os registros.</>, 'Isso não pode ser desfeito.'],
      confirmLabel: 'Excluir para todos',
    };
  }
  if (goal?.group_kind === 'challenge') {
    return {
      title: 'Encerrar desafio',
      message: [<>Sua meta {title} será excluída e o desafio acaba.</>, 'Os outros participantes ficam com as metas deles como metas pessoais.'],
      confirmLabel: 'Encerrar desafio',
    };
  }
  return {
    title: 'Excluir meta',
    message: [<>{title} e todas as suas tarefas serão excluídas.</>, 'Isso não pode ser desfeito.'],
    confirmLabel: 'Excluir',
  };
}
