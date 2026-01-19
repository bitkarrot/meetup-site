import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Navigation from '@/components/Navigation';
import EventRSVP from '@/components/EventRSVP';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { ArrowLeft, Calendar, MapPin, Clock } from 'lucide-react';

export default function EventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { nostr } = useDefaultRelay();

  // Move useSeoMeta to top level but only use when we have data
  useSeoMeta({
    title: eventId ? 'Event' : 'Event Not Found',
    description: 'Event details and RSVP information',
  });

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      
      const signal = AbortSignal.timeout(2000);
      const events = await nostr.query([
        { ids: [eventId], limit: 1 }
      ], { signal });
      
      if (events.length === 0) return null;
      
      const e = events[0];
      const tags = e.tags || [];
      const startTag = tags.find(([name]) => name === 'start')?.[1] || '0';
      const endTag = tags.find(([name]) => name === 'end')?.[1];
      
      let start: number;
      let end: number | undefined;

      if (e.kind === 31922) {
        // Date-based: YYYY-MM-DD
        start = Math.floor(new Date(startTag).getTime() / 1000);
        end = endTag ? Math.floor(new Date(endTag).getTime() / 1000) : undefined;
      } else {
        // Time-based: unix timestamp
        start = parseInt(startTag);
        end = endTag ? parseInt(endTag) : undefined;
      }

      return {
        id: e.id,
        author: e.pubkey,
        d: tags.find(([name]) => name === 'd')?.[1] || e.id,
        title: tags.find(([name]) => name === 'title')?.[1] || 'Untitled Event',
        summary: tags.find(([name]) => name === 'summary')?.[1] || '',
        description: e.content,
        location: tags.find(([name]) => name === 'location')?.[1] || '',
        start,
        end,
        status: tags.find(([name]) => name === 'status')?.[1] || 'confirmed',
        image: tags.find(([name]) => name === 'image')?.[1] || '',
        kind: e.kind,
      };
    },
    enabled: !!eventId,
  });

  if (!eventId) {
    return <div>Event not found</div>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
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
            <Button asChild>
              <Link to="/events">Back to Events</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPast = event.end ? event.end * 1000 < Date.now() : event.start * 1000 < Date.now();

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
              {event.kind === 31923 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{new Date(event.start * 1000).toLocaleTimeString()}</span>
                  {event.end && (
                    <span>- {new Date(event.end * 1000).toLocaleTimeString()}</span>
                  )}
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{event.location}</span>
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