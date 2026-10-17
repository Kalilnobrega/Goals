'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import { previewInvite, acceptInvite } from '../../../lib/api';
import { Users, Trophy, ArrowRight, Link2Off } from 'lucide-react';
import styles from './page.module.css';

const KIND_META = {
  collaborative: {
    icon: Users,
    label: 'Meta colaborativa',
    desc: 'Todos contribuem para o mesmo progresso. O que você marcar vale para o grupo.',
  },
  challenge: {
    icon: Trophy,
    label: 'Desafio',
    desc: 'Você recebe a sua própria cópia da meta e compete com os outros no ranking.',
  },
};

export default function InvitePage() {
  const { token } = useParams();
  const router = useRouter();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    previewInvite(token)
      .then(setInvite)
      .catch((err) => setError(err?.response?.data?.detail || 'Convite inválido ou expirado.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      const { goal_id } = await acceptInvite(token);
      router.push(`/goals/${goal_id}`);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erro ao entrar na meta.');
      setJoining(false);
    }
  };

  const meta = invite ? KIND_META[invite.kind] : null;
  const Icon = meta?.icon;
  const full = invite && invite.member_count >= invite.member_limit;

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {loading ? (
          <div className={`${styles.card} ${styles.skeleton} glass`} />
        ) : !invite ? (
          <div className={`${styles.card} glass`}>
            <span className={`${styles.iconWrap} ${styles.iconMuted}`}><Link2Off size={28} /></span>
            <h1 className={styles.title}>Convite indisponível</h1>
            <p className={styles.sub}>{error}</p>
            <Link href="/goals" className={styles.secondaryBtn}>Ir para minhas metas</Link>
          </div>
        ) : (
          <div className={`${styles.card} glass`}>
            <span className={styles.iconWrap}><Icon size={28} /></span>
            <span className={styles.kind}>{meta.label}</span>
            <h1 className={styles.title}>{invite.goal_title}</h1>
            <p className={styles.sub}>
              <strong>{invite.leader_name}</strong> convidou você para participar.
            </p>
            <p className={styles.desc}>{meta.desc}</p>
            <p className={styles.count}>
              {invite.member_count} participante{invite.member_count !== 1 ? 's' : ''} · limite de {invite.member_limit}
            </p>

            {error && <p className={styles.error}>{error}</p>}

            {invite.is_member ? (
              <Link href={`/goals/${invite.goal_id}`} className={styles.primaryBtn}>
                Você já participa · abrir meta <ArrowRight size={15} />
              </Link>
            ) : (
              <button className={styles.primaryBtn} onClick={handleJoin} disabled={joining || full}>
                {full ? 'Grupo cheio' : joining ? 'Entrando...' : <>Participar <ArrowRight size={15} /></>}
              </button>
            )}
          </div>
        )}
      </main>
    </>
  );
}
