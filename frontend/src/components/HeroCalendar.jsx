'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './HeroCalendar.module.css';

export default function HeroCalendar({ goals }) {
    const today    = new Date();
    const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
   
    const year  = current.getFullYear();
    const month = current.getMonth();
   
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const dayNames   = ['D','S','T','Q','Q','S','S'];
   
    const firstDay  = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
   
    // Mapeia deadlines das metas por data
    const deadlineMap = {};
    goals.forEach(g => {
      if (!g.deadline) return;
      const d = new Date(g.deadline);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!deadlineMap[key]) deadlineMap[key] = [];
      deadlineMap[key].push(g);
    });
   
    const prevMonth = () => setCurrent(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrent(new Date(year, month + 1, 1));

    const statusColor = (status) => {
      if (status === 'completed') return '#10b981';
      if (status === 'late')      return '#ef4444';
      return '#93c5fd';
    };

    // Metas com prazo dentro do mês exibido, ordenadas por dia
    const monthGoals = goals
      .filter(g => g.deadline)
      .map(g => ({ ...g, _deadline: new Date(g.deadline) }))
      .filter(g => g._deadline.getFullYear() === year && g._deadline.getMonth() === month)
      .sort((a, b) => a._deadline.getDate() - b._deadline.getDate());

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
   
    return (
      <div className={styles.cal}>
        {/* Header */}
        <div className={styles.calHeader}>
          <button className={styles.calNav} onClick={prevMonth}>‹</button>
          <span className={styles.calMonth}>{monthNames[month]} {year}</span>
          <button className={styles.calNav} onClick={nextMonth}>›</button>
        </div>
   
        {/* Day names */}
        <div className={styles.calGrid}>
          {dayNames.map((d, i) => (
            <div key={i} className={styles.calDayName}>{d}</div>
          ))}
   
          {/* Days */}
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />;
            const key = `${year}-${month}-${day}`;
            const goalsOnDay = deadlineMap[key] || [];
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const dayBg = !isToday && goalsOnDay.length > 0
              ? `${statusColor(goalsOnDay[0].status)}30`
              : undefined;

            return (
              <div
                key={day}
                className={`${styles.calDay} ${isToday ? styles.calToday : ''} ${goalsOnDay.length > 0 ? styles.calHasGoal : ''}`}
                style={dayBg ? { background: dayBg } : undefined}
                title={goalsOnDay.map(g => g.title).join(', ')}
              >
                <span>{day}</span>
                {goalsOnDay.length > 0 && (
                  <div className={styles.calDots}>
                    {goalsOnDay.slice(0, 3).map((g, idx) => (
                      <span
                        key={idx}
                        className={styles.calDot}
                        style={{ background: statusColor(g.status) }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
   
        {/* Legenda */}
        <div className={styles.calLegend}>
          <span><span className={styles.calDot} style={{ background: '#93c5fd' }} /> Em aberto</span>
          <span><span className={styles.calDot} style={{ background: '#10b981' }} /> Concluída</span>
          <span><span className={styles.calDot} style={{ background: '#ef4444' }} /> Atrasada</span>
        </div>

        {/* Prazos do mês */}
        <div className={styles.calDeadlines}>
          <span className={styles.calDeadlinesTitle}>Prazos de {monthNames[month]}</span>

          {monthGoals.length === 0 ? (
            <p className={styles.calDeadlinesEmpty}>Nenhuma meta com prazo neste mês.</p>
          ) : (
            <ul className={styles.calDeadlinesList}>
              {monthGoals.map(g => (
                <li key={g.id}>
                  <Link href={`/goals/${g.id}`} className={styles.calDeadlineItem}>
                    <span className={styles.calDot} style={{ background: statusColor(g.status) }} />
                    <span className={styles.calDeadlineTitle}>{g.title}</span>
                    <span className={styles.calDeadlineDay}>{g._deadline.getDate()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }