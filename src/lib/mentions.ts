import { nip19 } from 'nostr-tools';

/**
 * Extract all `nostr:npub1...` mentions from content as NIP-10 `p` tags.
 * Dedupes by pubkey. Used by every editor's publish path so mentions are
 * relay-correct regardless of how the content was authored.
 */
export function extractPTags(content: string): string[][] {
  const re = /nostr:(npub1[023456789acdefghjklmnpqrstuvwxyz]+)/gi;
  const seen = new Set<string>();
  const tags: string[][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    try {
      const { type, data } = nip19.decode(m[1]);
      if (type === 'npub' && typeof data === 'string' && !seen.has(data)) {
        seen.add(data);
        tags.push(['p', data]);
      }
    } catch {
      // ignore malformed bech32
    }
  }
  return tags;
}
