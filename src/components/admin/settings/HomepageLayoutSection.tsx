import { memo, useCallback } from 'react';
import { CardContent } from '@/components/ui/card';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableSection } from './SortableSection';
import { SortableHomepageItem } from './SortableItems';
import { useSettingsSensors } from './useSettingsSensors';
import { type SiteConfig, type HomepagePage, getPageLabel } from './types';

const BUILTIN_HOMEPAGE_SECTIONS: Record<string, { label: string; description: string }> = {
  hero: { label: 'Hero', description: 'Title, subtitle, and call-to-action buttons' },
  events: { label: 'Events', description: 'Upcoming events grid' },
  blog: { label: 'Blog', description: 'Latest blog posts grid' },
  feed: { label: 'Feed', description: 'Community notes feed' },
};

interface HomepageLayoutSectionProps {
  /** Already-reconciled order — parent handles appending new page sections. */
  homepageSectionOrder: string[];
  homepagePages: HomepagePage[];
  onChange: (updates: Partial<SiteConfig>) => void;
  disabled: boolean;
  isDirty?: boolean;
}

export const HomepageLayoutSection = memo(function HomepageLayoutSection({
  homepageSectionOrder,
  homepagePages,
  onChange,
  disabled,
  isDirty,
}: HomepageLayoutSectionProps) {
  const sensors = useSettingsSensors();

  const handleHomepageDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = homepageSectionOrder.indexOf(active.id as string);
      const newIndex = homepageSectionOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange({ homepageSectionOrder: arrayMove(homepageSectionOrder, oldIndex, newIndex) });
      }
    }
  }, [homepageSectionOrder, onChange]);

  return (
    <SortableSection
      id="homepage"
      title="Homepage Layout"
      description="Drag to reorder sections on the landing page. Page sections come from Pages marked 'Show on homepage'."
      isDirty={isDirty}
    >
      <CardContent className="space-y-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleHomepageDragEnd}
        >
          <SortableContext
            items={homepageSectionOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {homepageSectionOrder.map((sectionId) => {
                if (sectionId.startsWith('page:')) {
                  const pagePath = sectionId.slice(5);
                  const page = homepagePages.find(p => p.path === pagePath);
                  if (!page) return null;
                  const label = getPageLabel(pagePath);
                  return (
                    <SortableHomepageItem
                      key={sectionId}
                      id={sectionId}
                      label={label}
                      description={pagePath}
                      isPage
                      path={pagePath}
                      content={page.content}
                      disabled={disabled}
                    />
                  );
                }
                const builtin = BUILTIN_HOMEPAGE_SECTIONS[sectionId];
                if (!builtin) return null;
                return (
                  <SortableHomepageItem
                    key={sectionId}
                    id={sectionId}
                    label={builtin.label}
                    description={builtin.description}
                    isPage={false}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        {homepagePages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No pages are marked as homepage sections yet. Go to <strong>Pages</strong>, edit a page, and enable <strong>Show on homepage</strong>.
          </p>
        )}
      </CardContent>
    </SortableSection>
  );
});
