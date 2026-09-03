import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Zap, 
  TrendingUp, 
  Calendar,
  ExternalLink,
  Timer,
  Target
} from 'lucide-react';
import type { ContentPerformance } from '@/types/zaplytics';
import { formatSats, createNjumpEventLink } from '@/lib/zaplytics/utils';
import { KIND_NAMES } from '@/types/zaplytics';
import { ContentPreview } from '@/components/zaplytics/ContentPreview';

interface ContentPerformanceProps {
  data: ContentPerformance[];
  isLoading: boolean;
}

const formatTimeToFirstZap = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
};

const formatLongevity = (days: number): string => {
  if (days < 1) return '< 1 day';
  if (days < 30) return `${Math.round(days)} days`;
  return `${Math.round(days / 30)} months`;
};

const getViralityBadge = (score: number) => {
  if (score >= 80) return { label: 'Viral', color: 'bg-red-500', icon: '🔥' };
  if (score >= 50) return { label: 'Hot', color: 'bg-orange-500', icon: '⚡' };
  if (score >= 20) return { label: 'Trending', color: 'bg-yellow-500', icon: '📈' };
  return { label: 'Slow Burn', color: 'bg-blue-500', icon: '🐌' };
};

const getPeakWindowLabel = (hours: number): string => {
  if (hours === 1) return '1 hour';
  if (hours === 6) return '6 hours';
  if (hours === 24) return '1 day';
  if (hours === 72) return '3 days';
  return `${hours} hours`;
};

export function ContentPerformance({ data, isLoading }: ContentPerformanceProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Content Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[500px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Content Performance</CardTitle>
        </CardHeader>
        <CardContent className="h-[500px] flex items-center justify-center">
          <p className="text-muted-foreground">No content performance data available</p>
        </CardContent>
      </Card>
    );
  }

  // Sort content by different metrics for tabs
  const sortedByEarnings = [...data].sort((a, b) => b.totalSats - a.totalSats);
  const sortedByVirality = [...data].sort((a, b) => b.viralityScore - a.viralityScore);
  const sortedBySpeed = [...data].filter(item => item.timeToFirstZap > 0).sort((a, b) => a.timeToFirstZap - b.timeToFirstZap);
  const sortedByLongevity = [...data].filter(item => item.longevityDays > 0).sort((a, b) => b.longevityDays - a.longevityDays);

  const ContentTable = ({ items, showMetric }: { items: ContentPerformance[], showMetric: 'earnings' | 'virality' | 'speed' | 'longevity' }) => (
    <div className="space-y-3">
      {items.slice(0, 10).map((item) => {
        const viralityBadge = getViralityBadge(item.viralityScore);
        const kindName = KIND_NAMES[item.eventKind] || `Kind ${item.eventKind}`;
        
        return (
          <div key={item.eventId} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
            {/* Content Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  {kindName}
                </Badge>
                {showMetric === 'virality' && (
                  <Badge 
                    className="text-xs px-2 py-0 h-5"
                    style={{ 
                      backgroundColor: viralityBadge.color + '20', 
                      color: viralityBadge.color 
                    }}
                  >
                    {viralityBadge.icon} {viralityBadge.label}
                  </Badge>
                )}
              </div>
              
              <div className="mb-3">
                <ContentPreview content={item.content} maxLength={120} />
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className={`flex items-center gap-2 ${showMetric === 'earnings' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <Zap className="h-4 w-4" />
                  <div>
                    <div>{formatSats(item.totalSats)} sats</div>
                    <div className="text-xs opacity-70">{item.zapCount} zaps</div>
                  </div>
                </div>

                <div className={`flex items-center gap-2 ${showMetric === 'speed' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <Timer className="h-4 w-4" />
                  <div>
                    <div>{formatTimeToFirstZap(item.timeToFirstZap)}</div>
                    <div className="text-xs opacity-70">to first zap</div>
                  </div>
                </div>

                <div className={`flex items-center gap-2 ${showMetric === 'virality' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <TrendingUp className="h-4 w-4" />
                  <div>
                    <div>{item.viralityScore.toFixed(1)}%</div>
                    <div className="text-xs opacity-70">in 1st hour</div>
                  </div>
                </div>

                <div className={`flex items-center gap-2 ${showMetric === 'longevity' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <Calendar className="h-4 w-4" />
                  <div>
                    <div>{formatLongevity(item.longevityDays)}</div>
                    <div className="text-xs opacity-70">earning span</div>
                  </div>
                </div>
              </div>

              {/* Additional Performance Info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 mt-3 border-t border-muted">
                <div className="flex items-center gap-4">
                  <span>Avg: {formatSats(item.avgZapAmount)} sats/zap</span>
                  <span>Peak: {getPeakWindowLabel(item.peakEarningsWindow)}</span>
                </div>
                <div>
                  {new Date(item.created_at * 1000).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            {/* External Link */}
            <div className="flex-shrink-0">
              <a
                href={createNjumpEventLink(item.eventId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-opacity"
              >
                View Content <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Content Performance
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Deep dive into what makes your content successful
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="earnings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="earnings">Top Earners</TabsTrigger>
            <TabsTrigger value="viral">Most Viral</TabsTrigger>
            <TabsTrigger value="quick">Quickest</TabsTrigger>
            <TabsTrigger value="lasting">Longest Term</TabsTrigger>
          </TabsList>
          
          <TabsContent value="earnings" className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Highest Earning Content</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Your most successful content by total sats earned
              </p>
            </div>
            <ContentTable items={sortedByEarnings} showMetric="earnings" />
          </TabsContent>
          
          <TabsContent value="viral" className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Most Viral Content</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Content that got the most engagement in the first hour
              </p>
            </div>
            <ContentTable items={sortedByVirality} showMetric="virality" />
          </TabsContent>
          
          <TabsContent value="quick" className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Quickest to Engage</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Content that got zapped the fastest after posting
              </p>
            </div>
            <ContentTable items={sortedBySpeed} showMetric="speed" />
          </TabsContent>
          
          <TabsContent value="lasting" className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Longest Term Appeal</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Content that continues earning zaps over the longest period
              </p>
            </div>
            <ContentTable items={sortedByLongevity} showMetric="longevity" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}