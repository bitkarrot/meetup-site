import { useState, useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { 
  MessageSquare, 
  Heart, 
  Bookmark, 
  MoreHorizontal,
  Share2
} from 'lucide-react';

import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { genUserName } from '@/lib/genUserName';
import { NoteContent } from './NoteContent';
import { ZapButton } from './ZapButton';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { Card, CardContent, CardFooter, CardHeader } from './ui/card';
import { CommentForm } from './comments/CommentForm';
import { useToast } from '@/hooks/useToast';

interface FeedItemProps {
  event: NostrEvent;
  showActions?: boolean;
}

export function FeedItem({ event, showActions = true }: FeedItemProps) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { config } = useAppContext();
  const { toast } = useToast();
  const author = useAuthor(event.pubkey);
  const [showReplyForm, setShowReplyForm] = useState(false);
  
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const timeAgo = formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true });

  const handleReact = () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to react to posts.",
        variant: "destructive"
      });
      return;
    }

    publishEvent({
      event: {
        kind: 7,
        content: "+",
        tags: [
          ["e", event.id],
          ["p", event.pubkey]
        ]
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Liked",
          description: "Your reaction has been published."
        });
      }
    });
  };

  const handleBookmark = () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to bookmark posts.",
        variant: "destructive"
      });
      return;
    }

    // NIP-15/NIP-17 style bookmarks often use Kind 30001 (sets) or 10006
    // For simplicity and interoperability, let's use Kind 10006 (Public Bookmarks)
    publishEvent({
      event: {
        kind: 10006,
        content: "",
        tags: [
          ["e", event.id]
        ]
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Bookmarked",
          description: "Post added to your bookmarks."
        });
      }
    });
  };

  const handleShare = () => {
    const noteId = nip19.noteEncode(event.id);
    const gateway = config.siteConfig?.nip19Gateway || 'https://nostr.at';
    const cleanGateway = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;
    const url = `${cleanGateway}/${noteId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Post link copied to clipboard."
    });
  };

  return (
    <Card className="overflow-hidden border-none sm:border shadow-none sm:shadow-sm bg-card mb-4">
      <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
        <div className="flex items-center space-x-3">
          <Link to={`/${npub}`}>
            <Avatar className="h-10 w-10 border">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex flex-col">
            <Link to={`/${npub}`} className="font-bold hover:underline line-clamp-1">
              {displayName}
            </Link>
            <div className="flex items-center text-xs text-muted-foreground space-x-1">
              <span>{timeAgo}</span>
            </div>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Copy Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleBookmark}>
              <Bookmark className="mr-2 h-4 w-4" />
              Bookmark
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0">
        <NoteContent event={event} className="text-base" />
      </CardContent>

      {showActions && (
        <CardFooter className="px-2 py-1 border-t flex items-center justify-between">
          <div className="flex items-center w-full">
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex-1 flex items-center gap-2 h-10 text-muted-foreground hover:text-primary"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-medium">Reply</span>
            </Button>

            <Button 
              variant="ghost" 
              size="sm" 
              className="flex-1 flex items-center gap-2 h-10 text-muted-foreground hover:text-red-500"
              onClick={handleReact}
            >
              <Heart className="h-4 w-4" />
              <span className="text-xs font-medium">Like</span>
            </Button>

            <div className="flex-1 flex justify-center">
              <ZapButton 
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                target={event as any} 
                className="w-full flex items-center justify-center gap-2 h-10 text-muted-foreground hover:text-yellow-500"
              />
            </div>

            <Button 
              variant="ghost" 
              size="sm" 
              className="flex-1 flex items-center gap-2 h-10 text-muted-foreground hover:text-blue-500"
              onClick={handleBookmark}
            >
              <Bookmark className="h-4 w-4" />
              <span className="text-xs font-medium">Save</span>
            </Button>
          </div>
        </CardFooter>
      )}

      {showReplyForm && (
        <div className="p-4 bg-muted/30 border-t">
          <CommentForm 
            root={event} 
            onSuccess={() => {
              setShowReplyForm(false);
              toast({
                title: "Reply Published",
                description: "Your reply has been sent."
              });
            }}
            compact
            placeholder="Write your reply..."
          />
        </div>
      )}
    </Card>
  );
}
