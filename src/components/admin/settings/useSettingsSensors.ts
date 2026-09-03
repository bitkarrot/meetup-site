import { useSensor, useSensors } from '@dnd-kit/core';
import { KeyboardSensor, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Shared DnD sensors for all settings drag-and-drop contexts.
 * Includes TouchSensor with activation constraint so scroll doesn't
 * trigger drag on mobile (150ms delay, 8px tolerance).
 */
export function useSettingsSensors() {
  return useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
}
