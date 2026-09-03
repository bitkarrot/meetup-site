import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, RefreshCw } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminAuth } from '@/hooks/useRemoteNostrJson';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useZapAnalytics } from '@/hooks/useZapAnalytics';
import { useCommunityZapStats, type CommunityTimeRange } from '@/hooks/useCommunityZapStats';
import type { AnalyticsData } from '@/types/zaplytics';
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
import { MemberSummaryTable } from '@/components/zaplytics/MemberSummaryTable';
import { CommunityEarningsChart } from '@/components/zaplytics/CommunityEarningsChart';
import { CommunityHeatmap } from '@/components/zaplytics/CommunityHeatmap';
import { MemberRadarChart } from '@/components/zaplytics/MemberRadarChart';
import { ContributorNetworkGraph } from '@/components/zaplytics/ContributorNetworkGraph';
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
  const { user } = useCurrentUser();
  const { isMaster } = useAdminAuth(user?.pubkey);
  const feedNpubs = config.siteConfig?.feedNpubs || [];
  const adminRoles = config.siteConfig?.adminRoles || {};
  const userRole = user?.pubkey ? adminRoles[user.pubkey.toLowerCase().trim()] : undefined;
  const canViewAll = isMaster || userRole === 'publisher';

  const [activeTab, setActiveTab] = useState<string>('individual');
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

  // Community zap stats (server-side aggregate) — only fetched when
  // the Community tab is visible and the user has permission.
  const [communityTimeRange, setCommunityTimeRange] = useState<CommunityTimeRange>('all');
  const {
    data: communityData,
    isLoading: communityLoading,
    error: communityError,
    refetch: refetchCommunity,
  } = useCommunityZapStats(communityTimeRange);

  // Sync section order from config if it changes externally
  useEffect(() => {
    if (config.siteConfig?.zaplyticsSectionOrder) {
      setSectionOrder(config.siteConfig.zaplyticsSectionOrder);
    }
  }, [config.siteConfig?.zaplyticsSectionOrder]);

  // Secondary users can only view their own zap stats.
  // Once auth loads, force the selection to their own pubkey.
  useEffect(() => {
    if (!canViewAll && user?.pubkey) {
      setSelectedPubkey(user.pubkey);
    }
  }, [canViewAll, user?.pubkey]);

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
    error,
    loadingState
  } = useZapAnalytics(
    timeRange,
    customRange,
    selectedPubkey
  );

  // Only show skeletons on the very first load for a selected user
  const isLoading = queryLoading && (!analytics || (analytics as AnalyticsData).totalZaps === 0);

  const onUserChange = (pubkey: string) => {
    setSelectedPubkey(pubkey);
  };

  // Clicking a member in the comparison table switches to Individual tab
  const handleSelectMember = (pubkey: string) => {
    setSelectedPubkey(pubkey);
    setActiveTab('individual');
  };

  const communityAggregate = communityData?.aggregate;
  const communityMembers = communityData?.members || [];
  const lastUpdatedLabel = communityData
    ? `Last updated ${Math.round((Date.now() / 1000 - communityData.lastUpdated) / 60)} min ago`
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Zaplytics</h2>
        <p className="text-muted-foreground">
          Analyze zap earnings for your community members.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="individual">Individual</TabsTrigger>
          {canViewAll && (
            <TabsTrigger value="community">Community</TabsTrigger>
          )}
        </TabsList>

        {/* ---- Individual tab ---- */}
        <TabsContent value="individual" className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-full sm:w-64">
                <Select value={selectedPubkey} onValueChange={onUserChange} disabled={!canViewAll}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(canViewAll ? feedNpubs : (user?.pubkey ? [user.pubkey] : []))
                      .filter(npub => !!npub)
                      .map((npub) => (
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
                    {canViewAll
                      ? 'Select a community member from the dropdown above to view their zap earnings and analytics.'
                      : 'Your zap analytics will appear here once you have zap receipts on the relay.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {loadingState && !isCustomRangeIncomplete && (
                <ZapLoadingProgress
                  isLoading={loadingState.isLoading}
                  isComplete={loadingState.isComplete}
                  currentCount={loadingState.totalFetched}
                  relayLimit={loadingState.relayLimit}
                  canLoadMore={loadingState.canLoadMore}
                  onLoadMore={loadingState.loadMoreZaps}
                  autoLoadEnabled={loadingState.autoLoadEnabled}
                  consecutiveFailures={loadingState.consecutiveFailures}
                  onToggleAutoLoad={loadingState.toggleAutoLoad}
                  onRestartAutoLoad={loadingState.restartAutoLoad}
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
                                  description={`Showing earnings by ${timeRange === '24h' ? 'hour' : timeRange === 'all' ? 'month' : 'day'}`}
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
                              return (timeRange !== '24h' && analytics?.temporalPatterns) ? (
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
        </TabsContent>

        {/* ---- Community tab (Master/Publisher only) ---- */}
        {canViewAll && (
          <TabsContent value="community" className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-1">
                  {([
                    { key: '7d', label: '7d' },
                    { key: '30d', label: '30d' },
                    { key: 'all', label: 'All time' },
                  ] as { key: CommunityTimeRange; label: string }[]).map(({ key, label }) => (
                    <Button
                      key={key}
                      variant={communityTimeRange === key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCommunityTimeRange(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refetchCommunity}
                  disabled={communityLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${communityLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {communityData ? lastUpdatedLabel : 'Loading...'}
              </p>
            </div>

            {communityError && (
              <Card className="border-destructive">
                <CardContent className="py-6 text-destructive">
                  Error loading community stats: {communityError instanceof Error ? communityError.message : 'Unknown error'}
                </CardContent>
              </Card>
            )}

            {communityAggregate && (
              <div className="space-y-8">
                {/* Summary metrics */}
                <StatsCards data={communityAggregate} isLoading={communityLoading} />

                {/* Compact member summary table */}
                <MemberSummaryTable
                  members={communityMembers}
                  isLoading={communityLoading}
                  onSelectMember={handleSelectMember}
                />

                {/* Multi-line earnings comparison chart */}
                <CommunityEarningsChart
                  members={communityMembers}
                  isLoading={communityLoading}
                  timeRange={communityTimeRange}
                />

                {/* Activity heatmap + radar chart */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <DraggableCollapsibleCard
                    id="community-heatmap"
                    title="Activity Heatmap"
                    description="Daily activity — scroll left for older data"
                  >
                    <CommunityHeatmap
                      data={communityAggregate.earningsByPeriod}
                      members={communityMembers}
                      isLoading={communityLoading}
                    />
                  </DraggableCollapsibleCard>

                  <DraggableCollapsibleCard
                    id="community-radar"
                    title="Member Comparison Radar"
                    description="Multi-dimensional member comparison"
                  >
                    <MemberRadarChart
                      members={communityMembers}
                      isLoading={communityLoading}
                      aggregatePeriods={communityAggregate.earningsByPeriod}
                    />
                  </DraggableCollapsibleCard>
                </div>

                {/* Contributor network graph */}
                <DraggableCollapsibleCard
                  id="community-network"
                  title="Contributor Network"
                  description="How contributors connect to members"
                  className="xl:col-span-2"
                >
                  <ContributorNetworkGraph
                    members={communityMembers}
                    isLoading={communityLoading}
                  />
                </DraggableCollapsibleCard>

                {/* Charts + tables in a grid */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <DraggableCollapsibleCard
                    id="community-content"
                    title="Top Earning Content"
                    description="Community-wide top zapped content"
                  >
                    <TopContentTable
                      data={communityAggregate.topContent}
                      isLoading={communityLoading}
                    />
                  </DraggableCollapsibleCard>

                  <DraggableCollapsibleCard
                    id="community-loyalty"
                    title="Supporter Loyalty"
                    description="Community-wide supporter retention"
                  >
                    <ZapperLoyalty
                      data={communityAggregate.zapperLoyalty}
                      isLoading={communityLoading}
                    />
                  </DraggableCollapsibleCard>
                </div>

              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
