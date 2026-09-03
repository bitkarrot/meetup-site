/**
 * Shared nip19 helpers for decoding/encoding Nostr event references.
 *
 * Used by `NostrEventEmbed`, `EventPickerDialog`, and `ShareAsNoteDialog` to
 * avoid duplicating the decode-to-filter and encode-event logic.
 */

import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/**
 * Result of decoding a nip19 identifier into a relay query filter.
 * `filter` is null if the identifier type isn't queryable (e.g. npub, nrelay).
 */
export interface DecodedEventFilter {
  filter: NostrFilter | null;
  /** Relay URLs embedded in the nip19 entity (nevent/naddr relays field). */
  relayHints: string[];
  /** Stable cache key for the decoded identifier. */
  decodedId: string;
  /** Author pubkey if available (for outbox relay discovery). */
  authorPubkey: string | undefined;
}

/**
 * Decode a nip19 identifier (note1, nevent1, naddr1) into a Nostr relay
 * filter suitable for `queryWithNip65Fanout`.
 *
 * Non-event types (npub, nprofile, nrelay) return `filter: null` since they
 * don't reference a fetchable event.
 */
export function decodeEventFilter(identifier: string): DecodedEventFilter {
  try {
    const decoded = nip19.decode(identifier);

    if (decoded.type === 'note') {
      return {
        filter: { ids: [decoded.data] },
        relayHints: [],
        decodedId: decoded.data,
        authorPubkey: undefined,
      };
    }

    if (decoded.type === 'nevent') {
      return {
        filter: { ids: [decoded.data.id] },
        relayHints: decoded.data.relays ?? [],
        decodedId: decoded.data.id,
        authorPubkey: decoded.data.author,
      };
    }

    if (decoded.type === 'naddr') {
      return {
        filter: {
          authors: [decoded.data.pubkey],
          kinds: [decoded.data.kind],
          '#d': [decoded.data.identifier],
        },
        relayHints: decoded.data.relays ?? [],
        decodedId: `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`,
        authorPubkey: decoded.data.pubkey,
      };
    }

    return { filter: null, relayHints: [], decodedId: '', authorPubkey: undefined };
  } catch {
    return { filter: null, relayHints: [], decodedId: '', authorPubkey: undefined };
  }
}

/**
 * Check if a Nostr event kind is addressable (parameterized replaceable)
 * per NIP-01: kinds 30000–39999, addressed by kind:pubkey:d-tag.
 */
export function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/**
 * Encode an event as the appropriate nip19 identifier for embedding.
 *
 * Addressable events (kinds 30000–39999 with a d-tag) → `naddr`.
 * Everything else → `nevent` with author + optional relay hint.
 *
 * Used by `EventPickerDialog` and `ShareAsNoteDialog` to produce consistent
 * embed references.
 */
export function encodeEventRef(
  event: { id: string; pubkey: string; kind: number; tags: string[][] },
  relayHint?: string,
): string {
  const relays = relayHint ? [relayHint] : [];
  const dTag = event.tags.find(([t]) => t === 'd')?.[1];

  if (isAddressableKind(event.kind) && dTag) {
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: dTag,
      relays,
    });
  }

  return nip19.neventEncode({
    id: event.id,
    kind: event.kind,
    author: event.pubkey,
    relays,
  });
}

/**
 * Resolve an arbitrary author identifier (npub, nprofile, or hex pubkey)
 * to a raw hex pubkey string. Returns undefined if the input isn't a valid
 * pubkey identifier.
 */
export function resolvePubkey(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch { /* not a nip19 entity */ }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  return undefined;
}

/**
 * Get a display title for an event: the `title` tag for articles, or a
 * cleaned content snippet for notes and other kinds.
 */
export function eventDisplayTitle(event: NostrEvent): string {
  const title = event.tags.find(([t]) => t === 'title')?.[1];
  if (title) return title;
  const clean = event.content.replace(/[*#>`\n]/g, ' ').trim();
  return clean.length > 80 ? clean.slice(0, 80) + '…' : clean || `Kind ${event.kind}`;
}
