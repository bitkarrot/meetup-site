/**
 * Hook for fetching and normalizing calendar events.
 *
 * Queries for both NIP-52 (31922/31923) and NIP-53 (30313) events,
 * normalizes them to a unified interface, and provides filtering.
 */

import { useQuery } from '@tanstack/react-query';
import { useDefaultRelay } from './useDefaultRelay';
import { useAppContext } from './useAppContext';
import { useRemoteNostrJson } from './useRemoteNostrJson';
import { getMasterPubkey } from '@/lib/relay';
import { normalizeEvent, type UnifiedCalendarEvent } from '@/lib/calendarEvents';
import { fetchRoomDetails } from './useRooms';

export type EventFilter = 'all' | 'calendar' | 'live';

/**
 * Fetch and normalize calendar events.
 *
 * Uses useRoomDetails for proper room details caching.
 */
export function useCalendarEvents(
  userPubkey: string | undefined,
  filter: EventFilter = 'all',
) {
  const { poolNostr } = useDefaultRelay();
  const { config: appContext } = useAppContext();
  const { data: nostrJson } = useRemoteNostrJson();

  return useQuery({
    queryKey: ['calendar-events', userPubkey, filter, nostrJson],
    queryFn: async () => {
      if (!poolNostr) return [];

      // Build the set of allowed pubkeys from master pubkey + publisher roles.
      // Do NOT include all nostr.json accounts — those include non-publisher
      // users whose events should not appear in public listings.
      const allowedPubkeys = new Set<string>();
      const masterPubkey = getMasterPubkey();
      if (masterPubkey) {
        allowedPubkeys.add(masterPubkey.toLowerCase().trim());
      }
      const adminRoles = appContext?.siteConfig?.adminRoles;
      if (adminRoles) {
        for (const [pk, role] of Object.entries(adminRoles)) {
          if (role === 'publisher') {
            allowedPubkeys.add(pk.toLowerCase().trim());
          }
        }
      }

      const signal = AbortSignal.timeout(10000);

      // Query from default relay only (same relay we publish to).
      // When we have a publisher whitelist, pass it as the `authors` filter
      // so the relay only returns events from publishers — preventing
      // non-publisher events from crowding out valid ones within the limit.
      let events;
      try {
        const filter: { kinds: number[]; limit: number; authors?: string[] } = {
          kinds: [31922, 31923, 30313],
          limit: 100,
        };
        if (allowedPubkeys.size > 0) {
          filter.authors = [...allowedPubkeys];
        }
        events = await poolNostr.query([filter], { signal });
      } catch {
        return [];
      }

      // Filter to only whitelisted pubkeys (if we have a whitelist)
      const filteredEvents = allowedPubkeys.size > 0
        ? events.filter(e => allowedPubkeys.has(e.pubkey.toLowerCase().trim()))
        : events;

      // Normalize each event and deduplicate.
      // Addressable events (31922, 31923, 30313) are replaceable by
      // kind:pubkey:d coordinate — dedup by coordinate to avoid showing
      // both old and new versions when an event is updated.
      // Non-addressable events dedup by event.id as usual.
      const eventMap = new Map<string, UnifiedCalendarEvent>();

      const fetchRoom = (coords: string) => fetchRoomDetails(coords, poolNostr);

      for (const event of filteredEvents) {
        try {
          // Skip 30312 room events - they're room definitions, not displayable events
          if (event.kind === 30312) {
            continue;
          }

          const normalizedEvent = await normalizeEvent(event, fetchRoom);

          // Build dedup key: coordinate for addressable, id for everything else
          const dTag = event.tags.find(([name]) => name === 'd')?.[1] || '';
          const isAddressable = event.kind === 31922 || event.kind === 31923 || event.kind === 30313;
          const dedupKey = isAddressable && dTag
            ? `${event.kind}:${event.pubkey}:${dTag}`
            : event.id;

          // Deduplicate: keep the most recent event (highest created_at)
          const existing = eventMap.get(dedupKey);
          if (!existing || event.created_at > existing.created_at) {
            eventMap.set(dedupKey, normalizedEvent);
          }
        } catch {
          // Skip malformed events
        }
      }

      const normalizedEvents = Array.from(eventMap.values());

      // Apply type filter
      if (filter === 'calendar') {
        return normalizedEvents.filter(e => e.type === 'calendar');
      }
      if (filter === 'live') {
        return normalizedEvents.filter(e => e.type === 'live');
      }
      return normalizedEvents;
    },
    enabled: !!poolNostr,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Poll every 30 seconds for live status updates
  });
}
