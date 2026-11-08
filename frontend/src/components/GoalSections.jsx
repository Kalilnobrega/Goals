'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import GoalCard from './GoalCard';
import { SortableList, SortableItem, DragHandle } from './Sortable';
import styles from './GoalSections.module.css';

export const STATUS_SECTIONS = [
  { status: 'late',      label: 'Atrasadas',  color: '#ef4444' },
  { status: 'open',      label: 'Em aberto',  color: '#3b82f6' },
  { status: 'completed', label: 'Concluídas', color: '#10b981' },
];

export function CollapsibleSection({ label, color, count, open, locked, onToggle, children }) {
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const expanded = open && !closing;

  const toggle = () => {
    if (locked || closing) return;
    if (open) {
      setOpening(false);
      setClosing(true);
    } else {
      setOpening(true);
      onToggle(true);
    }
  };

  const finishAnimation = (event) => {
    if (event.target !== event.currentTarget) return;
    if (closing) {
      setClosing(false);
      onToggle(false);
    }
    setOpening(false);
  };

  return (
    <section className={styles.section} style={{ '--section-color': color }}>
      <button className={styles.sectionHeader} onClick={toggle} aria-expanded={expanded}>
        <ChevronDown size={18} className={`${styles.chevron} ${expanded ? '' : styles.chevronClosed}`} />
        <span className={styles.sectionTitle}>{label}</span>
        <span className={styles.sectionCount}>{count}</span>
        <span className={styles.sectionLine} />
      </button>
      {open && (
        <div
          className={`${styles.sectionBody} ${closing ? styles.sectionBodyClosing : opening ? styles.sectionBodyOpening : ''}`}
          onAnimationEnd={closing || opening ? finishAnimation : undefined}
        >
          <div className={styles.sectionInner}>{children}</div>
        </div>
      )}
    </section>
  );
}

export default function GoalSections({ goals, collapsed, onCollapsedChange, forceOpen, onReorder, cardProps }) {
  const sections = STATUS_SECTIONS
    .map(section => ({ ...section, goals: goals.filter(g => g.status === section.status) }))
    .filter(section => section.goals.length > 0);

  return sections.map(section => (
    <CollapsibleSection
      key={section.status}
      label={section.label}
      color={section.color}
      count={section.goals.length}
      open={forceOpen || !collapsed[section.status]}
      locked={forceOpen}
      onToggle={(open) => onCollapsedChange(section.status, !open)}
    >
      <SortableList ids={section.goals.map(g => g.id)} onReorder={onReorder} layout="grid">
        <div className={styles.grid}>
          {section.goals.map((g, i) => (
            <SortableItem key={g.id} id={g.id}>
              {({ itemProps, isDragging, handleProps }) => (
                <div {...itemProps} style={{ ...itemProps.style, '--enter-delay': `calc(var(--stagger) * ${Math.min(i, 8)})` }}>
                  <GoalCard
                    goal={g}
                    dragging={isDragging}
                    dragHandle={<DragHandle handleProps={handleProps} />}
                    {...cardProps}
                  />
                </div>
              )}
            </SortableItem>
          ))}
        </div>
      </SortableList>
    </CollapsibleSection>
  ));
}
