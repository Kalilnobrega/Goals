'use client';
import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getCloseSession } from '../../../../../../lib/api';
import WorkoutDetail from '../../../../../../components/gym/social/WorkoutDetail';

export default function CloseWorkoutPage() {
  const { username, id } = useParams();
  const load = useCallback(() => getCloseSession(username, id), [username, id]);
  return <WorkoutDetail load={load} backHref={`/gym/u/${username}/historico`} backLabel="Histórico" />;
}
