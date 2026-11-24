'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getLiveFriends } from '../../../lib/api';
import Avatar from './Avatar';
import styles from './LiveNow.module.css';

const REFRESH_MS = 30000;

const minutesSince = (iso, now) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

export default function LiveNow() {
  const [people, setPeople] = useState([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => getLiveFriends()
      .then((list) => {
        if (!active) return;
        setPeople(list);
        setNow(Date.now());
      })
      .catch(() => {});
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!people.length) return null;

  return (
    <section className={styles.strip} aria-label="Treinando agora">
      <h2 className={styles.title}><span className={styles.dot} aria-hidden="true" /> Treinando agora</h2>
      <ul className={styles.list}>
        {people.map((person) => (
          <li key={person.username}>
            <Link href={`/gym/u/${person.username}/ao-vivo`} className={styles.item}>
              <Avatar name={person.name} />
              <span className={styles.text}>
                <span className={styles.name}>{person.name.split(' ')[0]}</span>
                <span className={styles.meta}>{person.session_name} · {minutesSince(person.started_at, now)} min</span>
              </span>
              <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
