import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useAppContext } from '@/hooks/useAppContext';
import Navigation from '@/components/Navigation';
import { Calendar, MapPin, Clock, Search, Filter } from 'lucide-react';
import { AuthorInfo } from '@/components/AuthorInfo';

interface Event {
  id: string;
  title: string;
  summary: string;
  location: string;
  start: number;
  end?: number;
  kind: 31922 | 31923;
  status: string;
  image?: string;
  pubkey: string;
}

const filterOptions = [
  { value: 'all', label: 'All Events' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

const sortOptions = [
  { value: 'date-asc', label: 'Date (Earliest First)' },
  { value: 'date-desc', label: 'Date (Latest First)' },
  { value: 'created-desc', label: 'Created (Newest First)' },
];

export default function EventsPage() {
  const { config: appContext } = useAppContext();
  const { nostr } = useDefaultRelay();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('upcoming');
  const [sort, setSort] = useState('date-asc');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', appContext.siteConfig?.adminRoles],
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const eventList = await nostr.query([
        { kinds: [31922, 31923], limit: 100 }
      ], { signal });
      
      const adminRoles = appContext.siteConfig?.adminRoles || {};
      const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();

      return eventList
        .filter(event => {
          const authorPubkey = event.pubkey.toLowerCase().trim();
          if (authorPubkey === masterPubkey) return true;
          return adminRoles[authorPubkey] === 'primary';
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
          kind: event.kind as 31922 | 31923,
          status: tags.find(([name]) => name === 'status')?.[1] || 'confirmed',
          image: tags.find(([name]) => name === 'image')?.[1],
          pubkey: event.pubkey,
          created_at: event.created_at,
        };
      });
    },
  });

  // Filter and sort events
  const filteredEvents = events
    .filter(event => {
      const matchesSearch = searchTerm === '' || 
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(searchTerm.toLowerCase());

      const now = Date.now() / 1000;
      const isPast = event.end ? event.end < now : event.start < now;
      
      const matchesFilter = 
        filter === 'all' ||
        (filter === 'upcoming' && !isPast) ||
        (filter === 'past' && isPast);

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.start - b.start;
        case 'date-desc':
          return b.start - a.start;
        case 'created-desc':
          return (b.created_at || 0) - (a.created_at || 0);
        default:
          return 0;
      }
    });

  const isEventPast = (event: Event) => {
    const now = Date.now();
    return event.end ? event.end * 1000 < now : event.start * 1000 < now;
  };

  const siteTitle = appContext.siteConfig?.title || 'Community Meetup';

  useSeoMeta({
    title: `Events - ${siteTitle}`,
    description: 'Browse upcoming and past community events and meetups.',
    ogImage: appContext.siteConfig?.ogImage,
    twitterImage: appContext.siteConfig?.ogImage,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="py-8">
          <div className="max-w-6xl mx-auto px-4 space-y-6">
            <div className="h-8 bg-muted rounded animate-pulse" />
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
      <div className="py-8">
        <div className="max-w-6xl mx-auto px-4 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Events</h1>
            <p className="text-lg text-muted-foreground">
              Discover and join community meetups and events
            </p>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search events..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-[140px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filterOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events Grid */}
          {filteredEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((event) => (
                <Card key={event.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  {event.image && (
                    <div className="h-48 bg-cover bg-center" style={{ backgroundImage: `url('${event.image}')` }} />
                  )}
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg line-clamp-2">{event.title}</CardTitle>
                      <div className="flex flex-col gap-1 ml-2">
                        <Badge variant={event.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs">
                          {event.status}
                        </Badge>
                        {isEventPast(event) && (
                          <Badge variant="outline" className="text-xs">Past</Badge>
                        )}
                      </div>
                    </div>
                    {event.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{event.summary}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <AuthorInfo pubkey={event.pubkey} />
                    <div className="space-y-2 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {new Date(event.start * 1000).toLocaleDateString()}
                        {event.end && ` - ${new Date(event.end * 1000).toLocaleDateString()}`}
                      </div>
                      {event.kind === 31923 && (
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
                    <Button className="w-full" asChild>
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
                <h3 className="text-lg font-semibold mb-2">No events found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || filter !== 'all' 
                    ? 'Try adjusting your search or filters.'
                    : 'No events have been created yet.'
                  }
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}