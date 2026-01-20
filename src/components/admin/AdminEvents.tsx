import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Calendar, MapPin, Share2, Eye, Layout } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface MeetupEvent {
  id: string;
  title: string;
  summary: string;
  description: string;
  location: string;
  start: number;
  end?: number;
  kind: 31922 | 31923; // date-based or time-based
  status: string;
  d: string;
  image?: string;
  pubkey: string;
}

export default function AdminEvents() {
  const { nostr, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const [isCreating, setIsCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MeetupEvent | null>(null);
  const [eventType, setEventType] = useState<'date' | 'time'>('time');
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    description: '',
    location: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    image: '',
    status: 'confirmed',
  });

  // Initialize selected relays
  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  // Fetch events
  const { data: events, refetch } = useQuery({
    queryKey: ['admin-events'],
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const events = await nostr.query([
        { kinds: [31922, 31923], limit: 100 }
      ], { signal });
      
      return events.map(event => {
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
          description: event.content,
          location: tags.find(([name]) => name === 'location')?.[1] || '',
          start,
          end,
          kind: event.kind as 31922 | 31923,
          status: tags.find(([name]) => name === 'status')?.[1] || 'confirmed',
          d: tags.find(([name]) => name === 'd')?.[1] || event.id,
          image: tags.find(([name]) => name === 'image')?.[1],
          pubkey: event.pubkey,
        };
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim()) return;

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

      publishEvent({
        event: {
          kind: 31922,
          content: formData.description,
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

      publishEvent({
        event: {
          kind: 31923,
          content: formData.description,
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
      description: '',
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
    refetch();
  };

  const handleEdit = (event: MeetupEvent) => {
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
      description: event.description,
      location: event.location,
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
  };

  const handleDelete = (event: MeetupEvent) => {
    if (user && event.pubkey !== user.pubkey) {
      alert("You cannot delete another user's event.");
      return;
    }
    if (confirm('Are you sure you want to delete this event?')) {
      publishEvent({
        event: {
          kind: 5,
          content: '',
          tags: [['e', event.id]],
          created_at: Math.floor(Date.now() / 1000),
        },
        relays: selectedRelays,
      });
      refetch();
    }
  };

  const isEventPast = (event: MeetupEvent) => {
    return event.end ? event.end * 1000 < Date.now() : event.start * 1000 < Date.now();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Events</h2>
          <p className="text-muted-foreground">
            Manage meetup events and RSVPs.
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          New Event
        </Button>
      </div>

      {/* Create/Edit Form */}
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>{editingEvent ? 'Edit Event' : 'Create New Event'}</CardTitle>
          </CardHeader>
          <CardContent>
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
                <Input
                  id="image"
                  value={formData.image}
                  onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div>
                <Label htmlFor="description">Description (Markdown)</Label>
                <Tabs defaultValue="edit" className="mt-2">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="edit">
                      <Layout className="h-4 w-4 mr-2" />
                      Edit
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit" className="mt-2">
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Event details and description in Markdown..."
                      className="min-h-[200px] font-mono"
                      required
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="mt-2">
                    <div className="min-h-[200px] p-4 border rounded-md prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-slate-950 overflow-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {formData.description || "*Nothing to preview*"}
                      </ReactMarkdown>
                    </div>
                  </TabsContent>
                </Tabs>
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
                  onClick={() => {
                    setIsCreating(false);
                    setEditingEvent(null);
                    setFormData({
                      title: '',
                      summary: '',
                      description: '',
                      location: '',
                      startDate: '',
                      startTime: '',
                      endDate: '',
                      endTime: '',
                      image: '',
                      status: 'confirmed',
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Events List */}
      <div className="space-y-4">
        {events?.map((event) => (
          <Card key={event.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{event.title}</h3>
                    <Badge variant={isEventPast(event) ? 'secondary' : 'default'}>
                      {isEventPast(event) ? 'Past' : 'Upcoming'}
                    </Badge>
                    <Badge variant="outline">{event.status}</Badge>
                  </div>
                  
                  {event.summary && (
                    <p className="text-sm text-muted-foreground">{event.summary}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(event.start * 1000).toLocaleDateString()}
                      {event.kind === 31923 && (
                        <span>{new Date(event.start * 1000).toLocaleTimeString()}</span>
                      )}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </div>
                    )}
                  </div>
                  
                  {event.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {event.description.replace(/<[^>]*>/g, '').slice(0, 200)}...
                    </p>
                  )}
                </div>
                
                <div className="flex gap-2 ml-4">
                  {user && event.pubkey === user.pubkey && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(event)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(event)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {(!events || events.length === 0) && (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No events yet. Create your first event!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}