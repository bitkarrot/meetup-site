import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLoadingIndicator } from '@/components/PageLoadingIndicator';
import Navigation from '@/components/Navigation';
import EventRSVP from '@/components/EventRSVP';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { getMasterPubkey } from '@/lib/relay';
import { normalizeEvent, type UnifiedCalendarEvent } from '@/lib/calendarEvents';
import { fetchRoomDetails } from '@/hooks/useRooms';
import { useAppContext } from '@/hooks/useAppContext';
import { ArrowLeft, Calendar, MapPin, Clock, RefreshCw, Video } from 'lucide-react';
import { AuthorInfo } from '@/components/AuthorInfo';

type EventDetail = UnifiedCalendarEvent & {
  author: string;
  d: string;
  description: string;
};

export default function EventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { nostr, poolNostr } = useDefaultRelay();
  const { config } = useAppContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: event, isLoading, refetch } = useQuery({
    queryKey: ['event', eventId, config.siteConfig?.adminRoles],
    queryFn: async (): Promise<EventDetail | null> => {
      if (!eventId || !poolNostr) return null;

      const signal = AbortSignal.timeout(5000);
      const events = await nostr!.query([
        { ids: [eventId], limit: 1 }
      ], { signal });

      if (events.length === 0) return null;

      const e = events[0];

      const adminRoles = config.siteConfig?.adminRoles || {};
      const masterPubkey = getMasterPubkey();

      const authorPubkey = e.pubkey.toLowerCase().trim();
      if (authorPubkey !== masterPubkey && adminRoles[authorPubkey] !== 'publisher') return null;

      const tags = e.tags || [];
      const dTag = tags.find(([name]) => name === 'd')?.[1] || e.id;

      const fetchRoom = (coords: string) => fetchRoomDetails(coords, poolNostr as Parameters<typeof fetchRoomDetails>[1]);
      const normalizedEvent = await normalizeEvent(e, fetchRoom);

      const status = normalizedEvent.status || (tags.find(([name]) => name === 'status')?.[1] || 'confirmed');

      return {
        ...normalizedEvent,
        author: e.pubkey,
        d: dTag,
        description: e.content,
        status,
      } as EventDetail;
    },
    enabled: !!nostr && !!eventId,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Update SEO meta tags when event is loaded
  useSeoMeta({
    title: event ? `${event.title} - ${config.siteConfig?.title || 'Event'}` : 'Event',
    description: event?.summary || 'Event details and RSVP information',
    ogImage: event?.image || config.siteConfig?.ogImage,
    twitterImage: event?.image || config.siteConfig?.ogImage,
  });

  if (!eventId) {
    return <div>Event not found</div>;
  }

  if (isLoading) {
    return <PageLoadingIndicator />;
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Event Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The event you're looking for doesn't exist or has been deleted.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button asChild>
                <Link to="/events">Back to Events</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPast = event.type === 'live'
    ? (event.end ? event.end * 1000 < Date.now() : event.status === 'ended')
    : (event.end ? event.end * 1000 < Date.now() : event.start * 1000 < Date.now());

  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="py-8">
        <div className="max-w-4xl mx-auto px-4 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" asChild>
          <Link to="/events" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </Button>

        {/* Event Header */}
        <Card>
          {event.image && (
            <div className="h-64 bg-cover bg-center rounded-t-lg" style={{ backgroundImage: `url('${event.image}')` }} />
          )}
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <h1 className="text-3xl font-bold">{event.title}</h1>
                <AuthorInfo pubkey={event.author} size="lg" showNpub={true} className="flex items-center gap-3 py-2" />
                {event.summary && (
                  <p className="text-lg text-muted-foreground">{event.summary}</p>
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <Badge variant={isPast ? 'secondary' : 'default'}>
                  {isPast ? 'Past Event' : 'Upcoming'}
                </Badge>
                <Badge variant="outline">{event.status}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{new Date(event.start * 1000).toLocaleDateString()}</span>
                {event.end && (
                  <span>- {new Date(event.end * 1000).toLocaleDateString()}</span>
                )}
              </div>
              {(event.kind === 31923 || event.type === 'live') && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{new Date(event.start * 1000).toLocaleTimeString()}</span>
                  {event.end && (
                    <span>- {new Date(event.end * 1000).toLocaleTimeString()}</span>
                  )}
                </div>
              )}
              {event.type === 'calendar' && event.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.type === 'live' && event.room && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Video className="h-4 w-4" />
                  <span>{event.room.name}</span>
                  {event.room.serviceUrl && (
                    <a
                      href={event.room.serviceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline text-xs"
                    >
                      (Join Room)
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Event Description */}
            {event.description && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {event.description}
                </ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RSVP Section */}
        <EventRSVP event={event} />
      </div>
    </div>
  </div>
);
}