import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, Database, HardDrive, Image as ImageIcon, Video } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { categorizeKinds, kindLabel } from '@/lib/kinds';
import { getApiBaseUrl } from '@/lib/relay';

// ---- Types ----

interface MyStatsResponse {
  pubkey: string;
  total: number;
  byKind: Record<string, number>;
  lastActivity: number;
  blossom: {
    count: number;
    totalSize: number;
    images: number;
    videos: number;
    other: number;
  };
  embedded: {
    images: number;
    videos: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function MyActivityCard() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // Fetch personal stats from the backend. This does a full DB scan
  // server-side (like /stats) filtered to the authenticated user,
  // which is more accurate than a client-side Nostr query because:
  //   - Kind 24242 (Blossom blob index) events aren't in the pubkey
  //     index and can't be queried by `authors` via WebSocket
  //   - The badger pubkey-only index has a limit bug that returns
  //     fewer events than requested when no `kinds` filter is set
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['my-stats', user?.pubkey],
    queryFn: async (): Promise<MyStatsResponse> => {
      const apiBase = getApiBaseUrl();

      // Ensure we have a dashboard session cookie by logging in first.
      // The /login endpoint accepts any pubkey listed in nostr.json.
      const loginResponse = await fetch(`${apiBase}/dashboard/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey: user!.pubkey.toLowerCase().trim() }),
      });
      if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.status}`);
      }

      const res = await fetch(`${apiBase}/dashboard/my-stats`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch my-stats: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!user?.pubkey,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-stats'] });
  };

  // Convert byKind (string keys from JSON) to the format categorizeKinds expects
  const byKind: Record<string, number> = {};
  if (stats?.byKind) {
    for (const [k, v] of Object.entries(stats.byKind)) {
      byKind[k] = v;
    }
  }
  const categories = stats ? categorizeKinds(byKind) : [];
  const hasMedia = (stats && (stats.blossom.count > 0 || stats.embedded.images > 0 || stats.embedded.videos > 0));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">My Activity</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Failed to load activity.
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Retry
            </Button>
          </div>
        ) : !stats || stats.total === 0 ? (
          <div className="space-y-2">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">
              No events from you on this relay yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Use{' '}
              <Link to="/admin/sync-content" className="underline hover:text-primary">
                Sync Content
              </Link>{' '}
              to back up your activity from other relays.
            </p>
          </div>
        ) : (
          <>
            {/* Total + last activity */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {stats.total.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                events on this relay
              </span>
            </div>
            {stats.lastActivity > 0 && (
              <p className="text-xs text-muted-foreground">
                Last activity:{' '}
                {new Date(stats.lastActivity * 1000).toLocaleDateString()}
              </p>
            )}

            {/* Categorized breakdown — hover for per-kind details */}
            <div className="space-y-1.5 pt-1">
              {categories.map((cat) => (
                <div key={cat.label} className="flex items-center gap-2">
                  {cat.kinds.length > 1 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">
                          <Badge variant="secondary" className="text-xs font-medium">
                            {cat.label}
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-0.5">
                          {cat.kinds.map(({ kind, count }) => (
                            <div key={kind} className="flex justify-between gap-3 text-xs">
                              <span>{kindLabel(kind)}</span>
                              <span className="font-mono text-muted-foreground">{count}</span>
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge variant="secondary" className="text-xs font-medium">
                      {cat.label}
                    </Badge>
                  )}
                  <span className="text-sm font-mono">{cat.count}</span>
                </div>
              ))}
            </div>

            {/* Media section */}
            {hasMedia && (
              <div className="space-y-2 pt-2 border-t">
                {/* Blossom media (stored on this relay) */}
                {stats.blossom.count > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">Blossom media</span>
                      <span className="text-sm font-mono">{stats.blossom.count}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatBytes(stats.blossom.totalSize)})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-5">
                      {stats.blossom.images > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3" />
                          {stats.blossom.images} image{stats.blossom.images !== 1 ? 's' : ''}
                        </span>
                      )}
                      {stats.blossom.videos > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Video className="h-3 w-3" />
                          {stats.blossom.videos} video{stats.blossom.videos !== 1 ? 's' : ''}
                        </span>
                      )}
                      {stats.blossom.other > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {stats.blossom.other} other
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Embedded media (imeta tags in posts, may be hosted elsewhere) */}
                {stats.embedded.images > 0 || stats.embedded.videos > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">Media in posts</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-5">
                      {stats.embedded.images > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3" />
                          {stats.embedded.images} image{stats.embedded.images !== 1 ? 's' : ''}
                        </span>
                      )}
                      {stats.embedded.videos > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Video className="h-3 w-3" />
                          {stats.embedded.videos} video{stats.embedded.videos !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <p className="text-xs text-muted-foreground pt-1">
              Back up your events via{' '}
              <Link to="/admin/sync-content" className="underline hover:text-primary">
                Sync Content
              </Link>
              .
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
