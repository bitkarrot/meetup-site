import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Zap } from 'lucide-react';
import type { EarningsByContent } from '@/types/zaplytics';
import { formatSats, createNjumpEventLink } from '@/lib/zaplytics/utils';
import { KIND_NAMES } from '@/types/zaplytics';
import { ContentPreview } from '@/components/zaplytics/ContentPreview';

interface TopContentTableProps {
  data: EarningsByContent[];
  isLoading: boolean;
}

export function TopContentTable({ data, isLoading }: TopContentTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Earning Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-3 w-[100px]" />
                </div>
                <div className="text-right space-y-2">
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-3 w-[60px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Earning Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">No content data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Top Earning Content
          <Badge variant="secondary">{data.length}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Content ranked by total sats received
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item, index) => (
            <div 
              key={item.eventId} 
              className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors group"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary">#{index + 1}</span>
              </div>
              
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    {KIND_NAMES[item.eventKind] || `Kind ${item.eventKind}`}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.created_at * 1000).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="mb-2">
                  {item.content ?
                    <ContentPreview content={item.content} maxLength={150} /> :
                    <span className="text-muted-foreground italic">
                      Content unavailable (event ID: {item.eventId.substring(0, 8)}...)
                    </span>
                  }
                </div>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {item.zapCount} zap{item.zapCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              
              <div className="flex-shrink-0 text-right">
                <div className="text-lg font-bold text-primary">
                  {formatSats(item.totalSats)}
                </div>
                <div className="text-xs text-muted-foreground">sats</div>
                
                <a
                  href={createNjumpEventLink(item.eventId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  View <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
        
        {data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No content has been zapped yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}