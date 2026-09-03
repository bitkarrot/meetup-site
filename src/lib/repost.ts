/**
 * NIP-18 Repost event builder utilities.
 *
 * Builds kind 6 (repost of kind 1 notes) or kind 16 (generic repost of any
 * other kind) events per the Nostr NIP-18 specification.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/18.md
 */

export interface RepostTarget {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  sig: string; // signature of the original event (required by NIP-18 for embedded content)
  d?: string; // d-tag value for addressable events (30023, 31922, 31923, 30313)
}

export interface RepeatMeta {
  total: number;   // total posts in the series
  index: number;   // 0-indexed position in the series
  intervalMs: number; // milliseconds between posts
}

export interface UnsignedRepostEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/**
 * Determine the repost kind for a given original event kind.
 * Kind 1 notes → kind 6 repost. Everything else → kind 16 generic repost.
 */
export function getRepostKind(originalKind: number): number {
  return originalKind === 1 ? 6 : 16;
}

/**
 * Check if an event kind is addressable (has a d-tag and is replaceable).
 * Addressable events should include an `a` tag in reposts.
 */
function isAddressable(kind: number): boolean {
  return kind === 30023 || kind === 31922 || kind === 31923 || kind === 30313;
}

/**
 * Build an unsigned NIP-18 repost event referencing the given target event.
 *
 * Tags included:
 * - `e` tag with the original event ID and relay URL
 * - `p` tag with the original author's pubkey
 * - `k` tag (kind 16 only) with the original event's kind
 * - `a` tag (addressable events only) with the coordinate kind:pubkey:d-tag
 *
 * Content is the stringified JSON of the original event (recommended by NIP-18).
 */
export function buildRepostEvent(
  target: RepostTarget,
  relayUrl: string,
  createdAt: number,
  repeatMeta?: RepeatMeta,
): UnsignedRepostEvent {
  const repostKind = getRepostKind(target.kind);
  const isGeneric = repostKind === 16;

  const tags: string[][] = [
    ['e', target.id, relayUrl],
    ['p', target.pubkey],
  ];

  if (isGeneric) {
    tags.push(['k', String(target.kind)]);
  }

  if (isAddressable(target.kind) && target.d) {
    tags.push(['a', `${target.kind}:${target.pubkey}:${target.d}`]);
  }

  // Repeat metadata — lets the scheduled posts page show "1 of 3 · ends Jul 27"
  if (repeatMeta && repeatMeta.total > 1) {
    tags.push(['repeat_total', String(repeatMeta.total)]);
    tags.push(['repeat_index', String(repeatMeta.index)]);
    tags.push(['repeat_interval', String(Math.floor(repeatMeta.intervalMs / 1000))]);
  }

  // Embed the full original event JSON in the content (NIP-18 recommendation).
  // Include the signature so other clients can independently verify the event.
  const originalEvent = {
    id: target.id,
    pubkey: target.pubkey,
    kind: target.kind,
    content: target.content,
    tags: target.tags,
    created_at: target.created_at,
    sig: target.sig,
  };

  return {
    kind: repostKind,
    content: JSON.stringify(originalEvent),
    tags,
    created_at: createdAt,
  };
}
