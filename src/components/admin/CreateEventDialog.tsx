/**
 * Unified event creation dialog.
 *
 * Supports both NIP-52 calendar events (31922/31923) and NIP-53 live events (30313).
 * Room selector for live events, text location for calendar events.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar, Video, Library, Trash2, Plus } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useUserRoomEvents } from '@/hooks/useRooms';
import { generateRoomId } from '@/lib/roomEvents';
import { MediaSelectorDialog } from './MediaSelectorDialog';
import { getDefaultRelayUrl } from '@/lib/relay';

// Default relay to include alongside configured publish relays (env-driven)
const DEFAULT_RELAY = getDefaultRelayUrl();

// Hivetalk relays for NIP-53 interoperability
// Note: These are not accessible from browser due to network/firewall issues
// but we still publish to them for server-side interoperability
const HIVETALK_RELAYS = ['wss://hivetalk.nostr1.com', 'wss://honey.nostr1.com', 'wss://relay.hivetalk.org'];

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface EventFormData {
  title: string;
  summary: string;
  description: string;
  image: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  roomServiceUrl: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export function CreateEventDialog({ open, onOpenChange, onSuccess }: CreateEventDialogProps) {
  const { user } = useCurrentUser();
  const publishEvent = useNostrPublish();
  const { publishRelays } = useDefaultRelay();
  const { data: userRooms = [], isLoading: roomsLoading } = useUserRoomEvents(user?.pubkey);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [isLiveEvent, setIsLiveEvent] = useState(true);
  const [roomSelectionMode, setRoomSelectionMode] = useState<'existing' | 'custom'>('custom');

  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    summary: '',
    description: '',
    image: '',
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endDate: '',
    endTime: '',
    location: '',
    roomServiceUrl: '',
    status: 'confirmed',
  });

  // Auto-set end date/time to 1h after start when start changes
  const handleStartDateTimeChange = (field: 'startDate' | 'startTime', value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      // If start date/time is set and end is not set, default to 1h later
      if (updated.startDate && updated.startTime && (!updated.endDate || !updated.endTime)) {
        const startDateTime = new Date(`${updated.startDate}T${updated.startTime}`);
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // +1 hour
        updated.endDate = endDateTime.toISOString().split('T')[0];
        updated.endTime = endDateTime.toTimeString().slice(0, 5);
      }

      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!user || !formData.title.trim()) return;

    // Validation for live events
    if (isLiveEvent && !formData.roomServiceUrl.trim()) {
      alert('Please enter the Service URL for live events');
      return;
    }

    setIsSubmitting(true);
    try {
      // Determine event type based on toggle
      if (isLiveEvent) {
        // Create live event (kind 30313) - requires a 30312 room event first
        const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
        const startTimestamp = Math.floor(startDateTime.getTime() / 1000);
        let endTimestamp: number | undefined;

        if (formData.endDate && formData.endTime) {
          const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
          endTimestamp = Math.floor(endDateTime.getTime() / 1000);
        }

        // Generate room ID from title
        const roomId = generateRoomId(formData.title);

        const relaysToUse = [...publishRelays, DEFAULT_RELAY, ...HIVETALK_RELAYS];

        // First, create a 30312 room event (required for NIP-53 interoperability)
        const roomTags = [
          ['d', roomId],
          ['room', formData.title],
          ['summary', formData.summary],
          ['status', 'open'],
          ['service', formData.roomServiceUrl],
        ];

        if (formData.image.trim()) {
          roomTags.push(['image', formData.image]);
        }

        await publishEvent.mutateAsync({
          event: {
            kind: 30312,
            content: '',
            tags: roomTags,
            created_at: Math.floor(Date.now() / 1000),
          },
          relays: relaysToUse,
        });

        // Then create the 30313 conference event that references the room
        const eventTags = [
          ['d', `event-${Date.now()}`],
          ['a', `30312:${user?.pubkey}:${roomId}`],
          ['title', formData.title],
          ['starts', startTimestamp.toString()],
          ['status', 'planned'],
        ];

        if (formData.summary.trim()) {
          eventTags.push(['summary', formData.summary]);
        }

        if (endTimestamp) {
          eventTags.push(['ends', endTimestamp.toString()]);
        }

        if (formData.image.trim()) {
          eventTags.push(['image', formData.image]);
        }

        await publishEvent.mutateAsync({
          event: {
            kind: 30313,
            content: formData.description || '',
            tags: eventTags,
            created_at: Math.floor(Date.now() / 1000),
          },
          relays: relaysToUse,
        });
      } else {
        // Create calendar event (kind 31922 or 31923) - no room selected
        const isTimeBased = formData.startTime && formData.endTime;
        const kind = isTimeBased ? 31923 : 31922;

        const tags = [
          ['d', `event-${Date.now()}`],
          ['title', formData.title],
          ['status', formData.status],
        ];

        if (isTimeBased) {
          const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
          const startTimestamp = Math.floor(startDateTime.getTime() / 1000);
          tags.push(['start', startTimestamp.toString()]);

          if (formData.endDate && formData.endTime) {
            const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
            const endTimestamp = Math.floor(endDateTime.getTime() / 1000);
            tags.push(['end', endTimestamp.toString()]);
          }
        } else {
          // Date-based event
          tags.push(['start', formData.startDate]);
          if (formData.endDate) {
            tags.push(['end', formData.endDate]);
          }
        }

        if (formData.summary.trim()) {
          tags.push(['summary', formData.summary]);
        }

        if (formData.location.trim()) {
          tags.push(['location', formData.location]);
        }

        if (formData.image.trim()) {
          tags.push(['image', formData.image]);
        }

        const relaysToUse = [...publishRelays, DEFAULT_RELAY, ...HIVETALK_RELAYS];

        await publishEvent.mutateAsync({
          event: {
            kind,
            content: formData.description || '',
            tags,
            created_at: Math.floor(Date.now() / 1000),
          },
          relays: relaysToUse,
        });
      }

      onOpenChange(false);
      onSuccess?.();
      // Reset form
      setIsLiveEvent(true);
      setFormData({
        title: '',
        summary: '',
        description: '',
        image: '',
        startDate: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endDate: '',
        endTime: '',
        location: '',
        roomServiceUrl: '',
        status: 'confirmed',
      });
    } catch (error) {
      console.error('Failed to create event:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Type Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              <span className="font-medium">Live Event</span>
            </div>
            <Switch
              checked={!isLiveEvent}
              onCheckedChange={(checked) => setIsLiveEvent(!checked)}
            />
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="font-medium">Calendar Event</span>
            </div>
          </div>

          {/* Common Fields */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Event title..."
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
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Full event details..."
            />
          </div>

          {/* Image */}
          <div>
            <Label htmlFor="image">Image URL</Label>
            <div className="flex gap-2">
              <Input
                id="image"
                value={formData.image}
                onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                placeholder="https://..."
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

          {/* Date/Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleStartDateTimeChange('startDate', e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="startTime">Start Time *</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => handleStartDateTimeChange('startTime', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>

          {/* Room Inputs (only for live events) */}
          {isLiveEvent && (
            <div>
              <Label>Room Selection</Label>
              <div className="space-y-3">
                {/* Room selection mode toggle */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={roomSelectionMode === 'existing' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRoomSelectionMode('existing')}
                  >
                    My Rooms
                  </Button>
                  <Button
                    type="button"
                    variant={roomSelectionMode === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRoomSelectionMode('custom')}
                  >
                    Custom URL
                  </Button>
                </div>

                {/* Existing room selection */}
                {roomSelectionMode === 'existing' && (
                  <div className="space-y-2">
                    {roomsLoading ? (
                      <div className="text-sm text-muted-foreground">Loading rooms...</div>
                    ) : userRooms.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Hivetalk relays are not accessible from your browser due to network/firewall issues.
                        Use Custom URL to manually enter room URLs.
                      </div>
                    ) : (
                      <Select
                        value={formData.roomServiceUrl}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, roomServiceUrl: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a room" />
                        </SelectTrigger>
                        <SelectContent>
                          {userRooms.map((room) => {
                            const roomId = room.tags?.find(([name]) => name === 'd')?.[1];
                            const roomName = room.tags?.find(([name]) => name === 'room')?.[1] || roomId;
                            const serviceUrl = room.tags?.find(([name]) => name === 'service')?.[1];
                            return (
                              <SelectItem key={room.id} value={serviceUrl || ''}>
                                {roomName}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    <a
                      href="https://honey.hivetalk.org/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Create Room at Hivetalk →
                    </a>
                  </div>
                )}

                {/* Custom URL input */}
                {roomSelectionMode === 'custom' && (
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="roomServiceUrl">Service URL *</Label>
                      <Input
                        id="roomServiceUrl"
                        value={formData.roomServiceUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, roomServiceUrl: e.target.value }))}
                        placeholder="https://hivetalk.org/..."
                      />
                    </div>
                    <a
                      href="https://honey.hivetalk.org/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Create Room at Hivetalk →
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location (only for calendar events) */}
          {!isLiveEvent && (
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Event location or meeting link..."
              />
            </div>
          )}

          {/* Status (only for calendar events) */}
          {!isLiveEvent && (
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as EventFormData['status'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="tentative">Tentative</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
