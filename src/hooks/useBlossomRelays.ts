import { useMemo } from 'react';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Derive the effective Blossom server list from site config.
 *
 * Combines explicitly configured `blossomRelays` with the default relay
 * (normalized from ws/wss to http/https), excluding any relays in the
 * `excludedBlossomRelays` list. The default relay is prepended so it's
 * prioritized for uploads.
 *
 * Shared by AdminNotes, AdminMedia (BlossomServerManager, MediaBrowser,
 * MediaUploaderDialog) — previously duplicated 4x across these components.
 */
export function useBlossomRelays(): string[] {
  const { config } = useAppContext();

  return useMemo(() => {
    const storedRelays = config.siteConfig?.blossomRelays || [];
    const excludedRelays = config.siteConfig?.excludedBlossomRelays || [];
    const defaultRelay = config.siteConfig?.defaultRelay;

    const relays = [...storedRelays];

    if (defaultRelay) {
      let normalizedDefault = defaultRelay.replace(/\/$/, '');
      if (normalizedDefault.startsWith('wss://')) {
        normalizedDefault = normalizedDefault.replace('wss://', 'https://');
      } else if (normalizedDefault.startsWith('ws://')) {
        normalizedDefault = normalizedDefault.replace('ws://', 'http://');
      }

      const isExcluded = excludedRelays.includes(normalizedDefault);

      if (
        (normalizedDefault.startsWith('http://') ||
          normalizedDefault.startsWith('https://')) &&
        !relays.includes(normalizedDefault) &&
        !isExcluded
      ) {
        relays.unshift(normalizedDefault);
      }
    }

    return relays;
  }, [
    config.siteConfig?.blossomRelays,
    config.siteConfig?.defaultRelay,
    config.siteConfig?.excludedBlossomRelays,
  ]);
}
