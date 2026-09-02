import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { isBlockedRelay } from '@/lib/blockedRelays';

/**
 * Well-known, high-availability relays used as fallback when looking up an
 * author's NIP-65 relay list (kind 10002) or fetching events whose relay
 * hints are missing or non-functional (e.g. search-only relays like nos.today
 * that reject standard REQ queries).
 *
 * Used by `NostrEventEmbed` and `EventPickerDialog` to broaden relay
 * coverage so events can be discovered even when the naddr/nevent relay hint
 * is useless.
 */
export const FALLBACK_DISCOVERY_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

/**
 * Query the default relay pool and fan out to additional NIP-65 relays,
 * merging and deduplicating results by event ID.
 *
 * Used by social components (Feed, Notes, Zaps, Comments, DMs, Profiles)
 * that need to read from multiple relays beyond the default CMS relay.
 *
 * CMS content components should NOT use this — they read from the default
 * relay only via the standard nostr.query() pool.
 */
export async function queryWithNip65Fanout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nostr: any,
  filters: NostrFilter[],
  nip65RelayUrls: string[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  // Start all queries in parallel. The default relay (nostr.query) is
  // the primary source — external NIP-65 relays supplement with additional
  // data. We wait for all to settle, but the signal timeout ensures slow
  // relays don't block the response for too long.
  const results = await Promise.allSettled([
    nostr.query(filters, { signal }),
    ...nip65RelayUrls.map((url: string) => {
      try {
        const relay = nostr.relay(url);
        return relay.query(filters, { signal });
      } catch {
        return Promise.resolve([] as NostrEvent[]);
      }
    }),
  ]);

  const allEvents = results
    .filter(
      (r): r is PromiseFulfilledResult<NostrEvent[]> =>
        r.status === 'fulfilled',
    )
    .flatMap((r) => r.value);

  // Deduplicate by event ID
  return Array.from(new Map(allEvents.map((e) => [e.id, e])).values());
}

/**
 * Get the list of NIP-65 read relay URLs from relay metadata config.
 * Filters to only relays marked for reading, excluding blocked relays.
 */
export function getNip65ReadRelays(
  relayMetadata?: { relays: Array<{ url: string; read: boolean; write: boolean }> },
): string[] {
  return relayMetadata?.relays?.filter((r) => r.read).map((r) => r.url).filter(url => !isBlockedRelay(url)) || [];
}
