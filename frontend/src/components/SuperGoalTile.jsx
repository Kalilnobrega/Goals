'use client';
import Link from 'next/link';
import SuperGoalIcon from './SuperGoalIcon';
import { STATUS_SECTIONS } from './GoalSections';
import styles from './SuperGoal.module.css';

export default function SuperGoalTile({ superGoal, goals, dragHandle, dragging }) {
  const counts = STATUS_SECTIONS
    .map(section => ({ ...section, count: goals.filter(g => g.status === section.status).length }))
    .filter(section => section.count > 0);

  return (
    <article className={`${styles.tile} ${dragging ? styles.tileDragging : ''}`}>
      <span className={styles.layerBack} aria-hidden="true" />
      <span className={styles.layerMid} aria-hidden="true" />
      <div className={`${styles.tileBody} glass`}>
        <Link href={`/goals/super/${superGoal.id}`} className={styles.cover} aria-label={`Abrir supermeta ${superGoal.title}`} />
        <div className={styles.tileTop}>
          <span className={styles.iconBadge}><SuperGoalIcon size={18} strokeWidth={2.1} /></span>
          <div className={styles.tileControls}>{dragHandle}</div>
        </div>
        <h3 className={styles.tileTitle}>{superGoal.title}</h3>
        <div className={styles.tileFooter}>
          <span className={styles.tileCount}>
            {goals.length} meta{goals.length !== 1 ? 's' : ''}
          </span>
          {counts.length > 0 && (
            <span className={styles.statusDots}>
              {counts.map(section => (
                <span
                  key={section.status}
                  className={styles.statusDot}
                  style={{ '--dot': section.color }}
                  title={`${section.count} ${section.label.toLowerCase()}`}
                >
                  {section.count}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
