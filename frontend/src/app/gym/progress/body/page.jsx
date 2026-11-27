'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera, Scale, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import {
  getBodyWeights, logBodyWeight, updateBodyWeight, deleteBodyWeight, getBodyGoal, saveBodyGoal, deleteBodyGoal, peekCache,
} from '../../../../lib/api';
import { apiError, formatDay, formatDelta, formatKg, formatLongDay, kgText, parseDay } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import ProgressChart from '../../../../components/gym/ProgressChart';
import BodyWeightForm from '../../../../components/gym/BodyWeightForm';
import GymSheet from '../../../../components/gym/GymSheet';
import TargetGoal from '../../../../components/gym/TargetGoal';
import Floating from '../../../../components/Floating';
import WeightComparison from '../../../../components/gym/WeightComparison';
import LimitedList from '../../../../components/gym/LimitedList';
import styles from '../progress.module.css';

const DAY = 86400000;
const RANGES = [
  { key: '30', label: '30 dias', days: 30 },
  { key: '90', label: '90 dias', days: 90 },
  { key: '365', label: '1 ano', days: 365 },
  { key: 'all', label: 'Tudo', days: null },
];

const sortDesc = (list) => [...list].sort((a, b) => b.measured_on.localeCompare(a.measured_on));

export default function BodyWeightPage() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [entries, setEntries] = useState(() => peekCache('fitnessBodyWeight') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [rangeKey, setRangeKey] = useState('90');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [goal, setGoal] = useState(() => peekCache('fitnessBodyGoal') ?? null);

  const refreshGoal = useCallback(() => getBodyGoal().then(setGoal).catch(() => {}), []);

  const fetchEntries = useCallback(() => {
    setLoadError(false);
    return getBodyWeights().then(setEntries).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getBodyWeights().then(setEntries).catch(() => setLoadError(true));
    getBodyGoal().then(setGoal).catch(() => {});
  }, []);

  const saveGoal = async (data) => {
    try {
      setGoal(await saveBodyGoal(data));
      toast(goal ? 'Meta atualizada' : 'Meta definida');
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível salvar a meta.');
    }
  };

  const removeGoal = async () => {
    try {
      await deleteBodyGoal();
      setGoal(null);
      toast('Meta removida');
      return true;
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível remover a meta.') });
      return false;
    }
  };

  const closeSheet = useCallback(() => setEditing(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  const save = async (data) => {
    const replacing = entries.some(e => e.measured_on === data.measured_on);
    try {
      const entry = await logBodyWeight(data);
      setEntries(list => sortDesc([...list.filter(e => e.id !== entry.id), entry]));
      refreshGoal();
      setAdding(false);
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
      refreshGoal();
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
      message: [<>O peso de <strong>{formatDay(entry.measured_on)}</strong> ({kgText(entry.weight_kg)}) será excluído.</>],
      confirmLabel: 'Excluir',
    });
    if (!ok) return false;
    try {
      await deleteBodyWeight(entry.id);
      setEntries(list => list.filter(e => e.id !== entry.id));
      refreshGoal();
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
      <div className={styles.top}>
        <Link href="/gym/progress" className={styles.back}><ChevronLeft size={18} /> Evolução</Link>
        <h1 className={styles.detailTitle}>Peso corporal</h1>
        <p className={styles.subtitle}>Como seu peso muda com o tempo</p>
      </div>

      <Link href="/gym/progress/body/fotos" className={styles.photosLink}>
        <span className={styles.photosIcon}><Camera size={18} /></span>
        <span className={styles.photosText}>
          <span className={styles.photosTitle}>Fotos de evolução</span>
          <span className={styles.photosSub}>Galeria privada, só você vê</span>
        </span>
        <ChevronRight size={18} className={styles.photosChevron} />
      </Link>

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
            <span className={styles.headlineValue}>{kgText(latest.weight_kg)}</span>
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
              <ProgressChart key={range.key} points={series} format={kgText} axisFormat={formatKg} label="Peso corporal ao longo do tempo" target={goal?.target_kg ?? null} />
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
        <TargetGoal
          goal={goal}
          title="Meta de peso"
          addLabel="Definir meta de peso"
          addText="Escolha o peso que quer alcançar e, se quiser, um prazo."
          dataWord="pesagens"
          suggestion={latest?.weight_kg}
          unitHint="75"
          onSave={saveGoal}
          onDelete={removeGoal}
        />
      )}

      {entries?.length > 0 && (
        <WeightComparison refreshKey={entries.map(e => `${e.id}:${e.measured_on}:${e.weight_kg}`).join('|')} />
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
          <LimitedList className={styles.list} items={entries} render={(entry, index) => {
              const before = entries[index + 1];
              return (
                <li key={entry.id}>
                  <button type="button" className={styles.row} onClick={() => setEditing(entry)}>
                    <span className={styles.rowDate}>{formatDay(entry.measured_on)}</span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{kgText(entry.weight_kg)}</span>
                      {(entry.measured_time || entry.note) && <span className={styles.rowMeta}>{[entry.measured_time, entry.note].filter(Boolean).join(' · ')}</span>}
                    </span>
                    {before && <span className={styles.rowDelta}>{formatDelta(entry.weight_kg - before.weight_kg)}</span>}
                    <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                  </button>
                </li>
              );
            }} />
        </section>
      )}

      {entries && (
        <Floating>
          <button type="button" className={styles.addWeight} onClick={() => setAdding(true)}>
            <Plus size={20} strokeWidth={2.6} /> Registrar peso
          </button>
        </Floating>
      )}

      <GymSheet open={adding} onClose={closeAdd} title="Registrar peso">
        {adding && (
          <BodyWeightForm compact takenDays={new Set(entries.map(e => e.measured_on))} onSubmit={save} />
        )}
      </GymSheet>

      <GymSheet open={!!editing} onClose={closeSheet} title="Editar registro">
        {editing && (
          <BodyWeightForm key={editing.id} compact initial={editing} onSubmit={edit} onDelete={remove} />
        )}
      </GymSheet>
    </div>
  );
}
