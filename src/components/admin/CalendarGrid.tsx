/**
 * Calendar grid component with month and week views.
 *
 * Displays a generic list of calendar items in a familiar calendar grid layout.
 * It can be used directly with a custom `renderItem` or through the legacy
 * `events` / `onEventClick` props for UnifiedCalendarEvent data.
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Video } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import type { UnifiedCalendarEvent } from '@/lib/calendarEvents';
import { isEventLive } from '@/lib/calendarEvents';

type ViewMode = 'month' | 'week';

export interface CalendarItem {
  id: string;
  start: number; // Unix timestamp in seconds
  title: string;
  image?: string;
  status?: string;
  type?: string;
}

export interface CalendarGridProps<T extends CalendarItem = CalendarItem> {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  // Legacy event-based props (still used by EventsPage and AdminEvents)
  events?: UnifiedCalendarEvent[];
  onEventClick?: (event: UnifiedCalendarEvent) => void;
  // Generic item-based props
  items?: T[];
  onItemClick?: (item: T) => void;
  renderItem?: (props: { item: T; compact: boolean; onClick: () => void }) => ReactNode;
  onShowMore?: (date: Date, items: T[]) => void;
}

export function CalendarGrid<T extends CalendarItem = CalendarItem>({
  viewMode = 'month',
  onViewModeChange,
  events,
  onEventClick,
  items,
  onItemClick,
  renderItem,
  onShowMore,
}: CalendarGridProps<T>) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const handlePrevious = () => setCurrentDate(viewMode === 'week' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1));
  const handleNext = () => setCurrentDate(viewMode === 'week' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  const data = (events || items || []) as T[];

  const handleItemClick = (item: T) => {
    if (events && onEventClick) {
      onEventClick(item as unknown as UnifiedCalendarEvent);
    } else if (onItemClick) {
      onItemClick(item);
    }
  };

  const ItemRenderer = (props: { item: T; compact: boolean; onClick: () => void }) => {
    if (renderItem) {
      return renderItem(props);
    }
    // Legacy default renderer for UnifiedCalendarEvent data.
    return <EventBlock event={props.item as unknown as UnifiedCalendarEvent} compact={props.compact} onClick={props.onClick} />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={handlePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {onViewModeChange && (
          <div className="flex gap-1">
            <Button
              variant={viewMode === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewModeChange('month')}
            >
              Month
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewModeChange('week')}
            >
              Week
            </Button>
          </div>
        )}
      </div>

      {/* Calendar Grid */}
      {viewMode === 'month' ? (
        <MonthView items={data} currentDate={currentDate} renderItem={ItemRenderer} onItemClick={handleItemClick} onShowMore={onShowMore} />
      ) : (
        <WeekView items={data} currentDate={currentDate} renderItem={ItemRenderer} onItemClick={handleItemClick} />
      )}
    </div>
  );
}

interface MonthViewProps<T extends CalendarItem> {
  items: T[];
  currentDate: Date;
  onItemClick: (item: T) => void;
  renderItem: (props: { item: T; compact: boolean; onClick: () => void }) => ReactNode;
  onShowMore?: (date: Date, items: T[]) => void;
}

function MonthView<T extends CalendarItem>({ items, currentDate, onItemClick, renderItem, onShowMore }: MonthViewProps<T>) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group items by date
  const itemsByDate = new Map<string, T[]>();
  items.forEach(item => {
    const itemDate = new Date(item.start * 1000);
    const dateKey = format(itemDate, 'yyyy-MM-dd');
    if (!itemsByDate.has(dateKey)) {
      itemsByDate.set(dateKey, []);
    }
    itemsByDate.get(dateKey)!.push(item);
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted">
        {dayNames.map(day => (
          <div key={day} className="p-2 text-center text-sm font-medium">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayItems = itemsByDate.get(dateKey) || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateKey}
              className={`
                min-h-[100px] border-b border-r p-1
                ${!isCurrentMonth ? 'bg-muted/50' : ''}
                ${isToday ? 'bg-blue-50' : ''}
              `}
            >
              <div className="text-sm font-medium mb-1">
                {format(day, 'd')}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 3).map(item => (
                  <div key={item.id}>
                    {renderItem({
                      item,
                      compact: true,
                      onClick: () => onItemClick(item),
                    })}
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onShowMore?.(day, dayItems)}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline text-left w-full"
                  >
                    +{dayItems.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface WeekViewProps<T extends CalendarItem> {
  items: T[];
  currentDate: Date;
  onItemClick: (item: T) => void;
  renderItem: (props: { item: T; compact: boolean; onClick: () => void }) => ReactNode;
}

function WeekView<T extends CalendarItem>({ items, currentDate, onItemClick, renderItem }: WeekViewProps<T>) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Calculate "now" position for the current time indicator
  const now = new Date();
  const isCurrentWeek = now >= weekStart && now <= weekEnd;
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const nowPosition = (nowHour * 60 + nowMinute) / (24 * 60) * 100; // Percentage from top

  // Group items by date
  const itemsByDate = new Map<string, T[]>();
  items.forEach(item => {
    const itemDate = new Date(item.start * 1000);
    const dateKey = format(itemDate, 'yyyy-MM-dd');
    if (!itemsByDate.has(dateKey)) {
      itemsByDate.set(dateKey, []);
    }
    itemsByDate.get(dateKey)!.push(item);
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted">
        {dayNames.map(day => (
          <div key={day} className="p-2 text-center text-sm font-medium">
            {day}
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 relative">
        {/* "Now" line indicator */}
        {isCurrentWeek && (
          <div
            className="absolute left-0 right-0 border-t-2 border-red-500 z-10 pointer-events-none"
            style={{ top: `${nowPosition}%` }}
          >
            <div className="absolute right-2 -top-3 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              Now
            </div>
          </div>
        )}

        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayItems = itemsByDate.get(dateKey) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateKey}
              className={`
                min-h-[300px] border-b border-r p-2
                ${isToday ? 'bg-blue-50' : ''}
              `}
            >
              <div className="text-sm font-medium mb-2">
                {format(day, 'MMM d')}
              </div>
              <div className="space-y-2">
                {dayItems.map(item => (
                  <div key={item.id}>
                    {renderItem({
                      item,
                      compact: false,
                      onClick: () => onItemClick(item),
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EventBlockProps {
  event: UnifiedCalendarEvent;
  compact?: boolean;
  onClick?: () => void;
}

function EventBlock({ event, compact = false, onClick }: EventBlockProps) {
  const isLive = event.type === 'live' && isEventLive(event);
  const isCalendar = event.type === 'calendar';

  return (
    <div
      onClick={onClick}
      className={`
        cursor-pointer rounded p-1 text-xs
        ${isCalendar
          ? 'bg-blue-100 text-blue-900 hover:bg-blue-200'
          : 'bg-purple-100 text-purple-900 hover:bg-purple-200'
        }
        ${compact ? 'truncate' : ''}
        ${isLive ? 'animate-pulse border-2 border-red-500' : ''}
      `}
    >
      <div className="flex items-center gap-1">
        {isCalendar ? (
          <CalendarIcon className="h-3 w-3 shrink-0" />
        ) : (
          <Video className="h-3 w-3 shrink-0" />
        )}
        <span className={compact ? 'truncate' : 'font-medium'}>
          {event.title}
        </span>
      </div>
      {!compact && event.type === 'live' && (
        <div className="text-[10px] opacity-75">
          {event.room.name}
        </div>
      )}
    </div>
  );
}
