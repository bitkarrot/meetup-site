/**
 * ShareAsNoteDialog - Dialog for sharing an event as a kind 1 note with a NIP-18 quote.
 *
 * Creates a kind 1 text note that quotes the original event using the `q` tag
 * (NIP-18 quote repost), allowing the user to add their own commentary.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Loader2 } from 'lucide-react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { kindLabel } from '@/lib/kinds';
import { nip19 } from 'nostr-tools';
import { encodeEventRef, isAddressableKind } from '@/lib/nip19';

interface ShareAsNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: {
    id: string;
    pubkey: string;
    kind: number;
    title: string;
    summary: string;
    d?: string;
    room?: {
      id: string;
      pubkey?: string;
      serviceUrl: string;
      name: string;
    };
  };
  relayUrl: string;
  publishRelays: string[];
}

export function ShareAsNoteDialog({
  open,
  onOpenChange,
  target,
  relayUrl,
  publishRelays,
}: ShareAsNoteDialogProps) {
  const { toast } = useToast();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const [content, setContent] = useState('');

  const isAddressable = isAddressableKind(target.kind) && !!target.d;

  const getEventNaddr = () => encodeEventRef(
    { id: target.id, pubkey: target.pubkey, kind: target.kind, tags: target.d ? [['d', target.d]] : [] },
    relayUrl,
  );

  const getEventCoordinate = () => {
    if (isAddressable && target.d) {
      return `${target.kind}:${target.pubkey}:${target.d}`;
    }
    return target.id;
  };

  const getRoomNaddr = () => {
    if (!target.room?.id || !target.room.pubkey) return null;
    const relays = relayUrl ? [relayUrl] : [];
    return nip19.naddrEncode({
      kind: 30312,
      pubkey: target.room.pubkey,
      identifier: target.room.id,
      relays,
    });
  };

  const getRoomCoordinate = () => {
    if (!target.room?.id || !target.room.pubkey) return null;
    return `30312:${target.room.pubkey}:${target.room.id}`;
  };

  const getNoteData = () => {
    const naddr = getEventNaddr();
    const coordinate = getEventCoordinate();
    const roomNaddr = getRoomNaddr();
    const roomCoordinate = getRoomCoordinate();

    // NIP-18: the 'q' tag uses the raw event ID (hex) or coordinate
    // (kind:pubkey:d), NOT the bech32 encoding. The bech32 form is only
    // for the human-readable content link (nostr:...).
    const tags: string[][] = [
      ['q', coordinate, relayUrl],
      // NIP-10: include a 'p' tag for the quoted author so other clients
      // can route mention notifications correctly.
      ['p', target.pubkey],
    ];

    // For addressable events, also include the 'a' tag (coordinate form)
    if (isAddressable && target.d) {
      tags.push(['a', coordinate, relayUrl]);
    }

    // If this is a live event with a room, also quote the room
    if (roomNaddr && roomCoordinate) {
      tags.push(['q', roomCoordinate, relayUrl]);
      tags.push(['a', roomCoordinate, relayUrl]);
    }

    const nostrLink = `nostr:${naddr}`;
    const roomNostrLink = roomNaddr ? `nostr:${roomNaddr}` : null;
    const roomWebLink = target.room?.serviceUrl ? `Join room: ${target.room.serviceUrl}` : null;

    let noteContent = content.trim()
      ? `${content.trim()}\n\n${nostrLink}`
      : `Check out this event: ${target.title}\n\n${nostrLink}`;

    if (roomNostrLink || roomWebLink) {
      noteContent += '\n';
      if (roomNostrLink) noteContent += `\n${target.room?.name || 'Room'}: ${roomNostrLink}`;
      if (roomWebLink) noteContent += `\n${roomWebLink}`;
    }

    return { noteContent, tags };
  };

  const handleShare = async () => {
    try {
      const { noteContent, tags } = getNoteData();

      await publishEvent({
        event: {
          kind: 1,
          content: noteContent,
          tags,
          created_at: Math.floor(Date.now() / 1000),
        },
        relays: publishRelays,
      });

      toast({ title: 'Note published', description: 'Your note quoting this event has been published.' });
      handleClose();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to publish note.',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setContent('');
    onOpenChange(false);
  };

  const { noteContent: previewNoteContent, tags: previewTags } = getNoteData();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 shrink-0" />
            Share as Note
          </DialogTitle>
          <DialogDescription>
            Write a kind 1 note quoting this {kindLabel(target.kind).toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        {/* Event preview */}
        <div className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">
              {target.title || 'Untitled Event'}
            </p>
            {target.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {target.summary}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {kindLabel(target.kind)} · Quoted via NIP-18
            </p>
          </div>
        </div>

        {/* Text area for user commentary */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Your message (optional)</label>
          <Textarea
            placeholder="Add your thoughts about this event..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            disabled={isPending}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            A link to the event will be automatically appended.
          </p>
        </div>

        {/* Note preview */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Note preview</label>
          <div className="p-3 border rounded-lg bg-muted/50 text-sm whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
            {previewNoteContent}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:underline">
              {previewTags.length} tag{previewTags.length === 1 ? '' : 's'}
            </summary>
            <pre className="mt-1 p-2 rounded bg-muted/30 overflow-x-auto">
              {JSON.stringify(previewTags, null, 2)}
            </pre>
          </details>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleShare}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publish Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
