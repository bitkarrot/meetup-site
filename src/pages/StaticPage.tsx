import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Navigation from '@/components/Navigation';
import { useEffect, useState } from 'react';

export default function StaticPage({ pathOverride }: { pathOverride?: string }) {
  const { path } = useParams<{ path: string }>();
  const { poolNostr, nostr: defaultRelay } = useDefaultRelay();
  const [content, setContent] = useState<string | null>(null);
  const fullPath = pathOverride || `/${path}`;

  const { data: pageEvent, isLoading: isEventLoading, error, refetch } = useQuery({
    queryKey: ['static-page', fullPath],
    queryFn: async () => {
      console.log('StaticPage: Querying for path:', fullPath);
      const signal = AbortSignal.timeout(5000);
      
      const unslashedPath = fullPath.startsWith('/') ? fullPath.slice(1) : fullPath;
      const slashedPath = fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
      
      const filters = [
        { kinds: [34128], '#d': [slashedPath, unslashedPath] }
      ];
      
      console.log('StaticPage: Filters:', filters);
      
      // Try pool first
      let events = await poolNostr.query(filters, { signal });
      
      // If pool returns nothing, try default relay explicitly
      if (events.length === 0 && defaultRelay) {
        console.log('StaticPage: No events in pool, trying default relay');
        events = await defaultRelay.query(filters, { signal });
      }
      
      console.log('StaticPage: Found events:', events);
      
      return events.sort((a, b) => b.created_at - a.created_at)[0] || null;
    },
    enabled: !!fullPath,
    staleTime: 30000, 
    retry: 2,
  });

  if (error) {
    console.error('StaticPage: Error fetching event:', error);
  }

  useEffect(() => {
    async function fetchFromBlossom() {
      if (!pageEvent) return;

      const sha256 = pageEvent.tags.find(([name]) => name === 'sha256')?.[1];
      if (!sha256) {
        // Fallback to event content if no sha256 (though our admin adds it)
        setContent(pageEvent.content);
        return;
      }

      try {
        // Try to fetch from common blossom servers
        const servers = ['https://blossom.primal.net/'];
        let fetchedContent = '';
        
        for (const server of servers) {
          try {
            const response = await fetch(`${server}${sha256}`);
            if (response.ok) {
              fetchedContent = await response.text();
              break;
            }
          } catch (e) {
            console.error(`Failed to fetch from ${server}:`, e);
          }
        }

        if (fetchedContent) {
          // If it's a full HTML doc, we might want to extract just the body
          // for simplicity in this React component, or use an iframe.
          // For now, let's assume it's content we can render.
          if (fetchedContent.includes('<body>')) {
            const bodyMatch = fetchedContent.match(/<body>([\s\S]*)<\/body>/i);
            setContent(bodyMatch ? bodyMatch[1] : fetchedContent);
          } else {
            setContent(fetchedContent);
          }
        } else {
          setContent(pageEvent.content);
        }
      } catch (error) {
        console.error('Error fetching from Blossom:', error);
        setContent(pageEvent.content);
      }
    }

    fetchFromBlossom();
  }, [pageEvent]);

  if (isEventLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 py-12">
          <Skeleton className="h-12 w-3/4 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </main>
      </div>
    );
  }

  if (!pageEvent && !isEventLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h1 className="text-4xl font-bold mb-4">404</h1>
          <p className="text-muted-foreground mb-8">Page not found for path: {fullPath}</p>
          <p className="text-muted-foreground mb-8">Tried pool and default relay, but no event found.</p>
          <Button onClick={() => refetch()} variant="outline">
            Try Again
          </Button>
        </main>
      </div>
    );
  }

  const isHtml = content?.trim().startsWith('<');

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          {isHtml ? (
            <div dangerouslySetInnerHTML={{ __html: content || '' }} />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || ''}
            </ReactMarkdown>
          )}
        </article>
      </main>
    </div>
  );
}
