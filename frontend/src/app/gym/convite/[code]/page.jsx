'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CalendarDays, Trophy, Users } from 'lucide-react';
import { getChallengeInvite, getFitnessProfile, joinChallengeByCode } from '../../../../lib/api';
import { apiError } from '../../../../lib/gym';
import { STATUS_LABEL, formatRange, metricLabel, minRuleLabel } from '../../../../lib/challenges';
import { useToast } from '../../../../components/Toast';
import UsernameSetup from '../../../../components/gym/social/UsernameSetup';
import styles from './invite.module.css';

export default function ChallengeInvitePage() {
  const { code } = useParams();
  const router = useRouter();
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    Promise.all([getChallengeInvite(code), getFitnessProfile()])
      .then(([data, me]) => {
        setInvite(data);
        setProfile(me);
      })
      .catch((err) => setError(apiError(err, 'Não foi possível abrir o convite.')));
  }, [code]);

  const join = async () => {
    setJoining(true);
    try {
      const challenge = await joinChallengeByCode(code, consent);
      toast(`Você entrou em ${challenge.name}`);
      router.replace(`/gym/social/desafios/${challenge.id}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível entrar no desafio.') });
      setJoining(false);
    }
  };

  return (
    <div className={styles.page}>
      {error && (
        <section className={styles.card}>
          <Trophy size={28} className={styles.icon} />
          <p className={styles.title}>Convite indisponível</p>
          <p className={styles.muted}>{error}</p>
          <Link href="/gym/social/desafios" className={styles.secondary}>Ver meus desafios</Link>
        </section>
      )}

      {!invite && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando convite" />}

      {invite && (
        <section className={styles.card}>
          <span className={styles.badge}><Trophy size={14} /> Convite para desafio</span>
          <h1 className={styles.title}>{invite.name}</h1>
          <p className={styles.muted}>{invite.owner_name} te chamou para competir</p>
          {invite.description && <p className={styles.description}>{invite.description}</p>}
          <p className={styles.meta}>
            <CalendarDays size={14} /> {formatRange(invite.start_date, invite.end_date)}
            <span aria-hidden="true">·</span>
            <Users size={14} /> {invite.member_count} {invite.member_count === 1 ? 'participante' : 'participantes'}
            <span aria-hidden="true">·</span>
            {STATUS_LABEL[invite.status]}
          </p>
          <ul className={styles.rules}>
            {invite.metrics.map((metric) => <li key={metric.id}>{metricLabel(metric)}</li>)}
            <li className={styles.ruleMuted}>{minRuleLabel(invite.min_rule)}</li>
          </ul>

          {invite.is_member ? (
            <Link href={`/gym/social/desafios/${invite.id}`} className={styles.primary}>Abrir desafio</Link>
          ) : invite.status === 'finished' ? (
            <p className={styles.muted}>Esse desafio já terminou.</p>
          ) : profile && !profile.username ? null : (
            <>
              {invite.uses_weight && (
                <label className={styles.check}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    <strong>Aceito compartilhar meu peso corporal neste desafio</strong>
                    <small>
                      {invite.hide_weight
                        ? 'O peso fica escondido: os outros participantes veem só a sua porcentagem ou razão.'
                        : 'Os outros participantes veem seu peso inicial e o atual.'}
                    </small>
                  </span>
                </label>
              )}
              <button type="button" className={styles.primary} onClick={join} disabled={joining || (invite.uses_weight && !consent)}>
                {joining ? 'Entrando...' : 'Entrar no desafio'}
              </button>
            </>
          )}
        </section>
      )}

      {invite && !invite.is_member && profile && !profile.username && <UsernameSetup />}
    </div>
  );
}
