'use client';
import { ViewTransition } from 'react';
import SuperGoalIcon from './SuperGoalIcon';
import { useCardLink } from '../lib/useCardLink';
import { useDropSettle } from '../lib/useDropSettle';
import { STATUS_SECTIONS } from './GoalSections';
import styles from './SuperGoal.module.css';

export default function SuperGoalTile({ superGoal, goals, dragHandle, dragging }) {
  const cardLink = useCardLink(`/goals/super/${superGoal.id}`, dragging);
  const [settling, endSettle] = useDropSettle(dragging);
  const counts = STATUS_SECTIONS
    .map(section => ({ ...section, count: goals.filter(g => g.status === section.status).length }))
    .filter(section => section.count > 0);

  return (
    <article
      className={`${styles.tile} ${dragging ? styles.tileDragging : ''} ${settling ? styles.tileSettling : ''}`}
      onAnimationEnd={endSettle}
      data-reveal=""
      {...cardLink}
      aria-label={`Supermeta ${superGoal.title}`}
    >
      <span className={styles.layerBack} aria-hidden="true" />
      <span className={styles.layerMid} aria-hidden="true" />
      <ViewTransition name={`super-${superGoal.id}`} share="goal-morph" default="none">
      <div className={`${styles.tileBody} glass`}>
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
      </ViewTransition>
    </article>
  );
}
