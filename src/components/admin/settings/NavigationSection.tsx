import { memo, useCallback } from 'react';
import { CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { SortableNavItem } from './SortableItems';
import { useSettingsSensors } from './useSettingsSensors';
import { type NavigationItem } from './types';

interface NavigationSectionProps {
  navigation: NavigationItem[];
  onNavigationChange: (updater: (prev: NavigationItem[]) => NavigationItem[]) => void;
  disabled: boolean;
  isDirty?: boolean;
}

export const NavigationSection = memo(function NavigationSection({
  navigation,
  onNavigationChange,
  disabled,
  isDirty,
}: NavigationSectionProps) {
  const sensors = useSettingsSensors();

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onNavigationChange((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, [onNavigationChange]);

  const addNavigationItem = useCallback((name?: string, href?: string) => {
    const newItem: NavigationItem = {
      id: Date.now().toString(),
      name: name || 'New Item',
      href: href || '/new-page',
      isSubmenu: false,
    };
    onNavigationChange((items) => [...items, newItem]);
  }, [onNavigationChange]);

  const removeNavigationItem = useCallback((id: string) => {
    onNavigationChange((items) => items.filter(item => item.id !== id));
  }, [onNavigationChange]);

  const updateNavigationItem = useCallback((id: string, updates: Partial<NavigationItem>) => {
    onNavigationChange((items) => items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  }, [onNavigationChange]);

  return (
    <SortableSection id="navigation" title="Navigation Menu" isDirty={isDirty}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label>Main Navigation</Label>
          <div className="flex items-center gap-2">
            <Select disabled={disabled} value="" onValueChange={(val) => {
              const presets: Record<string, { name: string; href: string }> = {
                '/feed': { name: 'Feed', href: '/feed' },
                '/blog': { name: 'Blog', href: '/blog' },
                '/events': { name: 'Events', href: '/events' },
                '/about': { name: 'About', href: '/about' },
                '/contact': { name: 'Contact', href: '/contact' },
              };
              const preset = presets[val];
              if (preset) addNavigationItem(preset.name, preset.href);
            }}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Add built-in..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="/feed">Feed</SelectItem>
                <SelectItem value="/blog">Blog</SelectItem>
                <SelectItem value="/events">Events</SelectItem>
                <SelectItem value="/about">About</SelectItem>
                <SelectItem value="/contact">Contact</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => addNavigationItem()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Custom
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={navigation.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {navigation.map((item) => (
                <SortableNavItem
                  key={item.id}
                  item={item}
                  navigation={navigation}
                  onUpdate={updateNavigationItem}
                  onRemove={removeNavigationItem}
                  disabled={disabled}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </CardContent>
    </SortableSection>
  );
});
