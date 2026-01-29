import { useQuery } from '@tanstack/react-query';

interface NostrJsonResponse {
  names: Record<string, string>;
  relays?: Record<string, string[]>;
  nip46?: Record<string, string[]>;
}

const DEFAULT_NOSTR_JSON_URL = import.meta.env.VITE_REMOTE_NOSTR_JSON_URL || '';

export function useRemoteNostrJson(url: string = DEFAULT_NOSTR_JSON_URL) {
  return useQuery({
    queryKey: ['remote-nostr-json', url],
    queryFn: async () => {
      if (!url) return null;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch nostr.json');
      }
      const data: NostrJsonResponse = await response.json();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useAdminAuth(pubkey?: string) {
  const { data: nostrJson, isLoading } = useRemoteNostrJson();

  const isAdmin = pubkey && nostrJson?.names ?
    Object.values(nostrJson.names).some(pk => pk.toLowerCase().trim() === pubkey.toLowerCase().trim()) : false;

  return {
    isAdmin,
    isLoading,
    allowedPubkeys: nostrJson?.names ? Object.values(nostrJson.names) : [],
  };
}