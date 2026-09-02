import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { queryWithNip65Fanout, getNip65ReadRelays, FALLBACK_DISCOVERY_RELAYS } from '@/lib/queryRelays';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const nip65ReadRelays = getNip65ReadRelays(config.relayMetadata);

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      // Try primary relays + NIP-65 relays + fallback discovery relays.
      // Profiles are social data that may live on any relay — the author's
      // kind 0 might not be on the current user's read relays, so we include
      // well-known high-availability relays (damus, nos.lol, primal) to
      // broaden coverage.
      const authorRelays = new Set<string>(nip65ReadRelays);
      FALLBACK_DISCOVERY_RELAYS.forEach((url) => authorRelays.add(url));

      let [event] = await queryWithNip65Fanout(
        nostr,
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        [...authorRelays],
        AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      );

      // If no event found, try purplepag.es
      if (!event) {
        try {
          const purplePagesRelay = 'wss://purplepag.es';
          const [purpleEvent] = await nostr.query(
            [{ kinds: [0], authors: [pubkey!], limit: 1 }],
            { 
              signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
              relays: [purplePagesRelay]
            },
          );
          if (purpleEvent) {
            event = purpleEvent;
          }
        } catch (error) {
          console.error('Failed to query purplepages:', error);
        }
      }

      if (!event) {
        throw new Error('No event found');
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000, // Keep cached data fresh for 5 minutes
    retry: 1, // One retry for transient errors; metadata either exists or doesn't
  });
}
