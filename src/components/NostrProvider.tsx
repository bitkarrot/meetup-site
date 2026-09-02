import React, { useEffect, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { getDefaultRelayUrl } from '@/lib/relay';
import { isBlockedRelay } from '@/lib/blockedRelays';

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();

  const queryClient = useQueryClient();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const relayMetadata = useRef(config.relayMetadata);

  // Invalidate Nostr queries when relay metadata or default relay changes
  useEffect(() => {
    relayMetadata.current = config.relayMetadata;
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [config.relayMetadata, config.siteConfig?.defaultRelay, queryClient]);

  // Initialize NPool only once
  if (!pool.current) {
    const poolOptions = {
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();

        // Route reads to the DEFAULT RELAY ONLY.
        // CMS content (events, blogs, forms, pages, site config) lives on the default relay.
        // Social components (feed, notes, zaps, comments, DMs) use queryWithNip65Fanout()
        // to additionally query NIP-65 relays on top of this pool.
        const defaultRelay = getDefaultRelayUrl();
        if (defaultRelay) {
          routes.set(defaultRelay, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        const defaultRelay = getDefaultRelayUrl();

        // Get write relays from NIP-65 metadata, excluding blocked relays
        const writeRelays = relayMetadata.current.relays
          .filter(r => r.write)
          .map(r => r.url)
          .filter(url => !isBlockedRelay(url));

        // Always include default relay for writes
        const allRelays = new Set<string>(writeRelays);
        if (defaultRelay) allRelays.add(defaultRelay);

        return [...allRelays];
      },
      eoseTimeout: 10000,
    } as unknown as ConstructorParameters<typeof NPool>[0];

    pool.current = new NPool(poolOptions);
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current as unknown as never }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;