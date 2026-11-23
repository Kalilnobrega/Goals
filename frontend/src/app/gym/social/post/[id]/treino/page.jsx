'use client';
import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { copyPostWorkout, getPostWorkout } from '../../../../../../lib/api';
import WorkoutDetail from '../../../../../../components/gym/social/WorkoutDetail';

export default function PostWorkoutPage() {
  const { id } = useParams();
  const load = useCallback(() => getPostWorkout(id), [id]);
  const copy = useCallback(() => copyPostWorkout(id), [id]);
  return <WorkoutDetail load={load} copy={copy} backHref={`/gym/social/post/${id}`} backLabel="Post" />;
}
