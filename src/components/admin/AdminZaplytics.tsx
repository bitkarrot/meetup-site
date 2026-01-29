import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useZapAnalytics } from '@/hooks/useZapAnalytics';
import { TimeRangeButtons } from '@/components/zaplytics/TimeRangeSelector';
import { StatsCards } from '@/components/zaplytics/StatsCards';
import { EarningsChart } from '@/components/zaplytics/EarningsChart';
import { TopContentTable } from '@/components/zaplytics/TopContentTable';
import { TemporalPatternsChart } from '@/components/zaplytics/TemporalPatternsChart';
import { ZapperLoyalty } from '@/components/zaplytics/ZapperLoyalty';
import { ContentPerformance } from '@/components/zaplytics/ContentPerformance';
import { HashtagAnalytics } from '@/components/zaplytics/HashtagAnalytics';
import { ZapLoadingProgress } from '@/components/zaplytics/ZapLoadingProgress';
import { DraggableCollapsibleCard } from '@/components/zaplytics/DraggableCollapsibleCard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { TimeRange, CustomDateRange } from '@/types/zaplytics';

function UserOption({ pubkey }: { pubkey: string }) {
  const { data } = useAuthor(pubkey);
  const metadata = data?.metadata;

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        <AvatarImage src={metadata?.picture} alt={metadata?.name || pubkey} />
        <AvatarFallback>
          <Users className="h-3 w-3" />
        </AvatarFallback>
      </Avatar>
      <span className="truncate max-w-[200px]">
        {metadata?.name || metadata?.display_name || pubkey.substring(0, 8)}
      </span>
    </div>
  );
}

export default function AdminZaplytics() {
  const { config, updateConfig } = useAppContext();
  const feedNpubs = config.siteConfig?.feedNpubs || [];

  const [selectedPubkey, setSelectedPubkey] = useState<string>(feedNpubs[0] || '');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>();
  const [sectionOrder, setSectionOrder] = useState<string[]>(() =>
    config.siteConfig?.zaplyticsSectionOrder ?? [
      'stats',
      'earnings',
      'patterns',
      'content',
      'loyalty',
      'performance',
      'hashtags'
    ]
  );

  // Sync section order from config if it changes externally
  useEffect(() => {
    if (config.siteConfig?.zaplyticsSectionOrder) {
      setSectionOrder(config.siteConfig.zaplyticsSectionOrder);
    }
  }, [config.siteConfig?.zaplyticsSectionOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const newOrder = arrayMove(sectionOrder, sectionOrder.indexOf(active.id as string), sectionOrder.indexOf(over.id as string));
      setSectionOrder(newOrder);

      // Persist to local config
      updateConfig((prev) => ({
        ...prev,
        siteConfig: {
          ...prev.siteConfig,
          zaplyticsSectionOrder: newOrder
        }
      }));
    }
  };

  const isCustomRangeIncomplete = timeRange === 'custom' && (!customRange?.from || !customRange?.to);

  const {
    data: analytics,
    isLoading: queryLoading,
    error
  } = useZapAnalytics(
    timeRange,
    customRange,
    selectedPubkey
  );

  // Only show skeletons on the very first load for a selected user
  const isLoading = queryLoading && (!analytics || (analytics as any).totalZaps === 0);


  const onUserChange = (pubkey: string) => {
    setSelectedPubkey(pubkey);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Zaplytics</h2>
          <p className="text-muted-foreground">
            Analyze zap earnings for your community members.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-full sm:w-64">
            <Select value={selectedPubkey} onValueChange={onUserChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {feedNpubs.map((npub) => (
                  <SelectItem key={npub} value={npub}>
                    <UserOption pubkey={npub} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TimeRangeButtons
            value={timeRange}
            onChange={setTimeRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        </div>
      </div>

      {!selectedPubkey ? (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-16 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Ready to analyze zaps?</h3>
              <p className="text-muted-foreground">
                Select a community member from the dropdown above to view their zap earnings and analytics.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {analytics?.loadingState && !isCustomRangeIncomplete && (
            <ZapLoadingProgress
              isLoading={analytics.loadingState.isLoading}
              isComplete={analytics.loadingState.isComplete}
              currentCount={analytics.loadingState.totalFetched}
              relayLimit={analytics.loadingState.relayLimit}
              canLoadMore={analytics.loadingState.canLoadMore}
              onLoadMore={analytics.loadingState.loadMoreZaps}
              autoLoadEnabled={analytics.loadingState.autoLoadEnabled}
              consecutiveFailures={analytics.loadingState.consecutiveFailures}
              onToggleAutoLoad={analytics.loadingState.toggleAutoLoad}
              onRestartAutoLoad={analytics.loadingState.restartAutoLoad}
              phase="receipts"
            />
          )}

          {error && (
            <Card className="border-destructive">
              <CardContent className="py-6 text-destructive">
                Error loading analytics: {error instanceof Error ? error.message : 'Unknown error'}
              </CardContent>
            </Card>
          )}

          {!isCustomRangeIncomplete && (
            <div className="space-y-8">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sectionOrder}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
                    {sectionOrder.map((sectionId) => {
                      switch (sectionId) {
                        case 'stats':
                          return (
                            <DraggableCollapsibleCard
                              key="stats"
                              id="stats"
                              title="Summary Metrics"
                              description="Key performance indicators"
                              className="xl:col-span-2"
                            >
                              <div className="p-6">
                                <StatsCards data={analytics} isLoading={isLoading} />
                              </div>
                            </DraggableCollapsibleCard>
                          );
                        case 'earnings':
                          return (
                            <DraggableCollapsibleCard
                              key="earnings"
                              id="earnings"
                              title="Earnings Over Time"
                              description={`Showing earnings by ${timeRange === '24h' ? 'hour' : 'day'}`}
                            >
                              <EarningsChart
                                data={analytics?.earningsByPeriod || []}
                                timeRange={timeRange}
                                customRange={customRange}
                                isLoading={isLoading}
                              />
                            </DraggableCollapsibleCard>
                          );
                        case 'patterns':
                          return analytics?.temporalPatterns ? (
                            <DraggableCollapsibleCard
                              key="patterns"
                              id="patterns"
                              title="Activity Patterns"
                              description="When zaps are typically received"
                            >
                              <TemporalPatternsChart
                                hourlyData={analytics.temporalPatterns.earningsByHour}
                                weeklyData={analytics.temporalPatterns.earningsByDayOfWeek}
                                isLoading={isLoading}
                              />
                            </DraggableCollapsibleCard>
                          ) : null;
                        case 'content':
                          return (
                            <DraggableCollapsibleCard
                              key="content"
                              id="content"
                              title="Top Earning Content"
                              description="Posts that generated the most sats"
                            >
                              <TopContentTable
                                data={analytics?.topContent || []}
                                isLoading={isLoading}
                              />
                            </DraggableCollapsibleCard>
                          );
                        case 'loyalty':
                          return analytics?.zapperLoyalty ? (
                            <DraggableCollapsibleCard
                              key="loyalty"
                              id="loyalty"
                              title="Supporter Loyalty"
                              description="Your most consistent zappers"
                            >
                              <ZapperLoyalty
                                data={analytics.zapperLoyalty}
                                isLoading={isLoading}
                              />
                            </DraggableCollapsibleCard>
                          ) : null;
                        case 'performance':
                          return (
                            <DraggableCollapsibleCard
                              key="performance"
                              id="performance"
                              title="Content Performance"
                              description="Detailed engagement metrics per post"
                              className="xl:col-span-2"
                            >
                              <ContentPerformance
                                data={analytics?.contentPerformance || []}
                                isLoading={isLoading}
                              />
                            </DraggableCollapsibleCard>
                          );
                        case 'hashtags':
                          return (
                            <DraggableCollapsibleCard
                              key="hashtags"
                              id="hashtags"
                              title="Hashtag Performance"
                              description="Analytics by hashtag"
                              className="xl:col-span-2"
                            >
                              <HashtagAnalytics
                                data={analytics?.hashtagPerformance || []}
                                isLoading={isLoading}
                              />
                            </DraggableCollapsibleCard>
                          );
                        default:
                          return null;
                      }
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
