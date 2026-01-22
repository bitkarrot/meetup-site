import {} from 'react';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useQuery } from '@tanstack/react-query';
import Navigation from '@/components/Navigation';
import { Calendar, MapPin, Clock, ArrowRight, Edit } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Event {
  id: string;
  title: string;
  summary: string;
  location: string;
  start: number;
  end?: number;
  status: string;
  image?: string;
}

interface BlogPost {
  id: string;
  title: string;
  content: string;
  published: boolean;
  created_at: number;
  image?: string;
  pubkey: string;
}

function AuthorInfo({ pubkey }: { pubkey: string }) {
  const { data: author } = useAuthor(pubkey);
  
  let npub = '';
  try {
    if (pubkey && /^[0-9a-f]{64}$/.test(pubkey)) {
      npub = nip19.npubEncode(pubkey);
    }
  } catch (e) {
    console.error('Error encoding npub:', e);
  }

  return (
    <div className="flex items-center gap-2 mb-4">
      <Avatar className="h-6 w-6">
        <AvatarImage src={author?.metadata?.picture} />
        <AvatarFallback>{author?.metadata?.name?.charAt(0) || '?'}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        {npub ? (
          <a 
            href={`https://nostr.at/${npub}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium hover:underline"
          >
            {author?.metadata?.name || author?.metadata?.display_name || 'Anonymous'}
          </a>
        ) : (
          <span className="text-xs font-medium">
            {author?.metadata?.name || author?.metadata?.display_name || 'Anonymous'}
          </span>
        )}
      </div>
    </div>
  );
}

function HeroSection() {
  const { config } = useAppContext();
  
  const heroConfig = {
    heroTitle: config.siteConfig?.heroTitle || 'Welcome to Our Community',
    heroSubtitle: config.siteConfig?.heroSubtitle || 'Join us for amazing meetups and events',
    heroBackground: config.siteConfig?.heroBackground || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&h=1080&fit=crop'
  };

  return (
    <div className="relative h-[600px] overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${heroConfig.heroBackground}')` }}
      >
        <div className="absolute inset-0 bg-black/40" />
      </div>
      
      {/* Content */}
      <div className="relative isolate flex items-center justify-center h-full">
        <div className="text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            {heroConfig.heroTitle}
          </h1>
          <p className="text-xl sm:text-2xl text-white/90 mb-8 max-w-2xl mx-auto">
            {heroConfig.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg px-8 py-3" asChild>
              <Link to="/events">
                View Events
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-3 text-white border-white hover:bg-white hover:text-black" asChild>
              <Link to="/blog">
                Read Blog
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventsSection({ events }: { events: Event[] }) {
  const { config } = useAppContext();
  const showEvents = config.siteConfig?.showEvents !== false;
  const maxEvents = config.siteConfig?.maxEvents || 6;

  if (!showEvents) return null;

  const upcomingEvents = events
    .filter(event => event.end ? event.end * 1000 > Date.now() : event.start * 1000 > Date.now())
    .slice(0, maxEvents);

  return (
    <section className="py-16 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Upcoming Events</h2>
          <p className="text-lg text-muted-foreground">
            Join us for our next meetups and gatherings
          </p>
        </div>

        {upcomingEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingEvents.map((event) => (
              <Card key={event.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                {event.image && (
                  <div className="h-48 bg-cover bg-center" style={{ backgroundImage: `url('${event.image}')` }} />
                )}
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{event.title}</CardTitle>
                    <Badge variant={event.status === 'confirmed' ? 'default' : 'secondary'}>
                      {event.status}
                    </Badge>
                  </div>
                  {event.summary && (
                    <p className="text-sm text-muted-foreground">{event.summary}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(event.start * 1000).toLocaleDateString()}
                      {event.end && ` - ${new Date(event.end * 1000).toLocaleDateString()}`}
                    </div>
                    {event.start > 86400 && ( // Check if it's a time-based event
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {new Date(event.start * 1000).toLocaleTimeString()}
                      </div>
                    )}
                    {event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {event.location}
                      </div>
                    )}
                  </div>
                  <Button className="w-full mt-4" asChild>
                    <Link to={`/event/${event.id}`}>View Details</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No upcoming events</h3>
              <p className="text-muted-foreground">Check back soon for new events!</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center mt-12">
          <Button variant="outline" size="lg" asChild>
            <Link to="/events">View All Events</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function BlogSection({ posts }: { posts: BlogPost[] }) {
  const { config } = useAppContext();
  const showBlog = config.siteConfig?.showBlog !== false;
  const maxPosts = config.siteConfig?.maxBlogPosts || 3;

  if (!showBlog) return null;

  const publishedPosts = posts
    .filter(post => post.published)
    .slice(0, maxPosts);

  return (
    <section className="py-16 bg-muted/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Latest Blog Posts</h2>
          <p className="text-lg text-muted-foreground">
            Stay updated with our community news and insights
          </p>
        </div>

        {publishedPosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {publishedPosts.map((post) => (
              <Card key={post.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg line-clamp-2">{post.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {new Date(post.created_at * 1000).toLocaleDateString()}
                  </p>
                </CardHeader>
                <CardContent>
                  <AuthorInfo pubkey={post.pubkey} />
                  <div className="text-sm text-muted-foreground line-clamp-3 mb-4 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {post.content.slice(0, 150) + (post.content.length > 150 ? '...' : '')}
                    </ReactMarkdown>
                  </div>
                  <Button className="w-full" asChild>
                    <Link to={`/blog/${post.id}`}>Read More</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Edit className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No blog posts yet</h3>
              <p className="text-muted-foreground">Check back soon for new content!</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center mt-12">
          <Button variant="outline" size="lg" asChild>
            <Link to="/blog">View All Posts</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

const Index = () => {
  const { config } = useAppContext();
  const { nostr } = useDefaultRelay();
  
  // Fetch events
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', config.siteConfig?.defaultRelay, config.siteConfig?.adminRoles], 
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const eventList = await nostr.query([
        { kinds: [31922, 31923], limit: 50 }
      ], { signal });
      
      const adminRoles = config.siteConfig?.adminRoles || {};
      const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();

      return eventList
        .filter(event => {
          const authorPubkey = event.pubkey.toLowerCase().trim();
          // Always show if author is the master user
          if (authorPubkey === masterPubkey) return true;
          
          const role = adminRoles[authorPubkey];
          // Only show if author is a primary admin
          return role === 'primary';
        })
        .map(event => {
        const tags = event.tags || [];
        const startTag = tags.find(([name]) => name === 'start')?.[1] || '0';
        const endTag = tags.find(([name]) => name === 'end')?.[1];
        
        let start: number;
        let end: number | undefined;

        if (event.kind === 31922) {
          // Date-based: YYYY-MM-DD
          start = Math.floor(new Date(startTag).getTime() / 1000);
          end = endTag ? Math.floor(new Date(endTag).getTime() / 1000) : undefined;
        } else {
          // Time-based: unix timestamp
          start = parseInt(startTag);
          end = endTag ? parseInt(endTag) : undefined;
        }

        return {
          id: event.id,
          title: tags.find(([name]) => name === 'title')?.[1] || 'Untitled Event',
          summary: tags.find(([name]) => name === 'summary')?.[1] || '',
          location: tags.find(([name]) => name === 'location')?.[1] || '',
          start,
          end,
          status: tags.find(([name]) => name === 'status')?.[1] || 'confirmed',
          image: tags.find(([name]) => name === 'image')?.[1],
        };
      });
    },
  });

  // Fetch blog posts
  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['blog-posts', config.siteConfig?.defaultRelay, config.siteConfig?.adminRoles],
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const postList = await nostr.query([
        { kinds: [30023], limit: 50 }
      ], { signal });
      
      const adminRoles = config.siteConfig?.adminRoles || {};
      const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();

      return postList
        .filter(event => {
          const authorPubkey = event.pubkey.toLowerCase().trim();
          // Always show if author is the master user
          if (authorPubkey !== masterPubkey && adminRoles[authorPubkey] !== 'primary') return false;
          
          // Double check: don't show Kind 30023 if it's explicitly marked as NOT published
          const isPublished = event.tags.find(([name]) => name === 'published')?.[1] !== 'false';
          return isPublished;
        })
        .map(event => ({
        id: event.id,
        title: event.tags.find(([name]) => name === 'title')?.[1] || 'Untitled',
        content: event.content,
        published: event.tags.find(([name]) => name === 'published')?.[1] === 'true' || !event.tags.find(([name]) => name === 'published'),
        created_at: event.created_at,
        pubkey: event.pubkey,
      }));
    },
  });

  const siteTitle = config.siteConfig?.title || 'Community Meetup Site';

  useSeoMeta({
    title: siteTitle,
    description: config.siteConfig?.heroSubtitle || 'Join us for amazing meetups and events',
    ogImage: config.siteConfig?.ogImage,
    twitterImage: config.siteConfig?.ogImage,
  });

  if (eventsLoading || postsLoading) {
    return (
      <div className="min-h-screen">
        <HeroSection />
        <div className="py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation />
      <HeroSection />
      <EventsSection events={events} />
      <BlogSection posts={posts} />
    </div>
  );
};

export default Index;