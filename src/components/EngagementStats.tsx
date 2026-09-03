/**
 * Shared engagement stats utilities — used by both the admin Notes section
 * and the public Feed page.
 *
 * - `useNoteStats`: fetches reaction/zap/repost/reply counts for a note
 * - `EngagementPopover`: hover/tap popover showing who interacted
 * - `EngagementUserRow`: single row in the popover (avatar + name + detail)
 */

import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { queryWithNip65Fanout, getNip65ReadRelays } from '@/lib/queryRelays';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// --- Types ---

export interface EngagementUser {
  pubkey: string;
  detail: string; // emoji for reactions, sats for zaps, content snippet for replies
}

export interface NoteStats {
  reactions: number;
  zaps: number;
  zapAmount: number;
  reposts: number;
  replies: number;
  reactionUsers: EngagementUser[];
  zapUsers: EngagementUser[];
  repostUsers: EngagementUser[];
  replyUsers: EngagementUser[];
}

// --- Helpers ---

/** Remove the current user from an engagement user list (don't show self in popovers). */
export function filterSelf(users: EngagementUser[], myPubkey?: string): EngagementUser[] {
  return myPubkey ? users.filter((u) => u.pubkey !== myPubkey) : users;
}

// --- Hook ---

/**
 * Fetch engagement stats (reactions, zaps, reposts, replies) for a note.
 * Uses NIP-65 fanout so social engagement data is gathered across relays.
 */
export function useNoteStats(noteId: string): NoteStats & { isLoading: boolean } {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const nip65ReadRelays = getNip65ReadRelays(config.relayMetadata);

  const { data, isLoading } = useQuery({
    queryKey: ['note-stats', noteId],
    queryFn: async () => {
      const fanoutSignal = AbortSignal.timeout(10000);
      const [reactions, zaps, reposts, replies] = await Promise.all([
        queryWithNip65Fanout(nostr, [{ kinds: [7], '#e': [noteId] }], nip65ReadRelays, fanoutSignal),
        queryWithNip65Fanout(nostr, [{ kinds: [9735], '#e': [noteId] }], nip65ReadRelays, fanoutSignal),
        queryWithNip65Fanout(nostr, [{ kinds: [6], '#e': [noteId] }], nip65ReadRelays, fanoutSignal),
        queryWithNip65Fanout(nostr, [{ kinds: [1], '#e': [noteId] }], nip65ReadRelays, fanoutSignal),
      ]);

      // Parse zap amounts — the pubkey on a kind 9735 is the zapper service,
      // not the sender. The real sender is in the description tag's zap request
      // JSON (NIP-57).
      const zapUsers: EngagementUser[] = [];
      let zapAmount = 0;
      zaps.forEach(zap => {
        let amount = 0;
        let zapSender = zap.pubkey;
        const descriptionTag = zap.tags.find(([name]) => name === 'description')?.[1];
        if (descriptionTag) {
          try {
            const zapRequest = JSON.parse(descriptionTag);
            if (zapRequest.pubkey) {
              zapSender = zapRequest.pubkey;
            }
            const requestAmountTag = zapRequest.tags?.find(([name]: string[]) => name === 'amount')?.[1];
            if (requestAmountTag) {
              amount = Math.floor(parseInt(requestAmountTag) / 1000);
            }
          } catch {
            // ignore parse errors
          }
        }
        if (amount === 0) {
          const amountTag = zap.tags.find(([name]) => name === 'amount')?.[1];
          if (amountTag) {
            amount = Math.floor(parseInt(amountTag) / 1000);
          }
        }
        zapAmount += amount;
        zapUsers.push({ pubkey: zapSender, detail: amount > 0 ? `${amount.toLocaleString()} sats` : 'zap' });
      });

      const reactionUsers: EngagementUser[] = reactions.map(r => ({
        pubkey: r.pubkey,
        detail: r.content || '👍',
      }));
      const repostUsers: EngagementUser[] = reposts.map(rp => ({
        pubkey: rp.pubkey,
        detail: 'reposted',
      }));
      const replyUsers: EngagementUser[] = replies.map(rp => ({
        pubkey: rp.pubkey,
        detail: rp.content.slice(0, 60) + (rp.content.length > 60 ? '...' : ''),
      }));

      return {
        reactions: reactions.length,
        zaps: zaps.length,
        zapAmount,
        reposts: reposts.length,
        replies: replies.length,
        reactionUsers,
        zapUsers,
        repostUsers,
        replyUsers,
      };
    },
    enabled: !!noteId,
    staleTime: 60000,
  });

  return {
    reactions: data?.reactions ?? 0,
    zaps: data?.zaps ?? 0,
    zapAmount: data?.zapAmount ?? 0,
    reposts: data?.reposts ?? 0,
    replies: data?.replies ?? 0,
    reactionUsers: data?.reactionUsers ?? [],
    zapUsers: data?.zapUsers ?? [],
    repostUsers: data?.repostUsers ?? [],
    replyUsers: data?.replyUsers ?? [],
    isLoading,
  };
}

// --- Components ---

export function EngagementUserRow({ user }: { user: EngagementUser }) {
  const { data: author, isLoading } = useAuthor(user.pubkey);
  const name = author?.metadata?.name || author?.metadata?.display_name;
  return (
    <div className="flex items-center gap-2 py-1">
      <Avatar className="h-5 w-5">
        <AvatarImage src={author?.metadata?.picture} />
        <AvatarFallback className="text-[8px]">{name ? name.charAt(0).toUpperCase() : '·'}</AvatarFallback>
      </Avatar>
      <span className="text-xs truncate flex-1">
        {name || (isLoading ? <span className="text-muted-foreground/50">loading...</span> : `${user.pubkey.slice(0, 8)}...`)}
      </span>
      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{user.detail}</span>
    </div>
  );
}

export function EngagementPopover({
  users,
  count,
  children,
}: {
  users: EngagementUser[];
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return <>{children}</>;
  const display = users.slice(0, 15);
  const remaining = count - display.length;

  const content = (
    <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
      {display.map((u, i) => (
        <EngagementUserRow key={`${u.pubkey}-${i}`} user={u} />
      ))}
      {remaining > 0 && (
        <p className="text-xs text-muted-foreground pt-1">+{remaining} more...</p>
      )}
    </div>
  );

  return (
    <>
      {/* HoverCard for desktop */}
      <div className="hidden sm:block">
        <HoverCard>
          <HoverCardTrigger asChild>
            <div className="cursor-pointer">{children}</div>
          </HoverCardTrigger>
          <HoverCardContent className="w-72 p-3" align="end">
            {content}
          </HoverCardContent>
        </HoverCard>
      </div>
      {/* Popover for mobile (tap to open) */}
      <div className="sm:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <div className="cursor-pointer">{children}</div>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            {content}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
