import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQuery } from '@tanstack/react-query';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useAuthor } from '@/hooks/useAuthor';
import { Users, UserCheck, UserX, Clock, MapPin, Video } from 'lucide-react';

interface EventRSVPProps {
  event: {
    id: string;
    author: string;
    d: string;
    title: string;
    start: number;
    end?: number;
    location?: string;
    kind: number;
    type?: 'calendar' | 'live';
    room?: {
      name: string;
      serviceUrl: string;
    };
  };
}

interface RSVP {
  pubkey: string;
  status: 'accepted' | 'declined' | 'tentative';
  created_at: number;
  content?: string;
}

export default function EventRSVP({ event }: EventRSVPProps) {
  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();
  const { nostr } = useDefaultRelay();
  
  // Fetch existing RSVPs for this event
  const { data: rsvps = [], refetch } = useQuery({
    queryKey: ['event-rsvps', event.id],
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const events = await nostr!.query([
        {
          kinds: [31925],
          '#a': [`${event.kind}:${event.author}:${event.d}`],
        }
      ], { signal });
      
      const rsvpMap = new Map<string, RSVP>();
      
      // Sort by created_at ascending so that later events overwrite earlier ones in the map
      events.sort((a, b) => a.created_at - b.created_at).forEach(rsvp => {
        rsvpMap.set(rsvp.pubkey, {
          pubkey: rsvp.pubkey,
          status: rsvp.tags.find(([name]) => name === 'status')?.[1] as 'accepted' | 'declined' | 'tentative' || 'tentative',
          created_at: rsvp.created_at,
          content: rsvp.content,
        });
      });
      
      return Array.from(rsvpMap.values());
    },
    enabled: !!nostr,
  });

  // Check if current user has already RSVPed
  const userRSVP = rsvps.find(rsvp => rsvp.pubkey === user?.pubkey);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRSVP = async (status: 'accepted' | 'declined' | 'tentative') => {
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      const tags = [
        ['d', `rsvp-${Date.now()}`],
        ['a', `${event.kind}:${event.author}:${event.d}`],
        ['status', status],
        ['p', event.author],
        ['alt', `RSVP ${status} for event: ${event.title}`],
      ];

      // If updating existing RSVP, include the event ID
      if (userRSVP) {
        tags.push(['e', event.id]);
      }

      createEvent({
        event: {
          kind: 31925,
          content: '', // Optional note
          tags,
        }
      });

      refetch();
    } catch (error) {
      console.error('Failed to submit RSVP:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const acceptedRSVPs = rsvps.filter(rsvp => rsvp.status === 'accepted');
  const tentativeRSVPs = rsvps.filter(rsvp => rsvp.status === 'tentative');
  const declinedRSVPs = rsvps.filter(rsvp => rsvp.status === 'declined');

  return (
    <div className="space-y-6">
      {/* Event Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Event Details & RSVPs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">{event.title}</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {new Date(event.start * 1000).toLocaleString()}
                  {event.end && ` - ${new Date(event.end * 1000).toLocaleString()}`}
                </div>
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                  </div>
                )}
                {event.type === 'live' && event.room?.serviceUrl && (
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    <a
                      href={event.room.serviceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      {event.room.name || 'Join Room'}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* RSVP Stats */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="default">
                  <UserCheck className="h-3 w-3 mr-1" />
                  {acceptedRSVPs.length} Going
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  {tentativeRSVPs.length} Maybe
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <UserX className="h-3 w-3 mr-1" />
                  {declinedRSVPs.length} Can't Go
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RSVP Actions */}
      {user ? (
        <Card>
          <CardHeader>
            <CardTitle>Your RSVP</CardTitle>
          </CardHeader>
          <CardContent>
            {userRSVP ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You RSVPed <strong>{userRSVP.status}</strong> on {new Date(userRSVP.created_at * 1000).toLocaleDateString()}
                </p>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleRSVP('accepted')}
                    disabled={isSubmitting || userRSVP.status === 'accepted'}
                    variant={userRSVP.status === 'accepted' ? 'default' : 'outline'}
                  >
                    ✓ Going
                  </Button>
                  <Button 
                    onClick={() => handleRSVP('tentative')}
                    disabled={isSubmitting || userRSVP.status === 'tentative'}
                    variant={userRSVP.status === 'tentative' ? 'default' : 'outline'}
                  >
                    ? Maybe
                  </Button>
                  <Button 
                    onClick={() => handleRSVP('declined')}
                    disabled={isSubmitting || userRSVP.status === 'declined'}
                    variant={userRSVP.status === 'declined' ? 'default' : 'outline'}
                  >
                    ✗ Can't Go
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Will you be attending this event?
                </p>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleRSVP('accepted')}
                    disabled={isSubmitting}
                  >
                    ✓ Going
                  </Button>
                  <Button 
                    onClick={() => handleRSVP('tentative')}
                    disabled={isSubmitting}
                    variant="outline"
                  >
                    ? Maybe
                  </Button>
                  <Button 
                    onClick={() => handleRSVP('declined')}
                    disabled={isSubmitting}
                    variant="outline"
                  >
                    ✗ Can't Go
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Please login to RSVP for this event.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attendees List */}
      {acceptedRSVPs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Who's Going ({acceptedRSVPs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {acceptedRSVPs.map((rsvp) => (
                <Attendee key={rsvp.pubkey} pubkey={rsvp.pubkey} rsvp={rsvp} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tentative Attendees */}
      {tentativeRSVPs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Maybe ({tentativeRSVPs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tentativeRSVPs.map((rsvp) => (
                <Attendee key={rsvp.pubkey} pubkey={rsvp.pubkey} rsvp={rsvp} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Declined Attendees */}
      {declinedRSVPs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Can't Go ({declinedRSVPs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {declinedRSVPs.map((rsvp) => (
                <Attendee key={rsvp.pubkey} pubkey={rsvp.pubkey} rsvp={rsvp} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Attendee({ pubkey, rsvp }: { pubkey: string; rsvp: RSVP }) {
  const { data: author } = useAuthor(pubkey);
  
  const displayName = author?.metadata?.name || pubkey.slice(0, 8) + '...';
  const picture = author?.metadata?.picture;

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8">
        {picture ? (
          <img src={picture} alt={displayName} />
        ) : (
          <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        )}
      </Avatar>
      <div className="flex-1">
        <p className="font-medium text-sm">{displayName}</p>
        <p className="text-xs text-muted-foreground">
          RSVPed {rsvp.status} on {new Date(rsvp.created_at * 1000).toLocaleDateString()}
        </p>
      </div>
      <Badge variant="outline" className="text-xs">
        {rsvp.status}
      </Badge>
    </div>
  );
}