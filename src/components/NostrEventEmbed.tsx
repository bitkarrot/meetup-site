/**
 * Inline preview for referenced Nostr events (note1, nevent1, naddr1).
 *
 * When a note mentions another event via a NIP-19 identifier, this component
 * fetches the referenced event from relays and renders it as an embedded
 * quote card with author info and content preview.
 *
 * Relay resolution follows the outbox model:
 * 1. The default relay pool (via nostr.query)
 * 2. Relay hints embedded in the nip19 entity (nevent1/naddr1 relays field)
 * 3. The current user's NIP-65 read relays
 * 4. The **author's** NIP-65 write relays (kind 10002) — this is critical
 *    because articles are published on the author's write relays, which may
 *    be different from the current user's read relays.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { queryWithNip65Fanout, getNip65ReadRelays, FALLBACK_DISCOVERY_RELAYS } from '@/lib/queryRelays';
import { decodeEventFilter, eventDisplayTitle } from '@/lib/nip19';
import { isBlockedRelay } from '@/lib/blockedRelays';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { NostrEvent } from '@nostrify/nostrify';

interface NostrEventEmbedProps {
  /** The raw nip19 identifier without the nostr: prefix, e.g. "note1..." or "nevent1..." */
  identifier: string;
  /** Gateway URL for "open in new tab" links */
  gateway: string;
  /** When false, show the full event content instead of a truncated snippet. */
  truncate?: boolean;
}

export function NostrEventEmbed({ identifier, gateway, truncate = true }: NostrEventEmbedProps) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const nip65ReadRelays = getNip65ReadRelays(config.relayMetadata);
  // Include the site's publish relays as discovery candidates — these are
  // well-known relays where kind 10002 events are commonly found.
  const publishRelays = config.siteConfig?.publishRelays ?? [];

  // Decode the identifier and build the appropriate query filter.
  // Also extract the author's pubkey so we can look up their write relays.
  const { filter, relayHints, decodedId, authorPubkey } = useMemo(
    () => decodeEventFilter(identifier),
    [identifier],
  );

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['event-embed', decodedId],
    queryFn: async () => {
      if (!nostr || !filter) return null;

      const signal = AbortSignal.timeout(12000);

      // Build relay list: relay hints from the nip19 entity + current user's NIP-65 read relays
      const additionalRelays = new Set<string>(nip65ReadRelays);
      relayHints.forEach((url) => additionalRelays.add(url));

      // Outbox model: fetch the author's NIP-65 relay list (kind 10002) to
      // find their write relays. Articles are published on the author's write
      // relays, which may differ from the current user's read relays.
      //
      // We include well-known fallback relays (and the site's publish relays)
      // in the 10002 lookup because the naddr's relay hint may be a non-standard
      // relay (e.g. search-only) that doesn't serve standard REQ queries.
      if (authorPubkey) {
        try {
          const discoveryRelays = new Set<string>(additionalRelays);
          publishRelays.forEach((url) => discoveryRelays.add(url));
          FALLBACK_DISCOVERY_RELAYS.forEach((url) => discoveryRelays.add(url));

          const authorRelayEvents = await queryWithNip65Fanout(
            nostr,
            [{ kinds: [10002], authors: [authorPubkey] }],
            [...discoveryRelays],
            AbortSignal.timeout(8000), // allow enough time for multi-relay discovery
          );
          // Extract write relay URLs from the author's kind 10002 tags
          for (const ev of authorRelayEvents) {
            for (const tag of ev.tags) {
              if (tag[0] === 'r' && tag[1] && !isBlockedRelay(tag[1])) {
                // tag[2] is 'read' or 'write'; if absent, relay is both
                const mode = tag[2];
                if (mode === 'write' || mode === undefined) {
                  additionalRelays.add(tag[1]);
                }
              }
            }
          }
        } catch {
          // If we can't fetch the author's relay list, continue with the relays we have
        }
      }

      // Always include fallback relays for the article fetch. If the author's
      // 10002 was found, their write relays are already in additionalRelays.
      // If not, the fallbacks give us a last-resort chance to find the article.
      publishRelays.forEach((url) => additionalRelays.add(url));
      FALLBACK_DISCOVERY_RELAYS.forEach((url) => additionalRelays.add(url));

      const events = await queryWithNip65Fanout(
        nostr,
        [filter],
        [...additionalRelays],
        signal,
      );

      // For addressable events, take the newest matching event
      if (events.length === 0) return null;
      if (events.length === 1) return events[0];
      return events.sort((a, b) => b.created_at - a.created_at)[0];
    },
    enabled: !!filter && !!nostr,
    staleTime: 120000, // 2 minutes — embedded events don't change often
    retry: false,
  });

  // Fallback: render as a link if we can't decode or fetch
  if (!filter) {
    return (
      <a
        href={`${gateway}/${identifier}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline break-all"
      >
        nostr:{identifier}
      </a>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-muted p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading {identifier.slice(0, 12)}…</span>
      </div>
    );
  }

  // Event not found — fall back to a link
  if (!event) {
    return (
      <a
        href={`${gateway}/${identifier}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline break-all"
      >
        nostr:{identifier}
      </a>
    );
  }

  return <EmbeddedEventCard event={event} gateway={gateway} identifier={identifier} truncate={truncate} />;
}

function EmbeddedEventCard({
  event,
  gateway,
  identifier,
  truncate = true,
}: {
  event: NostrEvent;
  gateway: string;
  identifier: string;
  truncate?: boolean;
}) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const timeAgo = formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true });

  const eventUrl = `${gateway}/${identifier}`;
  // For articles (kind 30023), show the title tag instead of raw Markdown.
  // For notes and other kinds, show a cleaned content snippet.
  const previewText = eventDisplayTitle(event);

  return (
    <a
      href={eventUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block my-2 rounded-lg border border-muted hover:border-primary/30 transition-colors p-3 bg-muted/20 hover:bg-muted/30 group"
    >
      {/* Author row */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-6 w-6">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="text-[10px]">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium truncate">{displayName}</span>
        <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
        <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Content preview — title for articles, cleaned snippet for notes.
          When truncate is false (e.g. in the editor preview), show the full
          content so the user can see exactly what they're embedding. */}
      <p className={cn(
        "text-sm text-muted-foreground whitespace-pre-wrap break-words",
        truncate && previewText.length > 300 && "line-clamp-4",
      )}>
        {truncate && previewText.length > 300
          ? previewText.slice(0, 300) + '…'
          : previewText}
      </p>
    </a>
  );
}
