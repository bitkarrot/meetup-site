import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GripVertical, ChevronDown } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface SortableSectionProps {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  isDirty?: boolean;
}

const STORAGE_KEY = 'admin-settings-collapsed-sections';

function getCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedSections(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function SortableSection({ id, title, description, children, isDirty }: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [collapsed, setCollapsed] = useState(() => getCollapsedSections().has(id));

  useEffect(() => {
    const set = getCollapsedSections();
    if (collapsed) set.add(id);
    else set.delete(id);
    saveCollapsedSections(set);
  }, [collapsed, id]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50")}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 text-left flex-1 min-w-0"
            aria-expanded={!collapsed}
            aria-controls={`section-content-${id}`}
          >
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200",
                collapsed && "-rotate-90"
              )}
            />
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="truncate">{title}</CardTitle>
                {isDirty && (
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0"
                    title="Unsaved changes in this section"
                  />
                )}
              </div>
              {description && <CardDescription className="truncate">{description}</CardDescription>}
            </div>
          </button>
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2.5 -mr-2 rounded-md hover:bg-muted text-muted-foreground transition-colors touch-none flex items-center justify-center w-11 h-11 shrink-0">
            <GripVertical className="h-5 w-5" />
          </div>
        </CardHeader>
        {!collapsed && (
          <div id={`section-content-${id}`}>
            {children}
          </div>
        )}
      </Card>
    </div>
  );
}
