'use client';
import { useEffect, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { exportFitnessData, getGyms, peekCache } from '../../lib/api';
import { apiError } from '../../lib/gym';
import { useToast } from '../Toast';
import s from './sheet.module.css';
import styles from './ExportSheet.module.css';

const FORMATS = [
  { value: 'pdf', label: 'PDF', hint: 'Para ler ou mandar para alguém' },
  { value: 'csv', label: 'CSV', hint: 'Para abrir em planilha' },
  { value: 'txt', label: 'TXT', hint: 'Texto simples' },
];

const CONTENTS = [
  { value: 'all', label: 'Tudo' },
  { value: 'workouts', label: 'Treinos' },
  { value: 'weights', label: 'Peso corporal' },
];

const PERIODS = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '3 meses' },
  { value: '365d', label: '1 ano' },
  { value: 'all', label: 'Tudo' },
];

const MIME = { pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain' };

function Choices({ label, options, value, onChange }) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.choices}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`${s.chip} ${value === option.value ? s.chipActive : ''}`}
            onClick={() => onChange(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const canShareFiles = () => {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [new File([''], 'a.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
};

export default function ExportSheet({ gymId = null }) {
  const [format, setFormat] = useState('pdf');
  const [content, setContent] = useState('all');
  const [period, setPeriod] = useState('all');
  const [gym, setGym] = useState(gymId ?? 'all');
  const [gyms, setGyms] = useState(() => peekCache('fitnessGyms')?.gyms ?? []);
  const [busy, setBusy] = useState(null);
  const [shareable] = useState(canShareFiles);
  const toast = useToast();
  const chosenContent = format === 'csv' && content === 'all' ? 'workouts' : content;
  const showGyms = gyms.length > 1 && chosenContent !== 'weights';

  useEffect(() => {
    getGyms().then(result => setGyms(result.gyms)).catch(() => {});
  }, []);

  const fetchFile = async () => {
    const gymParam = showGyms && gym !== 'all' ? { gym_id: gym } : {};
    const { blob, filename } = await exportFitnessData({ format, content: chosenContent, period, ...gymParam });
    return new File([blob], filename, { type: MIME[format] });
  };

  const run = async (mode) => {
    setBusy(mode);
    try {
      const file = await fetchFile();
      if (mode === 'share') {
        try {
          await navigator.share({ files: [file], title: file.name });
        } catch (err) {
          if (err?.name !== 'AbortError') throw err;
        }
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível exportar. Tente de novo.') });
    }
    setBusy(null);
  };

  return (
    <div className={s.stack}>
      <Choices label="Formato" options={FORMATS} value={format} onChange={setFormat} />
      <p className={styles.hint}>{FORMATS.find(option => option.value === format).hint}{format === 'csv' ? '. Um arquivo por conteúdo.' : '.'}</p>
      <Choices
        label="Conteúdo"
        options={CONTENTS.map(option => ({ ...option, disabled: format === 'csv' && option.value === 'all' }))}
        value={chosenContent}
        onChange={setContent}
      />
      <Choices label="Período" options={PERIODS} value={period} onChange={setPeriod} />
      {showGyms && (
        <Choices
          label="Academia"
          options={[{ value: 'all', label: 'Todas' }, ...gyms.map(item => ({ value: item.id, label: item.name }))]}
          value={gym}
          onChange={setGym}
        />
      )}
      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={() => run('download')} disabled={!!busy}>
          <Download size={18} /> {busy === 'download' ? 'Gerando…' : 'Baixar'}
        </button>
        {shareable && (
          <button type="button" className={s.secondary} onClick={() => run('share')} disabled={!!busy}>
            <Share2 size={18} /> {busy === 'share' ? 'Gerando…' : 'Compartilhar'}
          </button>
        )}
      </div>
    </div>
  );
}
