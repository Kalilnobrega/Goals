'use client';
import { useCallback, useEffect, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { getFitnessProfile, getFriends, getReceivedShares, peekCache, removeFriendship, searchPeople } from '../../../../lib/api';
import { apiError, plural } from '../../../../lib/gym';
import Link from 'next/link';
import { useToast } from '../../../../components/Toast';
import Avatar from '../../../../components/gym/social/Avatar';
import PersonRow from '../../../../components/gym/social/PersonRow';
import FriendAction from '../../../../components/gym/social/FriendAction';
import CloseFriendToggle from '../../../../components/gym/social/CloseFriendToggle';
import UsernameSetup from '../../../../components/gym/social/UsernameSetup';
import SocialTabs from '../../../../components/gym/social/SocialTabs';
import LiveNow from '../../../../components/gym/social/LiveNow';
import social from '../../../../components/gym/social/social.module.css';
import styles from './page.module.css';

function SearchPeople({ onChanged }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState('');

  const term = query.trim();
  const ready = term.replace(/^@/, '').length >= 2;

  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      searchPeople(term)
        .then((people) => {
          if (!active) return;
          setResults(people);
          setSearched(term);
        })
        .catch(() => {});
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, ready]);

  const update = (person) => {
    setResults((list) => list.map((p) => (p.username === person.username ? person : p)));
    onChanged();
  };

  const visible = ready && searched === term ? results : null;

  return (
    <section className={styles.card}>
      <label className={styles.searchWrap}>
        <Search size={18} className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar pelo @username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Buscar pessoas"
        />
        {query && (
          <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label="Limpar busca">
            <X size={16} />
          </button>
        )}
      </label>
      {!ready && <p className={styles.hint}>Perfis públicos também aparecem pelo nome.</p>}
      {visible && visible.length === 0 && <p className={styles.hint}>Ninguém encontrado com “{searched}”.</p>}
      {visible && visible.length > 0 && (
        <ul className={social.list}>
          {visible.map((person) => (
            <PersonRow key={person.username} person={person}>
              <FriendAction person={person} onChange={update} compact />
            </PersonRow>
          ))}
        </ul>
      )}
    </section>
  );
}

function Section({ title, count, children }) {
  return (
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>
        {title}
        {count > 0 && <span className={styles.count}>{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export default function SocialPage() {
  const toast = useToast();
  const [profile, setProfile] = useState(() => peekCache('fitnessProfile'));
  const [friends, setFriends] = useState(() => peekCache('fitnessFriends'));
  const [error, setError] = useState('');
  const [received, setReceived] = useState(null);

  const loadFriends = useCallback(() => {
    getFriends().then(setFriends).catch((err) => setError(apiError(err, 'Não foi possível carregar seus amigos.')));
  }, []);

  useEffect(() => {
    getFitnessProfile()
      .then((data) => {
        setProfile(data);
        if (data.username) {
          loadFriends();
          getReceivedShares().then(setReceived).catch(() => setReceived([]));
        }
      })
      .catch(() => setError('Não foi possível carregar o Social.'));
  }, [loadFriends]);

  const decline = async (person) => {
    try {
      await removeFriendship(person.username);
      toast('Pedido recusado');
      loadFriends();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível recusar o pedido.') });
    }
  };

  const withRelation = (list, relation) => list.map((person) => ({ ...person, relation }));
  const needsUsername = profile && !profile.username;

  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Social: amigos</h1>

      <SocialTabs />
      {profile?.username && <LiveNow />}

      {error && <p className={styles.error}>{error}</p>}

      {!profile && !error && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando">
          <div className={styles.skeleton} />
        </div>
      )}

      {needsUsername && <UsernameSetup />}

      {profile?.username && (
        <>
          <SearchPeople onChanged={loadFriends} />

          {!friends && !error && (
            <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando amigos">
              <div className={styles.skeleton} />
            </div>
          )}

          {friends && friends.incoming.length > 0 && (
            <Section title="Pedidos de amizade" count={friends.incoming.length}>
              <ul className={social.list}>
                {withRelation(friends.incoming, 'request_received').map((person) => (
                  <PersonRow key={person.username} person={person}>
                    <FriendAction person={person} onChange={loadFriends} compact />
                    <button type="button" className={social.iconAction} onClick={() => decline(person)} aria-label={`Recusar pedido de ${person.name}`}>
                      <X size={16} />
                    </button>
                  </PersonRow>
                ))}
              </ul>
            </Section>
          )}

          {friends && (
            <Section title="Amigos" count={friends.friends.length}>
              {friends.friends.length > 0 && (
                <p className={styles.hint}>Toque na estrela para marcar melhores amigos: eles veem suas fichas, histórico e evolução.</p>
              )}
              {friends.friends.length ? (
                <ul className={social.list}>
                  {friends.friends.map((person) => (
                    <PersonRow key={person.username} person={person}>
                      <CloseFriendToggle
                        person={person}
                        active={person.close}
                        onChange={(close) => setFriends((current) => ({
                          ...current,
                          friends: current.friends.map((f) => (f.username === person.username ? { ...f, close } : f)),
                        }))}
                      />
                    </PersonRow>
                  ))}
                </ul>
              ) : (
                <div className={styles.empty}>
                  <UserPlus size={22} />
                  <p>Você ainda não tem amigos no GymGoals. Busque pelo @ de alguém para começar.</p>
                </div>
              )}
            </Section>
          )}

          {received && received.length > 0 && (
            <Section title="Recebidos" count={received.length}>
              <ul className={social.list}>
                {received.map((item) => (
                  <li key={item.id} className={social.row}>
                    <Link href={`/gym/social/recebidos/${item.id}`} className={social.rowLink}>
                      <Avatar name={item.sender.name} />
                      <span className={social.rowText}>
                        <span className={social.rowName}>{item.snapshot.name}</span>
                        <span className={social.rowHandle}>{{ plan: 'Plano', exercise: 'Exercício' }[item.kind] ?? 'Ficha'} de {item.sender.name.split(' ')[0]}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {friends && friends.outgoing.length > 0 && (
            <Section title={plural(friends.outgoing.length, 'pedido enviado', 'pedidos enviados')}>
              <ul className={social.list}>
                {withRelation(friends.outgoing, 'request_sent').map((person) => (
                  <PersonRow key={person.username} person={person}>
                    <FriendAction person={person} onChange={loadFriends} compact />
                  </PersonRow>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
