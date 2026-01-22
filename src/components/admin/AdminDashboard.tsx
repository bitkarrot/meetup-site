import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { NostrFilter } from '@nostrify/nostrify';

export default function AdminDashboard() {
  const { nostr } = useDefaultRelay();

  const { user } = useCurrentUser();
  const { data: blogPosts } = useQuery({
    queryKey: ['admin-blog-posts', user?.pubkey],
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const filters: NostrFilter[] = [{ kinds: [30023], limit: 50 }];
      
      if (user?.pubkey) {
        filters.push({ kinds: [31234], authors: [user.pubkey], limit: 20 });
      }

      const events = await nostr.query(filters, { signal });
      return events;
    },
    enabled: !!nostr,
  });

  // Fetch events (kind 31922/31923 - Calendar events)
  const { data: events } = useQuery({
    queryKey: ['admin-events'],
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const events = await nostr.query([
        { kinds: [31922, 31923], limit: 50 }
      ], { signal });
      return events;
    },
  });

  const stats = [
    {
      title: 'Blog Posts',
      value: blogPosts?.length || 0,
      icon: FileText,
      description: 'Published articles',
    },
    {
      title: 'Events',
      value: events?.length || 0,
      icon: Calendar,
      description: 'Scheduled meetups',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome to your meetup site admin panel. Here's an overview of your content.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Blog Posts */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Blog Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {blogPosts?.slice(0, 5).map((post) => {
                const tags = post.tags || [];
                let title = tags.find(([name]) => name === 'title')?.[1] || 'Untitled';
                let published = tags.find(([name]) => name === 'published')?.[1] === 'true' || !tags.find(([name]) => name === 'published');
                
                if (post.kind === 31234) {
                  published = false;
                  title = '[Private Draft]';
                  // Note: We're not decrypting here for simplicity in the dashboard list
                  // But we show that it is a private draft
                }

                return (
                  <div key={post.id} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(post.created_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        Kind {post.kind}
                      </Badge>
                      <Badge variant={published ? 'default' : 'secondary'}>
                        {published ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {(!blogPosts || blogPosts.length === 0) && (
                <p className="text-sm text-muted-foreground">No blog posts yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Events */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {events?.slice(0, 5).map((event) => {
                const tags = event.tags || [];
                const title = tags.find(([name]) => name === 'title')?.[1] || 'Untitled Event';
                const startTag = tags.find(([name]) => name === 'start')?.[1];
                const status = tags.find(([name]) => name === 'status')?.[1] || 'confirmed';
                
                let dateDisplay = 'No date';
                if (startTag) {
                  if (event.kind === 31922) {
                    // Date-based: YYYY-MM-DD
                    dateDisplay = new Date(startTag).toLocaleDateString();
                  } else {
                    // Time-based: unix timestamp
                    dateDisplay = new Date(parseInt(startTag) * 1000).toLocaleDateString();
                  }
                }
                
                return (
                  <div key={event.id} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dateDisplay}
                      </p>
                    </div>
                    <Badge variant={status === 'confirmed' ? 'default' : 'secondary'}>
                      {status}
                    </Badge>
                  </div>
                );
              })}
              {(!events || events.length === 0) && (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}