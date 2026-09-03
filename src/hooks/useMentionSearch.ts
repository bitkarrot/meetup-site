import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import { type NostrEvent, type NProfilePointer, type NRelay, NIP05, NSchema as n } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { getNip65ReadRelays } from '@/lib/queryRelays';

/**
 * A user profile found via NIP-50 relay search or NIP-05 lookup. Unlike
 * nostr.json entries, these carry pre-fetched metadata (display_name, picture,
 * nip05) so the dropdown can render them without an extra `useAuthor` round-trip.
 */
export interface MentionSearchResult {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  /** NIP-05 identifier from kind 0 metadata or NIP-05 lookup. */
  nip05?: string;
}

/**
 * Relays known to support NIP-50 search on kind 0 profiles.
 *
 * `search.nos.today` — reliable NIP-50 search, indexes kind 0 metadata.
 * `nostr.wine` — indexes profiles with broader coverage, good for name search.
 * `relay.nostr.band` — premier search relay but may be unreachable from some
 *   networks; included as a fallback.
 *
 * Note: `relay.damus.io` does NOT support the `search` filter despite
 * advertising NIP-50 — it returns "unrecognised filter item: search".
 */
const SEARCH_RELAYS = [
  'wss://search.nos.today',
  'wss://nostr.wine',
  'wss://relay.nostr.band',
];

const MIN_QUERY_LENGTH = 1;
const SEARCH_TIMEOUT_MS = 5000;

/** Check if a query string looks like a NIP-05 identifier (name@domain). */
function looksLikeNip05(query: string): boolean {
  return NIP05.regex().test(query) && query.includes('@');
}

/**
 * Check if a query string looks like a bech32 Nostr entity (npub1… or
 * nprofile1…), optionally `nostr:`-prefixed. Used to short-circuit the
 * NIP-50 text search (which never matches bech32 strings) and instead
 * decode + fetch the profile directly.
 */
export function looksLikeBech32Entity(query: string): boolean {
  return /^(nostr:)?(npub1|nprofile1)[023456789acdefghjklmnpqrstuvwxyz]+$/i.test(query);
}

/**
 * Decode a bech32 entity query (npub1… / nprofile1…, optionally
 * `nostr:`-prefixed) and fetch the matching kind 0 profile so the user can
 * verify the identity before inserting the mention.
 */
export async function lookupBech32Entity(
  query: string,
  nostr: { relay: (url: string) => NRelay },
  signal: AbortSignal,
): Promise<MentionSearchResult | null> {
  const stripped = query.replace(/^nostr:/i, '');
  let pubkey: string;
  try {
    const decoded = nip19.decode(stripped);
    if (decoded.type === 'npub') {
      pubkey = decoded.data as string;
    } else if (decoded.type === 'nprofile') {
      pubkey = (decoded.data as NProfilePointer).pubkey;
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const npub = nip19.npubEncode(pubkey);

  // Profiles are social data; try the search relays plus purplepag.es
  // (a high-coverage profile index) to resolve the metadata.
  const profileRelays = [...SEARCH_RELAYS, 'wss://purplepag.es'];
  let profileEvent: NostrEvent | undefined;
  for (const url of profileRelays) {
    if (signal.aborted) break;
    try {
      const events = await nostr.relay(url).query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal },
      );
      if (events.length > 0) {
        profileEvent = events[0];
        break;
      }
    } catch {
      // try next relay
    }
  }

  if (profileEvent) {
    try {
      const metadata = n.json().pipe(n.metadata()).parse(profileEvent.content);
      return {
        pubkey,
        npub,
        name: metadata.name,
        displayName: metadata.display_name,
        picture: metadata.picture,
        nip05: metadata.nip05,
      };
    } catch {
      // fall through to basic result
    }
  }

  // Valid npub but no profile found — still return the pubkey so the user
  // can confirm the bech32 decoded and insert it.
  return { pubkey, npub };
}

/** Resolve a NIP-05 identifier and fetch the profile, returning a search result. */
async function lookupNip05(
  nip05id: string,
  nostr: { relay: (url: string) => NRelay },
  signal: AbortSignal,
): Promise<MentionSearchResult | null> {
  try {
    const pointer: NProfilePointer = await NIP05.lookup(nip05id, { signal });
    const npub = nip19.npubEncode(pointer.pubkey);

    // Try to fetch the profile from the NIP-05 relays first, then fall back
    // to search relays.
    const profileRelays = pointer.relays?.length
      ? pointer.relays
      : SEARCH_RELAYS;

    let profileEvent: NostrEvent | undefined;
    for (const url of profileRelays) {
      try {
        const events = await nostr.relay(url).query(
          [{ kinds: [0], authors: [pointer.pubkey], limit: 1 }],
          { signal },
        );
        if (events.length > 0) {
          profileEvent = events[0];
          break;
        }
      } catch {
        // try next relay
      }
    }

    if (profileEvent) {
      try {
        const metadata = n.json().pipe(n.metadata()).parse(profileEvent.content);
        return {
          pubkey: pointer.pubkey,
          npub,
          name: metadata.name,
          displayName: metadata.display_name,
          picture: metadata.picture,
          nip05: nip05id,
        };
      } catch {
        // fall through to basic result
      }
    }

    // No profile found, but we still have the pubkey from NIP-05.
    return { pubkey: pointer.pubkey, npub, nip05: nip05id };
  } catch {
    return null;
  }
}

/**
 * Search for users matching `query` via two strategies in parallel:
 *
 * 1. **NIP-50 relay search** — search for kind 0 profiles and kind 1 notes
 *    on `search.nos.today`, `nostr.wine`, and `relay.nostr.band`. Notes are
 *    used to discover authors whose profiles aren't directly indexed; their
 *    profiles are then batch-fetched from the pool.
 * 2. **NIP-05 lookup** — if the query looks like `name@domain`, resolve it
 *    via the NIP-05 `.well-known/nostr.json` endpoint and fetch the profile.
 *    This catches users who aren't indexed by any search relay but have a
 *    verified NIP-05 identifier.
 *
 * Results are sorted by NIP-05 presence, then name relevance, then recency.
 * They carry parsed metadata so callers don't need a second fetch to render
 * the dropdown row.
 */
export function useMentionSearch(query: string) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const nip65ReadRelays = getNip65ReadRelays(config.relayMetadata);

  const trimmed = query.trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;

  return useQuery({
    queryKey: ['mention-search', trimmed.toLowerCase()],
    queryFn: async ({ signal }): Promise<MentionSearchResult[]> => {
      const relays = Array.from(
        new Set([...nip65ReadRelays, ...SEARCH_RELAYS]),
      );

      const abortSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      ]);

      // Strategy 1: NIP-50 relay search for kind 0 profiles and kind 1 notes.
      //   Skipped when the query is a bech32 entity (npub1…/nprofile1…) —
      //   search relays index profile text, not bech32 strings, so the text
      //   search would only return noise. The bech32 path (Strategy 3)
      //   handles those.
      // Strategy 2: NIP-05 lookup if the query looks like name@domain.
      // Strategy 3: bech32 decode + direct profile fetch if the query is an
      //   npub1…/nprofile1… entity, so the user can verify the identity
      //   before inserting the mention.
      const isNip05 = looksLikeNip05(trimmed);
      const isBech32 = looksLikeBech32Entity(trimmed);

      const [relayResults, nip05Result, bech32Result] = await Promise.all([
        // Strategy 1: relay search (skipped for bech32 entities)
        isBech32
          ? Promise.resolve([] as NostrEvent[])
          : (async (): Promise<NostrEvent[]> => {
              const settled = await Promise.allSettled(
                relays.map((url): Promise<NostrEvent[]> => {
                  try {
                    const relay = nostr.relay(url);
                    return relay.query(
                      [
                        { kinds: [0], search: trimmed, limit: 50 },
                        { kinds: [1], search: trimmed, limit: 20 },
                      ],
                      { signal: abortSignal },
                    );
                  } catch {
                    return Promise.resolve([]);
                  }
                }),
              );

              return settled
                .filter(
                  (r): r is PromiseFulfilledResult<NostrEvent[]> =>
                    r.status === 'fulfilled',
                )
                .flatMap((r) => r.value);
            })(),

        // Strategy 2: NIP-05 lookup (only if query looks like name@domain)
        isNip05
          ? lookupNip05(trimmed, nostr, abortSignal)
          : Promise.resolve(null),

        // Strategy 3: bech32 entity decode + profile fetch
        isBech32
          ? lookupBech32Entity(trimmed, nostr, abortSignal)
          : Promise.resolve(null),
      ]);

      // Collect kind 0 profiles and kind 1 author pubkeys.
      const profileEvents = relayResults.filter((e) => e.kind === 0);
      const noteAuthorPubkeys = new Set(
        relayResults.filter((e) => e.kind === 1).map((e) => e.pubkey),
      );

      // For authors discovered via kind 1 notes but without a kind 0 in the
      // search results, batch-fetch their profiles from the pool.
      const knownPubkeys = new Set(profileEvents.map((e) => e.pubkey));
      const missingPubkeys = [...noteAuthorPubkeys].filter(
        (pk) => !knownPubkeys.has(pk),
      );

      let extraProfiles: NostrEvent[] = [];
      if (missingPubkeys.length > 0) {
        try {
          extraProfiles = await nostr.query(
            [{ kinds: [0], authors: missingPubkeys.slice(0, 10), limit: 10 }],
            { signal: abortSignal },
          );
        } catch {
          // pool query failed — proceed with what we have
        }
      }

      // Merge all kind 0 profiles, dedupe by pubkey (newest wins).
      const byPubkey = new Map<string, MentionSearchResult & { _ts: number }>();
      for (const event of [...profileEvents, ...extraProfiles]) {
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event.content);
          const npub = nip19.npubEncode(event.pubkey);
          const existing = byPubkey.get(event.pubkey);
          if (!existing || event.created_at > existing._ts) {
            byPubkey.set(event.pubkey, {
              pubkey: event.pubkey,
              npub,
              name: metadata.name,
              displayName: metadata.display_name,
              picture: metadata.picture,
              nip05: metadata.nip05,
              _ts: event.created_at,
            });
          }
        } catch {
          // skip unparseable kind 0
        }
      }

      // Add NIP-05 result if we got one and it's not already in the results.
      if (nip05Result && !byPubkey.has(nip05Result.pubkey)) {
        byPubkey.set(nip05Result.pubkey, {
          ...nip05Result,
          _ts: 0,
        });
      }

      // Add the bech32 (npub/nprofile) result. This is an explicit identity
      // the user typed in full, so it always wins the sort below — mark it
      // with a far-future timestamp so it sorts ahead of every other entry.
      if (bech32Result) {
        byPubkey.set(bech32Result.pubkey, {
          ...bech32Result,
          _ts: Number.MAX_SAFE_INTEGER,
        });
      }

      // Sort by:
      //   1. Has NIP-05 (verified identity → more trustworthy)
      //   2. Name relevance: exact match > starts with query > contains query > other
      //   3. Profile recency (newer first)
      const q = trimmed.toLowerCase();
      const all = Array.from(byPubkey.values());
      all.sort((a, b) => {
        const aHasNip05 = a.nip05 ? 0 : 1;
        const bHasNip05 = b.nip05 ? 0 : 1;
        if (aHasNip05 !== bHasNip05) return aHasNip05 - bHasNip05;

        const aName = (a.displayName || a.name || '').toLowerCase();
        const bName = (b.displayName || b.name || '').toLowerCase();
        const aScore = aName === q ? 0 : aName.startsWith(q) ? 1 : aName.includes(q) ? 2 : 3;
        const bScore = bName === q ? 0 : bName.startsWith(q) ? 1 : bName.includes(q) ? 2 : 3;
        if (aScore !== bScore) return aScore - bScore;

        return b._ts - a._ts;
      });
      const results = all.map(({ _ts, ...rest }) => rest);
      return results;
    },
    enabled,
    staleTime: 60_000,
    retry: 0,
  });
}
