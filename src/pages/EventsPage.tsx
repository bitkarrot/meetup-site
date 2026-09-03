import { useState, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLoadingIndicator } from '@/components/PageLoadingIndicator';
import { useCalendarEvents, type EventFilter } from '@/hooks/useCalendarEvents';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getMasterPubkey } from '@/lib/relay';
import Navigation from '@/components/Navigation';
import { Calendar, MapPin, Clock, Search, Filter, RefreshCw, Video, Calendar as CalendarIcon, LayoutGrid } from 'lucide-react';
import { AuthorInfo } from '@/components/AuthorInfo';
import { isEventUpcoming, isEventPast } from '@/lib/calendarEvents';
import { CalendarGrid } from '@/components/admin/CalendarGrid';
import { CalendarErrorBoundary } from '@/components/CalendarErrorBoundary';

const typeFilterOptions = [
  { value: 'all' as const, label: 'All Events' },
  { value: 'calendar' as const, label: 'Calendar Events' },
  { value: 'live' as const, label: 'Live/Online Events' },
];

const timeFilterOptions = [
  { value: 'all', label: 'All Time' },
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
  const { user } = useCurrentUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<EventFilter>('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [sort, setSort] = useState('date-asc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const masterPubkey = getMasterPubkey();
  // Fallback to user's pubkey if masterPubkey is undefined
  const pubkeyToQuery = masterPubkey || user?.pubkey;

  const { data: events = [], isLoading, refetch } = useCalendarEvents(
    pubkeyToQuery,
    typeFilter,
  );

  // Debounce search input
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter and sort events
  const filteredEvents = events
    .filter(event => {
      // Search filter (debounced)
      const matchesSearch = debouncedSearchTerm === '' ||
        event.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        event.summary.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (event.type === 'calendar' && event.location?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        (event.type === 'live' && event.room.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));

      // Time filter
      const matchesTimeFilter =
        timeFilter === 'all' ||
        (timeFilter === 'upcoming' && isEventUpcoming(event)) ||
        (timeFilter === 'past' && isEventPast(event));

      return matchesSearch && matchesTimeFilter;
    })
    .sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.start - b.start;
        case 'date-desc':
          return b.start - a.start;
        case 'created-desc':
          return b.created_at - a.created_at;
        default:
          return 0;
      }
    });

  const siteTitle = appContext.siteConfig?.title || 'Community Meetup';
  const pageTitle = `Events - ${siteTitle}`;
  const pageDescription = 'Browse upcoming and past community events and meetups.';
  const previewImage = appContext.siteConfig?.ogImage;

  useSeoMeta({
    title: pageTitle,
    description: pageDescription,
    ogTitle: pageTitle,
    ogDescription: pageDescription,
    ogType: 'website',
    ogImage: previewImage,
    twitterCard: 'summary_large_image',
    twitterTitle: pageTitle,
    twitterDescription: pageDescription,
    twitterImage: previewImage,
  });

  if (isLoading) {
    return <PageLoadingIndicator />;
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
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Events
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Grid View
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                onClick={() => setViewMode('list')}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                List View
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as EventFilter)}>
                    <SelectTrigger className="w-[160px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typeFilterOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger className="w-[140px]">
                      <Clock className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeFilterOptions.map(option => (
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

          {/* Events Display */}
          {filteredEvents.length > 0 ? (
            viewMode === 'grid' ? (
              <CalendarErrorBoundary onRetry={refetch}>
                <CalendarGrid
                  events={filteredEvents}
                  onEventClick={(event) => {
                    // Navigate to event details
                    window.location.href = `/event/${event.id}`;
                  }}
                />
              </CalendarErrorBoundary>
            ) : (
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
                          {/* Type badge */}
                          <Badge variant={event.type === 'calendar' ? 'default' : 'secondary'} className="text-xs">
                            {event.type === 'calendar' ? (
                              <>
                                <CalendarIcon className="h-3 w-3 mr-1" />
                                Calendar
                              </>
                            ) : (
                              <>
                                <Video className="h-3 w-3 mr-1" />
                                Live
                              </>
                            )}
                          </Badge>
                          {/* Live status badge for live events */}
                          {event.type === 'live' && event.status === 'live' && (
                            <Badge variant="destructive" className="text-xs animate-pulse">
                              LIVE NOW
                            </Badge>
                          )}
                          {/* Past badge */}
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
                        {/* Time for time-based events */}
                        {(event.kind === 31923 || event.type === 'live') && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {new Date(event.start * 1000).toLocaleTimeString()}
                          </div>
                        )}
                        {/* Location for calendar events */}
                        {event.type === 'calendar' && event.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {event.location}
                          </div>
                        )}
                        {/* Room for live events */}
                        {event.type === 'live' && (
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            {event.room.name}
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
                      <Button className="w-full" asChild>
                        <Link to={`/event/${event.id}`}>View Details</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No events found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || typeFilter !== 'all' || timeFilter !== 'all'
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