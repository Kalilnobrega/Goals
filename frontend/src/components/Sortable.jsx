'use client';
import { useId } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import styles from './Sortable.module.css';

const accessibility = {
  screenReaderInstructions: {
    draggable: 'Para reordenar, pressione espaço ou enter, use as setas para mover e pressione espaço ou enter de novo para soltar. Esc cancela.',
  },
  announcements: {
    onDragStart: () => 'Item selecionado.',
    onDragOver: ({ over }) => (over ? 'Item movido.' : 'Item fora da lista.'),
    onDragEnd: ({ over }) => (over ? 'Item solto na nova posição.' : 'Item solto.'),
    onDragCancel: () => 'Reordenação cancelada.',
  },
};

const INTERACTIVE = 'button, a, input, textarea, select, label';

function onHandle(target) {
  return !!target.closest?.('[data-drag-handle]');
}

function outsideControls(target) {
  return onHandle(target) || !target.closest?.(INTERACTIVE);
}

function onlyFrom(Sensor, allow) {
  return class extends Sensor {
    static activators = Sensor.activators.map(({ eventName, handler }) => ({
      eventName,
      handler: (event, ...rest) => allow(event.nativeEvent.target) && handler(event, ...rest),
    }));
  };
}

const ItemMouseSensor = onlyFrom(MouseSensor, outsideControls);
const ItemTouchSensor = onlyFrom(TouchSensor, outsideControls);
const HandleKeyboardSensor = onlyFrom(KeyboardSensor, onHandle);

export function SortableList({ ids, onReorder, layout = 'list', children }) {
  const id = useId();
  const sensors = useSensors(
    useSensor(ItemMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(ItemTouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(HandleKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)));
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={accessibility}
    >
      <SortableContext
        items={ids}
        strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortableItem({ id, children }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id });

  return children({
    itemProps: {
      ref: setNodeRef,
      ...listeners,
      'data-sortable-item': '',
      style: {
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 20 : undefined,
      },
    },
    isDragging,
    handleProps: { ref: setActivatorNodeRef, ...attributes, 'data-drag-handle': '' },
  });
}

export function DragHandle({ handleProps, className = '' }) {
  const { ref, ...props } = handleProps;
  return (
    <button
      type="button"
      ref={ref}
      className={`${styles.handle} ${className}`}
      aria-label="Arrastar para reordenar"
      title="Arrastar para reordenar"
      {...props}
    >
      <GripVertical size={15} />
    </button>
  );
}

export function moveSubset(items, ids) {
  const byId = new Map(items.map(item => [item.id, item]));
  const selected = new Set(ids);
  const result = [...items];
  let next = 0;
  items.forEach((item, index) => {
    if (selected.has(item.id)) result[index] = byId.get(ids[next++]);
  });
  return result;
}
