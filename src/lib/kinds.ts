// Shared Nostr kind metadata used by the Relay Explorer and My Activity card.

export interface KindCategory {
  label: string;
  kinds: number[];
}

export const KIND_CATEGORIES: KindCategory[] = [
  { label: 'Notes', kinds: [1] },
  { label: 'Reposts', kinds: [6, 16] },
  { label: 'Articles', kinds: [30023, 31234] },
];

export const KNOWN_KIND_NAMES: Record<number, string> = {
  0: 'User Metadata',
  1: 'Short Text Note',
  3: 'Follow List',
  4: 'Encrypted DM',
  5: 'Event Deletion',
  6: 'Repost',
  7: 'Reaction',
  8: 'Badge Award',
  9: 'Chat Message',
  14: 'Direct Message',
  15: 'File Message',
  16: 'Generic Repost',
  20: 'Picture',
  21: 'Video',
  22: 'Short Video',
  40: 'Channel Creation',
  41: 'Channel Metadata',
  42: 'Channel Message',
  1111: 'Comment',
  1311: 'Live Activities',
  1984: 'Report',
  1985: 'Label',
  9802: 'Highlight',
  10000: 'Mute List',
  10001: 'Pinned Notes',
  10002: 'Relay List',
  10003: 'Bookmarks',
  10050: 'DM Relays',
  1063: 'File Metadata',
  30000: 'Follow Sets',
  30023: 'Long-form Content',
  30078: 'App Data',
  31234: 'Draft Event',
  31922: 'Date Calendar Event',
  31923: 'Time Calendar Event',
  9734: 'Zap Request',
  9735: 'Zap Receipt',
};

export function kindLabel(kind: number): string {
  return KNOWN_KIND_NAMES[kind] || `Kind ${kind}`;
}

export interface CategorizedKind {
  label: string;
  count: number;
  kinds: { kind: number; count: number }[];
}

/**
 * Group raw kind counts into named categories (Notes, Reposts, Articles, Other).
 * Unmatched kinds fall into "Other". Results are sorted by count descending.
 */
export function categorizeKinds(byKind: Record<string, number>): CategorizedKind[] {
  const allKinds = Object.entries(byKind).map(([k, v]) => ({ kind: parseInt(k), count: v }));
  const categorized = new Set<number>();
  const result: CategorizedKind[] = [];

  for (const cat of KIND_CATEGORIES) {
    const matching = allKinds
      .filter(k => cat.kinds.includes(k.kind))
      .sort((a, b) => b.count - a.count);
    if (matching.length > 0) {
      matching.forEach(m => categorized.add(m.kind));
      result.push({
        label: cat.label,
        count: matching.reduce((sum, m) => sum + m.count, 0),
        kinds: matching,
      });
    }
  }

  // "Other" category for everything not matched
  const other = allKinds.filter(k => !categorized.has(k.kind)).sort((a, b) => b.count - a.count);
  if (other.length > 0) {
    result.push({
      label: 'Other',
      count: other.reduce((sum, m) => sum + m.count, 0),
      kinds: other,
    });
  }

  return result.sort((a, b) => b.count - a.count);
}
