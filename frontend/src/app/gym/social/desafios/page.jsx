'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronRight, MessageCircle, Plus, Trophy, Users } from 'lucide-react';
import {
  acceptChallengeInvite, declineChallengeInvite, getChallenges, getFitnessProfile, peekCache,
} from '../../../../lib/api';
import { apiError } from '../../../../lib/gym';
import { formatRange, formatScore, metricLabel, minRuleLabel } from '../../../../lib/challenges';
import { useToast } from '../../../../components/Toast';
import SocialTabs from '../../../../components/gym/social/SocialTabs';
import UsernameSetup from '../../../../components/gym/social/UsernameSetup';
import { SocialActionButton, SocialActionFab } from '../../../../components/gym/social/SocialAction';
import social from '../../../../components/gym/social/social.module.css';
import styles from './challenges.module.css';

function ordinal(position) {
  return `${position}º`;
}

function ChallengeCard({ challenge }) {
  const finished = challenge.status === 'finished';
  return (
    <li>
      <Link href={`/gym/social/desafios/${challenge.id}`} className={styles.challenge}>
        <span className={`${styles.place} ${challenge.my_position === 1 && challenge.my_score > 0 ? styles.placeFirst : ''}`}>
          {challenge.my_position ? ordinal(challenge.my_position) : <CalendarDays size={18} />}
        </span>
        <span className={styles.challengeText}>
          <span className={styles.challengeName}>{challenge.name}</span>
          <span className={styles.challengeMeta}>
            {formatRange(challenge.start_date, challenge.end_date)} · <Users size={12} /> {challenge.member_count}
          </span>
          <span className={styles.challengeMeta}>
            {challenge.my_position && !challenge.my_score && challenge.my_position === 1
              ? 'Ninguém pontuou ainda'
              : challenge.my_position
              ? finished && challenge.my_position === 1
                ? `Você venceu com ${formatScore(challenge, challenge.my_score)}`
                : `${formatScore(challenge, challenge.my_score)}${challenge.my_position > 1 ? ` · líder: ${challenge.leader_name.split(' ')[0]}` : ' · você lidera'}`
              : challenge.metrics.map(metricLabel).join(' + ')}
          </span>
        </span>
        {challenge.chat_unread > 0 && (
          <span className={styles.chatBadge} aria-label={`${challenge.chat_unread} mensagens novas`}>
            <MessageCircle size={13} /> {challenge.chat_unread > 9 ? '9+' : challenge.chat_unread}
          </span>
        )}
        <ChevronRight size={18} className={styles.chevron} />
      </Link>
    </li>
  );
}

function Group({ title, items }) {
  if (!items.length) return null;
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <ul className={styles.list}>
        {items.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}
      </ul>
    </section>
  );
}

export default function ChallengesPage() {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState(() => peekCache('fitnessProfile'));
  const [lists, setLists] = useState(() => peekCache('fitnessChallenges'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    getChallenges().then(setLists).catch((err) => setError(apiError(err, 'Não foi possível carregar os desafios.')));
  }, []);

  useEffect(() => {
    getFitnessProfile()
      .then((data) => {
        setProfile(data);
        if (data.username) load();
      })
      .catch(() => setError('Não foi possível carregar o Social.'));
  }, [load]);

  const accept = async (invite) => {
    if (invite.uses_weight) {
      router.push(`/gym/convite/${invite.code}`);
      return;
    }
    setBusy(invite.id);
    try {
      await acceptChallengeInvite(invite.id);
      toast(`Você entrou em ${invite.name}`);
      router.push(`/gym/social/desafios/${invite.id}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível entrar no desafio.') });
      setBusy(null);
    }
  };

  const decline = async (invite) => {
    setBusy(invite.id);
    try {
      await declineChallengeInvite(invite.id);
      toast('Convite recusado');
      load();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível recusar o convite.') });
    } finally {
      setBusy(null);
    }
  };

  const empty = lists && !lists.active.length && !lists.upcoming.length && !lists.finished.length && !lists.invites.length;

  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Social: desafios</h1>

      <div className={social.toolbar}>
        <SocialTabs />
        {profile?.username && <SocialActionButton href="/gym/social/desafios/novo" label="Criar desafio" icon={Plus} />}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {!profile && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando" />}

      {profile && !profile.username && <UsernameSetup />}

      {profile?.username && (
        <>
          <SocialActionFab href="/gym/social/desafios/novo" label="Criar desafio" icon={Plus} />

          {!lists && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando desafios" />}

          {lists && lists.invites.length > 0 && (
            <section className={styles.group}>
              <h2 className={styles.groupTitle}>Convites <span className={styles.count}>{lists.invites.length}</span></h2>
              <ul className={styles.list}>
                {lists.invites.map((invite) => (
                  <li key={invite.id} className={styles.invite}>
                    <p className={styles.challengeName}>{invite.name}</p>
                    <p className={styles.challengeMeta}>
                      {invite.owner_name} te chamou · {formatRange(invite.start_date, invite.end_date)} · <Users size={12} /> {invite.member_count}
                    </p>
                    <p className={styles.challengeMeta}>{invite.metrics.map(metricLabel).join(' + ')} · {minRuleLabel(invite.min_rule)}</p>
                    <div className={styles.inviteActions}>
                      <button type="button" className={styles.primary} disabled={busy === invite.id} onClick={() => accept(invite)}>Entrar</button>
                      <button type="button" className={styles.secondary} disabled={busy === invite.id} onClick={() => decline(invite)}>Recusar</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {lists && (
            <>
              <Group title="Em andamento" items={lists.active} />
              <Group title="Próximos" items={lists.upcoming} />
              <Group title="Encerrados" items={lists.finished} />
            </>
          )}

          {empty && (
            <section className={styles.empty}>
              <Trophy size={26} />
              <p className={styles.emptyTitle}>Nenhum desafio ainda</p>
              <p className={styles.emptyText}>Crie um desafio, escolha o que vale ponto e chame seus amigos pelo link.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
