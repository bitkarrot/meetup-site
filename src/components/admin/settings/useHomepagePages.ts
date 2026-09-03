import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { getMasterPubkey } from '@/lib/relay';
import { type HomepagePage } from './types';

interface UseHomepagePagesOptions {
  enabled?: boolean;
  staleTime?: number;
  /** Admin roles mapping from AppContext — used to filter by publisher pubkeys. */
  adminRoles?: Record<string, 'publisher' | 'user'>;
}

/**
 * Fetches kind 34128 pages flagged as homepage sections.
 * Fetches ALL kind 34128 events and filters client-side because not all
 * relays support arbitrary #tag filters (NIP-12).
 *
 * Deduplicates by path (keeps most recent per path) and filters by
 * author (master pubkey or publishers only).
 */
export function useHomepagePages(options: UseHomepagePagesOptions = {}) {
  const { nostr } = useNostr();
  const { enabled = true, staleTime = 30000, adminRoles = {} } = options;

  return useQuery({
    queryKey: ['homepage-pages', adminRoles],
    queryFn: async () => {
      const signal = AbortSignal.timeout(5000);
      const events = await nostr!.query([
        { kinds: [34128], limit: 200 }
      ], { signal });

      const mp = getMasterPubkey();

      // Filter: must be by master or publisher, AND must have homepage_section tag
      const filtered = events
        .filter(event => {
          const authorPubkey = event.pubkey.toLowerCase().trim();
          if (authorPubkey === mp) return true;
          return adminRoles[authorPubkey] === 'publisher';
        })
        .filter(event => {
          const tags = event.tags || [];
          return tags.some(([name, val]) => name === 'homepage_section' && val === 'true');
        });

      // Deduplicate by path (keep most recent per path)
      const byPath = new Map<string, HomepagePage>();
      for (const event of filtered) {
        const tags = event.tags || [];
        const path = tags.find(([name]) => name === 'd')?.[1] || '';
        if (!path) continue;
        const existing = byPath.get(path);
        if (!existing || event.created_at > existing.created_at) {
          byPath.set(path, {
            id: event.id,
            path,
            content: event.content,
            created_at: event.created_at,
            pubkey: event.pubkey,
          });
        }
      }

      return Array.from(byPath.values()).sort((a, b) => b.created_at - a.created_at);
    },
    enabled: enabled && !!nostr,
    staleTime,
  });
}
