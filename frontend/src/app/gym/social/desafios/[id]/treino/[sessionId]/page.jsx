'use client';
import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getChallengeSession } from '../../../../../../../lib/api';
import WorkoutDetail from '../../../../../../../components/gym/social/WorkoutDetail';

export default function ChallengeWorkoutPage() {
  const { id, sessionId } = useParams();
  const load = useCallback(() => getChallengeSession(id, sessionId), [id, sessionId]);
  return <WorkoutDetail load={load} backHref={`/gym/social/desafios/${id}?aba=atividade`} backLabel="Desafio" />;
}
