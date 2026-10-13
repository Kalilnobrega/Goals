'use client';
import { AlertTriangle, CheckCircle2, CircleDashed, Minus, Target } from 'lucide-react';
import { formatValue } from '../lib/numeric';
import { formatDeadline } from '../lib/date';
import styles from './GoalForecast.module.css';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function GoalForecast({ goal }) {
  const { forecast } = goal;

  if (forecast.status === 'reached') {
    return <p className={`${styles.forecast} ${styles.forecastGood}`}><CheckCircle2 size={14} /> Meta alcançada!</p>;
  }
  if (forecast.status === 'no_data') {
    return <p className={styles.forecast}><CircleDashed size={14} /> Registre mais progresso para ver a previsão.</p>;
  }
  if (forecast.status === 'no_trend') {
    return <p className={`${styles.forecast} ${styles.forecastBad}`}><Minus size={14} /> Sem avanço em direção à meta até agora.</p>;
  }

  const weekly = formatValue(Math.abs(forecast.rate_per_day * 7), goal.unit);
  const eta = formatDate(forecast.eta);

  if (forecast.status === 'on_track') {
    return (
      <p className={`${styles.forecast} ${styles.forecastGood}`}>
        <Target size={14} />
        <span>
          No ritmo atual (~{weekly}/semana), você chega lá em <strong>{eta}</strong>
          {forecast.deadline && <>, antes do prazo ({formatDeadline(forecast.deadline)})</>}.
        </span>
      </p>
    );
  }

  return (
    <p className={`${styles.forecast} ${styles.forecastBad}`}>
      <AlertTriangle size={14} />
      <span>
        No ritmo atual (~{weekly}/semana), você chega lá só em <strong>{eta}</strong>, depois do prazo ({formatDeadline(forecast.deadline)}).
        {forecast.needed_per_day !== null && (
          <> Para cumprir, precisa de ~{formatValue(Math.abs(forecast.needed_per_day * 7), goal.unit)}/semana.</>
        )}
      </span>
    </p>
  );
}
