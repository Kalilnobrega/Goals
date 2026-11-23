'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSocialProfile, peekCache } from '../../../lib/api';
import styles from './close.module.css';

export function useCloseName(username) {
  const [name, setName] = useState(() => peekCache(`socialProfile:${username}`)?.name ?? '');
  useEffect(() => {
    getSocialProfile(username).then((profile) => setName(profile.name)).catch(() => {});
  }, [username]);
  return name.split(' ')[0];
}

export default function CloseHeader({ username, title }) {
  const first = useCloseName(username);
  return (
    <>
      <Link href={`/gym/u/${username}`} className={styles.back}><ChevronLeft size={18} /> Perfil</Link>
      <header className={styles.top}>
        <p className={styles.kicker}>{first ? `${title} de ${first}` : title}</p>
        <h1 className={styles.title}>{title}</h1>
      </header>
    </>
  );
}
