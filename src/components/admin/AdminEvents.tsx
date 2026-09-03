import { useState, useEffect } from 'react';
import { NUser } from '@nostrify/react/login';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useAuthor } from '@/hooks/useAuthor';
import { parseCalendarEventStartEnd } from '@/lib/eventTime';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Calendar, MapPin, Share2, ExternalLink, Library, Filter, RefreshCw, Repeat, Clock, MessageSquare, List, LayoutGrid } from 'lucide-react';
import { MediaSelectorDialog } from './MediaSelectorDialog';
import { ExpandableSearch } from './ExpandableSearch';
import { RepostDialog } from './RepostDialog';
import { ShareAsNoteDialog } from './ShareAsNoteDialog';
import { CreateEventDialog } from './CreateEventDialog';
import { AuthorInfo } from '@/components/AuthorInfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { CalendarGrid } from './CalendarGrid';
import { CalendarErrorBoundary } from '@/components/CalendarErrorBoundary';
import type { UnifiedCalendarEvent, RoomDetails } from '@/lib/calendarEvents';
import { parseRoomEvent } from '@/lib/roomEvents';

type AdminEvent = UnifiedCalendarEvent & { d: string; roomServiceUrl?: string; status: string; location?: string; room?: RoomDetails };

function EventCard({ event, user, usernameSearch, onEdit, onDelete, relayUrl, publishRelays }: {
  event: AdminEvent;
  user: NUser | undefined;
  usernameSearch: string;
  onEdit: (event: AdminEvent) => void;
  onDelete: (event: AdminEvent) => void;
  relayUrl: string;
  publishRelays: string[];
}) {
  const { data: author } = useAuthor(event.pubkey);
  const [repostOpen, setRepostOpen] = useState(false);
  const [shareNoteOpen, setShareNoteOpen] = useState(false);

  // Filter by username search
  if (usernameSearch.trim()) {
    const username = author?.metadata?.name || author?.metadata?.display_name || '';
    if (!username.toLowerCase().includes(usernameSearch.toLowerCase())) {
      return null;
    }
  }

  const isEventPast = event.end ? event.end * 1000 < Date.now() : event.start * 1000 < Date.now();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold break-words">{event.title}</h3>
              <Badge variant="outline" className="text-[10px] font-mono shrink-0">Kind {event.kind}</Badge>
              <Badge variant={isEventPast ? 'secondary' : 'default'} className="shrink-0">
                {isEventPast ? 'Past' : 'Upcoming'}
              </Badge>
              <Badge variant="outline" className="shrink-0">{event.status}</Badge>
            </div>

            {event.summary && (
              <p className="text-sm text-muted-foreground break-words">{event.summary}</p>
            )}

            <AuthorInfo pubkey={event.pubkey} className="flex items-center gap-2 my-2" />

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(event.start * 1000).toLocaleDateString()}
                {(event.kind === 31923 || event.kind === 30313) && (
                  <span>{new Date(event.start * 1000).toLocaleTimeString()}</span>
                )}
              </div>
              {event.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {event.location}
                </div>
              )}
              {event.roomServiceUrl && (
                <div className="flex items-center gap-1">
                  <Library className="h-3 w-3" />
                  <a href={event.roomServiceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    Room
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 ml-4 flex-wrap shrink-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/event/${event.id}`} title="View public event">
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRepostOpen(true)} title="Schedule repost">
              <Repeat className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShareNoteOpen(true)} title="Share as note">
              <MessageSquare className="h-4 w-4" />
            </Button>
            {user && event.pubkey === user.pubkey && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onEdit(event)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(event)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>

      {/* Repost dialog */}
      {repostOpen && (
        <RepostDialog
          open={repostOpen}
          onOpenChange={setRepostOpen}
          target={{
            id: event.id,
            pubkey: event.pubkey,
            kind: event.kind,
            content: event.description || event.summary,
            tags: [
              ['title', event.title],
              ['d', event.d],
              ...(event.image ? [['image', event.image] as [string, string]] : []),
              ...(event.location ? [['location', event.location] as [string, string]] : []),
              ...(event.status ? [['status', event.status] as [string, string]] : []),
            ],
            created_at: event.start,
            d: event.d,
            sig: event.sig || '',
          }}
          relayUrl={relayUrl}
          publishRelays={publishRelays}
          thumbnailUrl={event.image}
          previewTitle={event.title}
        />
      )}

      {/* Share as note dialog */}
      {shareNoteOpen && (
        <ShareAsNoteDialog
          open={shareNoteOpen}
          onOpenChange={setShareNoteOpen}
          target={{
            id: event.id,
            pubkey: event.pubkey,
            kind: event.kind,
            title: event.title,
            summary: event.summary,
            d: event.d,
            room: event.room,
          }}
          relayUrl={relayUrl}
          publishRelays={publishRelays}
        />
      )}
    </Card>
  );
}

export default function AdminEvents() {
  const { nostr, defaultRelayUrl, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const publishEvent = useNostrPublish();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null);
  const [eventType, setEventType] = useState<'date' | 'time'>('time');
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [usernameSearch, setUsernameSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterByNostrJson, setFilterByNostrJson] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    location: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    image: '',
    status: 'confirmed',
  });
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [showCreateEventDialog, setShowCreateEventDialog] = useState(false);

  // Initialize selected relays
  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  // Fetch events
  const { data: allEvents, refetch } = useQuery<AdminEvent[]>({
    queryKey: ['admin-events-list'],
    queryFn: async () => {
      if (!nostr) {
        console.error('[AdminEvents] nostr is null - relay connection failed');
        return [];
      }

      const signal = AbortSignal.timeout(10000);

      // Query from default relay only
      // This is the same relay we publish to
      let events;
      try {
        events = await nostr.query([
          { kinds: [31922, 31923, 30312, 30313], limit: 100 }
        ], { signal });
      } catch (error) {
        console.error('[AdminEvents] Query failed:', error);
        return [];
      }

      // Build a room lookup from any 30312 room events in the response
      const roomMap = new Map<string, ReturnType<typeof parseRoomEvent>>();
      for (const event of events) {
        if (event.kind === 30312) {
          const room = parseRoomEvent(event);
          const dTag = event.tags.find(([name]) => name === 'd')?.[1] || event.id;
          const coords = `30312:${event.pubkey}:${dTag}`;
          roomMap.set(coords, room);
        }
      }

      const normalizedEvents = events.map((event): AdminEvent | null => {
        const tags = event.tags || [];

        if (event.kind === 30312) {
          // NIP-53 room event - skip display (room definitions, not events)
          return null;
        }

        if (event.kind === 30313) {
          // NIP-53 live event
          const startTag = tags.find(([name]) => name === 'starts')?.[1] || '0';
          const endTag = tags.find(([name]) => name === 'ends')?.[1];
          const aTag = tags.find(([name]) => name === 'a')?.[1];
          const dTag = tags.find(([name]) => name === 'd')?.[1] || event.id;
          const status = (tags.find(([name]) => name === 'status')?.[1] || 'planned') as 'planned' | 'live' | 'ended';

          const room = aTag ? roomMap.get(aTag) : undefined;
          const serviceUrl = room?.serviceUrl || tags.find(([name]) => name === 'service')?.[1] || '';
          const roomName = room?.name || (serviceUrl ? (() => { try { return new URL(serviceUrl).hostname; } catch { return 'Live Room'; } })() : 'Live Room');

          return {
            id: event.id,
            pubkey: event.pubkey,
            kind: 30313,
            type: 'live',
            title: tags.find(([name]) => name === 'title')?.[1] || 'Untitled Event',
            summary: tags.find(([name]) => name === 'summary')?.[1] || '',
            image: tags.find(([name]) => name === 'image')?.[1],
            start: Number(startTag),
            end: endTag ? Number(endTag) : undefined,
            timezone: tags.find(([name]) => name === 'start_tzid')?.[1],
            status,
            room: {
              id: room?.id || '',
              pubkey: room?.pubkey,
              name: roomName,
              serviceUrl,
              status: 'closed',
            },
            tags,
            created_at: event.created_at,
            d: dTag,
            roomServiceUrl: serviceUrl,
            location: '',
          } as AdminEvent;
        }

        // NIP-52 calendar event
        const startTag = tags.find(([name]) => name === 'start')?.[1] || '0';
        const endTag = tags.find(([name]) => name === 'end')?.[1];
        const { start, end } = parseCalendarEventStartEnd(
          event.kind,
          startTag,
          endTag,
          event.created_at,
        );
        const dTag = tags.find(([name]) => name === 'd')?.[1] || event.id;

        return {
          id: event.id,
          pubkey: event.pubkey,
          kind: event.kind as 31922 | 31923,
          type: 'calendar',
          title: tags.find(([name]) => name === 'title')?.[1] || 'Untitled Event',
          summary: tags.find(([name]) => name === 'summary')?.[1] || '',
          image: tags.find(([name]) => name === 'image')?.[1],
          location: tags.find(([name]) => name === 'location')?.[1] || '',
          start,
          end,
          timezone: undefined,
          tags,
          created_at: event.created_at,
          status: tags.find(([name]) => name === 'status')?.[1] || 'confirmed',
          d: dTag,
        } as AdminEvent;
      });

      return normalizedEvents.filter((event): event is AdminEvent =>
        // Deduplicate by event ID and filter out nulls
        event !== null && normalizedEvents.findIndex(e => e && e.id === event.id) === normalizedEvents.indexOf(event)
      );
    },
    enabled: !!nostr,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter events based on nostr.json users
  // TEMPORARILY DISABLED FOR DEBUGGING
  const events = allEvents;

  // Apply time filter (past/upcoming/all)
  const filteredByTime = allEvents?.filter(event => {
    if (timeFilter === 'all') return true;
    const isPast = event.end ? event.end * 1000 < Date.now() : event.start * 1000 < Date.now();
    return timeFilter === 'past' ? isPast : !isPast;
  }) ?? [];

  // Check if form is dirty
  const isDirty = editingEvent
    ? (formData.title !== editingEvent.title ||
      formData.summary !== editingEvent.summary ||
      formData.location !== editingEvent.location ||
      formData.status !== editingEvent.status)
    : (formData.title.trim() !== '' || formData.summary.trim() !== '');

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isCreating && isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isCreating, isDirty]);

  const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      return;
    }
    setIsCreating(false);
    setEditingEvent(null);
    setFormData({
      title: '',
      summary: '',
      location: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      image: '',
      status: 'confirmed',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim()) return;

    try {
      if (eventType === 'date') {
      // Date-based event (kind 31922)
      // NIP-52: start/end tags must be in ISO 8601 format (YYYY-MM-DD)
      const startDateStr = formData.startDate; // Already in YYYY-MM-DD from input type="date"
      const endDateStr = formData.endDate || null;

      const tags = [
        ['d', editingEvent?.d || `event-${Date.now()}`],
        ['title', formData.title],
        ['start', startDateStr],
        ['status', formData.status],
        ['alt', `Calendar event: ${formData.title}`],
      ];

      if (formData.summary.trim()) {
        tags.push(['summary', formData.summary]);
      }

      if (formData.location.trim()) {
        tags.push(['location', formData.location]);
      }

      if (endDateStr) {
        tags.push(['end', endDateStr]);
      }

      if (formData.image.trim()) {
        tags.push(['image', formData.image]);
      }

      await publishEvent.mutateAsync({
        event: {
          kind: 31922,
          content: '',
          tags,
          created_at: Math.floor(Date.now() / 1000),
        },
        relays: selectedRelays,
      });
    } else {
      // Time-based event (kind 31923)
      const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
      const startTimestamp = Math.floor(startDateTime.getTime() / 1000);
      let endTimestamp: number | undefined;

      if (formData.endDate && formData.endTime) {
        const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
        endTimestamp = Math.floor(endDateTime.getTime() / 1000);
      }

      const tags = [
        ['d', editingEvent?.d || `event-${Date.now()}`],
        ['title', formData.title],
        ['start', startTimestamp.toString()],
        ['status', formData.status],
        ['alt', `Calendar event: ${formData.title}`],
      ];

      if (formData.summary.trim()) {
        tags.push(['summary', formData.summary]);
      }

      if (formData.location.trim()) {
        tags.push(['location', formData.location]);
      }

      if (endTimestamp) {
        tags.push(['end', endTimestamp.toString()]);
      }

      if (formData.image.trim()) {
        tags.push(['image', formData.image]);
      }

      await publishEvent.mutateAsync({
        event: {
          kind: 31923,
          content: '',
          tags,
          created_at: Math.floor(Date.now() / 1000),
        },
        relays: selectedRelays,
      });
    }

    // Reset form
    setFormData({
      title: '',
      summary: '',
      location: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      image: '',
      status: 'confirmed',
    });
    setIsCreating(false);
    setEditingEvent(null);

    await refetch();
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
  } catch (error) {
    console.error('Failed to save event:', error);
  }
  };

  const handleEdit = (event: AdminEvent) => {
    if (user && event.pubkey !== user.pubkey) {
      alert("You cannot edit another user's event.");
      return;
    }
    let startDate: Date;
    let endDate: Date | null = null;

    if (event.kind === 31922) {
      // For date-based events, we stored the timestamp in the local state 'start'
      // but we need to recover the original date string from the event tags if possible,
      // or just use the timestamp we have.
      startDate = new Date(event.start * 1000);
      if (event.end) endDate = new Date(event.end * 1000);
    } else {
      startDate = new Date(event.start * 1000);
      if (event.end) endDate = new Date(event.end * 1000);
    }

    setFormData({
      title: event.title,
      summary: event.summary,
      location: event.location || '',
      startDate: startDate.toISOString().split('T')[0],
      startTime: startDate.toTimeString().slice(0, 5),
      endDate: endDate ? endDate.toISOString().split('T')[0] : '',
      endTime: endDate ? endDate.toTimeString().slice(0, 5) : '',
      image: event.image || '',
      status: event.status,
    });
    setEventType(event.kind === 31922 ? 'date' : 'time');
    setEditingEvent(event);
    setIsCreating(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = (event: AdminEvent) => {
    if (user && event.pubkey !== user.pubkey) {
      alert("You cannot delete another user's event.");
      return;
    }
    if (confirm('Are you sure you want to delete this event?')) {
      const relays = selectedRelays.length > 0 ? selectedRelays : initialPublishRelays;

      // Delete the event, then refetch after it's published
      publishEvent.mutate(
        {
          event: {
            kind: 5,
            content: '',
            tags: [['e', event.id]],
            created_at: Math.floor(Date.now() / 1000),
          },
          relays,
        },
        {
          onSuccess: () => {
            refetch();
          },
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      {isCreating ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              {editingEvent ? 'Edit Event' : 'Create New Event'}
            </h2>
            <Button variant="outline" onClick={handleCancel}>
              Back to List
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="eventType">Event Type</Label>
                  <Select value={eventType} onValueChange={(value: 'date' | 'time') => setEventType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time">Time-based Event</SelectItem>
                      <SelectItem value="date">Date-based Event (All day)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter event title..."
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="summary">Summary</Label>
                  <Input
                    id="summary"
                    value={formData.summary}
                    onChange={(e) => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                    placeholder="Brief description..."
                  />
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Event location or meeting link..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                      required
                    />
                  </div>
                  {eventType === 'time' && (
                    <div>
                      <Label htmlFor="startTime">Start Time</Label>
                      <Input
                        id="startTime"
                        type="time"
                        value={formData.startTime}
                        onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="endDate">End Date (optional)</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                  {eventType === 'time' && (
                    <div>
                      <Label htmlFor="endTime">End Time (optional)</Label>
                      <Input
                        id="endTime"
                        type="time"
                        value={formData.endTime}
                        onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="image">Image URL (optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="image"
                      value={formData.image}
                      onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowMediaSelector(true)}
                      title="Select from Media Library"
                    >
                      <Library className="h-4 w-4 mr-2" />
                      Media Library
                    </Button>
                  </div>
                  <MediaSelectorDialog
                    open={showMediaSelector}
                    onOpenChange={setShowMediaSelector}
                    onSelect={(url) => {
                      setFormData(prev => ({ ...prev, image: url }));
                      setShowMediaSelector(false);
                    }}
                    title="Select Event Image"
                  />

                  {formData.image && (
                    <div className="mt-4 relative group aspect-video w-full max-w-md overflow-hidden rounded-lg border bg-muted">
                      <img
                        src={formData.image}
                        alt="Event preview"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x225?text=Invalid+Image+URL';
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Relay Selection */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Share2 className="h-4 w-4" />
                    Publishing Relays
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {initialPublishRelays.map((relay) => (
                      <div key={relay} className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md border">
                        <Checkbox
                          id={`relay-${relay}`}
                          checked={selectedRelays.includes(relay)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRelays(prev => [...prev, relay]);
                            } else {
                              setSelectedRelays(prev => prev.filter(r => r !== relay));
                            }
                          }}
                        />
                        <label
                          htmlFor={`relay-${relay}`}
                          className="text-xs font-mono truncate cursor-pointer flex-1"
                          title={relay}
                        >
                          {relay.replace('wss://', '').replace('ws://', '')}
                        </label>
                      </div>
                    ))}
                    {initialPublishRelays.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No publishing relays configured.</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit">
                    {editingEvent ? 'Update Event' : 'Create Event'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Events</h2>
              <p className="text-muted-foreground">
                Manage events and RSVPs.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ExpandableSearch
                value={usernameSearch}
                onChange={setUsernameSearch}
                placeholder="Search by username..."
                open={searchOpen}
                onOpenChange={setSearchOpen}
              />
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4 mr-2" />
                  List
                </Button>
                <Button
                  variant={viewMode === 'calendar' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('calendar')}
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Calendar
                </Button>
                <Button onClick={() => setShowCreateEventDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Event
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="filter-nostr-json-events"
                checked={filterByNostrJson}
                onCheckedChange={setFilterByNostrJson}
              />
              <Label htmlFor="filter-nostr-json-events" className="text-sm cursor-pointer flex items-center gap-2">
                <Filter className="h-3 w-3" />
                Show only users from nostr.json
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm flex items-center gap-2">
                <Clock className="h-3 w-3" />
                Time:
              </Label>
              <Button
                variant={timeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('all')}
              >
                All
              </Button>
              <Button
                variant={timeFilter === 'upcoming' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('upcoming')}
              >
                Upcoming
              </Button>
              <Button
                variant={timeFilter === 'past' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('past')}
              >
                Past
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {viewMode === 'calendar' ? (
              <CalendarErrorBoundary onRetry={refetch}>
                <CalendarGrid
                  events={filteredByTime}
                  viewMode="month"
                  onEventClick={(event) => handleEdit(event as AdminEvent)}
                />
              </CalendarErrorBoundary>
            ) : (
              <div className="space-y-4">
                {filteredByTime.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    user={user}
                    usernameSearch={usernameSearch}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    relayUrl={defaultRelayUrl || ''}
                    publishRelays={initialPublishRelays}
                  />
                ))}
              </div>
            )}

            {(!events || events.length === 0) && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">No events yet. Create your first event!</p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      <CreateEventDialog
        open={showCreateEventDialog}
        onOpenChange={setShowCreateEventDialog}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
        }}
      />
    </div>
  );
}