import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Zap, Clock, Database, Download, Play, Pause, RotateCcw } from 'lucide-react';

interface ZapLoadingProgressProps {
  isLoading: boolean;
  isComplete: boolean;
  currentCount: number;
  relayLimit: number | null;
  canLoadMore: boolean;
  onLoadMore: () => void;
  autoLoadEnabled?: boolean;
  consecutiveFailures?: number;
  onToggleAutoLoad?: () => void;
  onRestartAutoLoad?: () => void;
  phase?: 'receipts' | 'content' | 'profiles' | 'analytics' | 'complete';
}

export function ZapLoadingProgress({ 
  isLoading,
  isComplete,
  currentCount,
  relayLimit,
  canLoadMore,
  onLoadMore,
  autoLoadEnabled = true,
  consecutiveFailures = 0,
  onToggleAutoLoad,
  onRestartAutoLoad,
  phase = 'receipts'
}: ZapLoadingProgressProps) {
  // Don't show anything if there's no data and not loading
  if (currentCount === 0 && !isLoading) return null;
  
  // FIXED: Hide the progress component entirely when loading is complete
  // This prevents showing "partial data loaded" when everything is actually done
  if (isComplete && !isLoading && !canLoadMore) return null;

  const phaseLabels = {
    receipts: 'Loading zap receipts',
    content: 'Loading zapped content',
    profiles: 'Fetching user profiles', 
    analytics: 'Processing analytics',
    complete: 'Complete',
  };

  const phaseIcons = {
    receipts: Zap,
    content: Database,
    profiles: Database,
    analytics: Clock,
    complete: Zap,
  };

  const Icon = phaseIcons[phase];
  
  // Determine current status message
  const getStatusMessage = () => {
    if (isLoading) {
      return autoLoadEnabled ? 'Auto-loading data...' : phaseLabels[phase];
    }
    if (isComplete) {
      return 'All zaps loaded';
    }
    if (consecutiveFailures >= 3) {
      return 'Auto-loading stopped due to errors';
    }
    if (!autoLoadEnabled) {
      return 'Auto-loading paused';
    }
    return 'Partial data loaded';
  };

  return (
    <Card className="mb-6 border-dashed">
      <CardContent className="py-6">
        <div className="space-y-4">
          {/* Header with status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon className={`h-5 w-5 text-primary ${isLoading ? 'animate-pulse' : ''}`} />
              <span className="font-medium">
                {getStatusMessage()}
              </span>
              {/* Auto-loading status indicator */}
              {!isComplete && (
                <div className="flex items-center gap-2">
                  {autoLoadEnabled ? (
                    <Badge variant="outline" className="gap-1 text-green-700 border-green-200">
                      <Play className="h-3 w-3" />
                      Auto
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-orange-700 border-orange-200">
                      <Pause className="h-3 w-3" />
                      Paused
                    </Badge>
                  )}
                  
                  {consecutiveFailures > 0 && (
                    <Badge variant="outline" className="gap-1 text-red-700 border-red-200">
                      {consecutiveFailures} errors
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <Badge variant="outline" className="gap-1">
              <Zap className="h-3 w-3" />
              {currentCount.toLocaleString()} zaps
            </Badge>
          </div>

          {/* Progress indicators */}
          {!isComplete && (
            <div className="space-y-3">
              {/* Relay limit detection */}
              {relayLimit && (
                <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
                  📡 Detected relay limit: {relayLimit.toLocaleString()} events per batch
                </div>
              )}

              {/* Current status */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  {isLoading ? (autoLoadEnabled ? 'Auto-loading more zaps...' : 'Loading more zaps...') :
                   autoLoadEnabled ? 'Preparing next batch...' : 'Ready to load more data'}
                </span>
                
                <div className="flex items-center gap-2">
                  {/* Auto-loading controls */}
                  {!isComplete && onToggleAutoLoad && (
                    <Button 
                      onClick={onToggleAutoLoad}
                      size="sm" 
                      variant="outline"
                      className="gap-2"
                    >
                      {autoLoadEnabled ? (
                        <>
                          <Pause className="h-3 w-3" />
                          Pause Auto
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" />
                          Resume Auto
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Restart auto loading after failures */}
                  {consecutiveFailures >= 3 && onRestartAutoLoad && (
                    <Button 
                      onClick={onRestartAutoLoad}
                      size="sm" 
                      variant="outline"
                      className="gap-2"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </Button>
                  )}
                  
                  {/* Manual load more button */}
                  {canLoadMore && !isLoading && (
                    <Button 
                      onClick={onLoadMore}
                      size="sm" 
                      className="gap-2"
                    >
                      <Download className="h-3 w-3" />
                      Load More
                    </Button>
                  )}
                </div>
              </div>

              {/* Loading indicator — show whenever loading is in progress,
                  not just during active fetch. This prevents the animation
                  from flickering off between batches (200ms gap). */}
              {autoLoadEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className={`w-2 h-2 bg-primary rounded-full ${isLoading ? 'animate-pulse' : 'animate-pulse opacity-50'}`}></div>
                    {isLoading
                      ? 'Loading zap data in batches for optimal performance...'
                      : 'Preparing next batch...'}
                  </div>
                  {/* Indeterminate loading bar — shadcn Progress doesn't
                      support indeterminate mode (value=undefined renders
                      the indicator off-screen), so we use a CSS animation. */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full w-1/3 rounded-full bg-primary animate-[loading_1.5s_ease-in-out_infinite]" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Complete state */}
          {isComplete && currentCount > 0 && (
            <div className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950 p-2 rounded border border-green-200 dark:border-green-800">
              ✅ All available zaps loaded for the selected time period
            </div>
          )}

          {/* Info about progressive loading */}
          {currentCount > 0 && !isComplete && (
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
              <p>📊 Data loads progressively - you can view current results while more data loads</p>
              <p>🚀 Charts and stats update automatically as new data is fetched</p>
              {autoLoadEnabled ? (
                <p>⚡ Auto-loading enabled - data will load in batches automatically</p>
              ) : (
                <p>⏸️ Auto-loading paused - click "Resume Auto" or "Load More" to continue</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}