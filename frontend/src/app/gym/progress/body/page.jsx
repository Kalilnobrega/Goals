'use client';
import { useCallback, useEffect, useState } from 'react';
import { Scale, ChevronRight } from 'lucide-react';
import { getBodyWeights, logBodyWeight, updateBodyWeight, deleteBodyWeight, peekCache } from '../../../../lib/api';
import { apiError, formatDay, formatDelta, formatKg, formatLongDay, parseDay } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import SegmentTabs, { PROGRESS_TABS } from '../../../../components/gym/SegmentTabs';
import ProgressChart from '../../../../components/gym/ProgressChart';
import BodyWeightForm from '../../../../components/gym/BodyWeightForm';
import GymSheet from '../../../../components/gym/GymSheet';
import styles from '../progress.module.css';

const DAY = 86400000;
const RANGES = [
  { key: '30', label: '30 dias', days: 30 },
  { key: '90', label: '90 dias', days: 90 },
  { key: '365', label: '1 ano', days: 365 },
  { key: 'all', label: 'Tudo', days: null },
];

const kg = (value) => `${formatKg(value)} kg`;
const sortDesc = (list) => [...list].sort((a, b) => b.measured_on.localeCompare(a.measured_on));

export default function BodyWeightPage() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [entries, setEntries] = useState(() => peekCache('fitnessBodyWeight') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [rangeKey, setRangeKey] = useState('90');
  const [editing, setEditing] = useState(null);

  const fetchEntries = useCallback(() => {
    setLoadError(false);
    return getBodyWeights().then(setEntries).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getBodyWeights().then(setEntries).catch(() => setLoadError(true));
  }, []);

  const closeSheet = useCallback(() => setEditing(null), []);

  const save = async (data) => {
    const replacing = entries.some(e => e.measured_on === data.measured_on);
    try {
      const entry = await logBodyWeight(data);
      setEntries(list => sortDesc([...list.filter(e => e.id !== entry.id), entry]));
      toast(replacing ? `Peso de ${formatDay(entry.measured_on)} atualizado` : 'Peso registrado');
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível salvar o peso.');
    }
  };

  const edit = async (data) => {
    try {
      const entry = await updateBodyWeight(editing.id, data);
      setEntries(list => sortDesc(list.map(e => (e.id === entry.id ? entry : e))));
      setEditing(null);
      toast('Registro atualizado');
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível salvar o registro.');
    }
  };

  const remove = async () => {
    const entry = editing;
    const ok = await confirmAction({
      title: 'Excluir registro',
      message: [<>O peso de <strong>{formatDay(entry.measured_on)}</strong> ({kg(entry.weight_kg)}) será excluído.</>],
      confirmLabel: 'Excluir',
    });
    if (!ok) return false;
    try {
      await deleteBodyWeight(entry.id);
      setEntries(list => list.filter(e => e.id !== entry.id));
      setEditing(null);
      toast('Registro excluído');
      return true;
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível excluir o registro.') });
      return false;
    }
  };

  const latest = entries?.[0];
  const previous = entries?.[1];
  const oldest = entries?.at(-1);
  const span = entries?.length > 1 ? parseDay(latest.measured_on) - parseDay(oldest.measured_on) : 0;
  const ranges = span > 30 * DAY ? RANGES.filter(r => r.days === null || span > r.days * DAY) : [];
  const range = ranges.find(r => r.key === rangeKey) ?? RANGES.at(-1);
  const cutoff = range.days ? parseDay(latest.measured_on).getTime() - range.days * DAY : -Infinity;
  const series = (entries ?? [])
    .map(e => ({ key: e.id, time: parseDay(e.measured_on).getTime(), value: e.weight_kg, detail: e.note }))
    .filter(p => p.time >= cutoff)
    .reverse();

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Evolução</h1>
        <p className={styles.subtitle}>Como suas cargas e seu corpo mudam com o tempo</p>
      </header>

      <SegmentTabs tabs={PROGRESS_TABS} label="Evolução" />

      {loadError && !entries && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar seu peso.</p>
          <button type="button" className={styles.stateAction} onClick={fetchEntries}>Tentar de novo</button>
        </div>
      )}

      {!entries && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando peso corporal">
          <div className={styles.skeleton} />
          <div className={styles.skeletonTall} />
        </div>
      )}

      {entries && latest && (
        <section className={styles.panel}>
          <div className={styles.headline}>
            <span className={styles.headlineValue}>{kg(latest.weight_kg)}</span>
            <span className={styles.headlineLabel}>
              {formatLongDay(latest.measured_on)}
              {previous && <> · {formatDelta(latest.weight_kg - previous.weight_kg)} desde {formatDay(previous.measured_on)}</>}
            </span>
          </div>

          {entries.length > 1 && (
            <>
              {ranges.length > 1 && (
                <div className={styles.metrics} role="tablist" aria-label="Período do gráfico">
                  {ranges.map(r => (
                    <button
                      key={r.key}
                      type="button"
                      role="tab"
                      aria-selected={r === range}
                      className={`${styles.metric} ${r === range ? styles.metricActive : ''}`}
                      onClick={() => setRangeKey(r.key)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              <ProgressChart key={range.key} points={series} format={kg} axisFormat={formatKg} label="Peso corporal ao longo do tempo" />
              {oldest !== previous && (
                <p className={styles.panelNote}>
                  {formatDelta(latest.weight_kg - oldest.weight_kg)} desde o primeiro registro, em {formatDay(oldest.measured_on)}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {entries && (
        <BodyWeightForm takenDays={new Set(entries.map(e => e.measured_on))} onSubmit={save} />
      )}

      {entries?.length === 0 && (
        <div className={styles.state}>
          <Scale size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Nenhum peso registrado.</p>
          <p className={styles.stateText}>Registre seu peso de vez em quando, de preferência nas mesmas condições, e acompanhe a curva aqui.</p>
        </div>
      )}

      {entries?.length > 0 && (
        <section className={styles.sessions}>
          <h2 className={styles.sectionTitle}>Registros</h2>
          <ul className={styles.list}>
            {entries.map((entry, index) => {
              const before = entries[index + 1];
              return (
                <li key={entry.id}>
                  <button type="button" className={styles.row} onClick={() => setEditing(entry)}>
                    <span className={styles.rowDate}>{formatDay(entry.measured_on)}</span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{kg(entry.weight_kg)}</span>
                      {entry.note && <span className={styles.rowMeta}>{entry.note}</span>}
                    </span>
                    {before && <span className={styles.rowDelta}>{formatDelta(entry.weight_kg - before.weight_kg)}</span>}
                    <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <GymSheet open={!!editing} onClose={closeSheet} title="Editar registro">
        {editing && (
          <BodyWeightForm key={editing.id} compact initial={editing} onSubmit={edit} onDelete={remove} />
        )}
      </GymSheet>
    </div>
  );
}
