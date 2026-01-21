import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { type AppConfig } from '@/contexts/AppContext';

/**
 * NostrSync - Syncs user's Nostr data
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Currently syncs:
 * - NIP-65 relay list (kind 10002)
 * - Site configuration (kind 30078) from Master User
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();
  const hasSyncedConfig = useRef(false);

  // Sync logged-in user's data (e.g. relays)
  useEffect(() => {
    if (!user) return;

    const syncRelaysFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Only update if the event is newer than our stored data
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([_, url, marker]) => ({
                url,
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }));

            if (fetchedRelays.length > 0) {
              console.log('[NostrSync] Syncing relay list from Nostr:', fetchedRelays);
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays: fetchedRelays,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        console.error('[NostrSync] Failed to sync relays from Nostr:', error);
      }
    };

    syncRelaysFromNostr();
  }, [user, config.relayMetadata.updatedAt, nostr, updateConfig]);

  // Sync site configuration from Master User
  useEffect(() => {
    if (!masterPubkey || hasSyncedConfig.current) return;

    const syncSiteConfigFromMaster = async () => {
      try {
        console.log('[NostrSync] Fetching site config from master:', masterPubkey);
        
        // Get the current default relay from environment variable
        const envDefaultRelay = import.meta.env.VITE_DEFAULT_RELAY;
        
        // Check if the environment variable relay differs from what's in localStorage
        const localStoredRelay = config.siteConfig?.defaultRelay;
        const relayHasChanged = envDefaultRelay && localStoredRelay && envDefaultRelay !== localStoredRelay;
        
        if (relayHasChanged) {
          console.log('[NostrSync] VITE_DEFAULT_RELAY has changed from', localStoredRelay, 'to', envDefaultRelay);
          console.log('[NostrSync] Skipping relay sync and prioritizing environment variable');
          
          // Update config to use the new relay from environment variable
          updateConfig((current) => ({
            ...current,
            siteConfig: {
              ...current.siteConfig,
              defaultRelay: envDefaultRelay,
              updatedAt: Math.floor(Date.now() / 1000),
            },
          }));

          hasSyncedConfig.current = true;
          return;
        }

        const events = await nostr.query(
          [{ 
            kinds: [30078], 
            authors: [masterPubkey], 
            '#d': ['nostr-meetup-site-config'],
            limit: 1 
          }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];
          const loadedConfig: Record<string, string | boolean | number | string[] | Record<string, string> | undefined> = {};
          
          const tags = {
            title: 'title',
            logo: 'logo',
            favicon: 'favicon',
            ogImage: 'og_image',
            heroTitle: 'hero_title',
            heroSubtitle: 'hero_subtitle',
            heroBackground: 'hero_background',
            defaultRelay: 'default_relay',
            tweakcnThemeUrl: 'tweakcn_theme_url'
          };

          const eventTags = event.tags || [];

          Object.entries(tags).forEach(([key, tagName]) => {
            const val = eventTags.find(([name]) => name === tagName)?.[1];
            if (val !== undefined) loadedConfig[key] = val;
          });

          const updatedAtTag = eventTags.find(([name]) => name === 'updated_at')?.[1];
          const eventUpdatedAt = updatedAtTag ? parseInt(updatedAtTag) : event.created_at;

          // Check if relay from Nostr event differs from environment variable
          const relayFromEvent = loadedConfig.defaultRelay as string | undefined;
          const eventRelayDiffersFromEnv = envDefaultRelay && relayFromEvent && envDefaultRelay !== relayFromEvent;
          
          if (eventRelayDiffersFromEnv) {
            console.log('[NostrSync] Relay in Nostr event', relayFromEvent, 'differs from VITE_DEFAULT_RELAY', envDefaultRelay);
            console.log('[NostrSync] Prioritizing environment variable over relay data');
            
            // Override the relay from the event with the environment variable
            loadedConfig.defaultRelay = envDefaultRelay;
          }

          // Only update if the event is newer than our current local site config
          if (config.siteConfig?.updatedAt && eventUpdatedAt <= config.siteConfig.updatedAt) {
            console.log('[NostrSync] Stored local config is newer or same as master event, skipping sync');
            hasSyncedConfig.current = true;
            return;
          }

          // Handle booleans and numbers
          const showEvents = eventTags.find(([name]) => name === 'show_events')?.[1];
          if (showEvents !== undefined) loadedConfig.showEvents = showEvents === 'true';
          
          const showBlog = eventTags.find(([name]) => name === 'show_blog')?.[1];
          if (showBlog !== undefined) loadedConfig.showBlog = showBlog === 'true';
          
          const maxEvents = eventTags.find(([name]) => name === 'max_events')?.[1];
          if (maxEvents !== undefined) loadedConfig.maxEvents = parseInt(maxEvents);
          
          const maxBlogPosts = eventTags.find(([name]) => name === 'max_blog_posts')?.[1];
          if (maxBlogPosts !== undefined) loadedConfig.maxBlogPosts = parseInt(maxBlogPosts);

          const relaysTag = eventTags.find(([name]) => name === 'publish_relays')?.[1];
          if (relaysTag) {
            try {
              const parsed = JSON.parse(relaysTag);
              if (Array.isArray(parsed)) loadedConfig.publishRelays = parsed;
            } catch (e) {
              console.warn('[NostrSync] Failed to parse publish_relays', e);
            }
          }

          const adminRolesTag = eventTags.find(([name]) => name === 'admin_roles')?.[1];
          if (adminRolesTag) {
            try {
              const parsed = JSON.parse(adminRolesTag);
              if (parsed && typeof parsed === 'object') loadedConfig.adminRoles = parsed as Record<string, string>;
            } catch (e) {
              console.warn('[NostrSync] Failed to parse admin_roles', e);
            }
          }

          // Load navigation from content
          let loadedNavigation: { id: string; name: string; href: string; isSubmenu: boolean; parentId?: string }[] | null = null;
          try {
            const parsedContent = JSON.parse(event.content);
            if (Array.isArray(parsedContent)) {
              loadedNavigation = parsedContent;
            } else if (parsedContent?.navigation && Array.isArray(parsedContent.navigation)) {
              loadedNavigation = parsedContent.navigation;
            }
          } catch (e) {
            console.warn('[NostrSync] Failed to parse navigation content', e);
          }

          console.log('[NostrSync] Successfully fetched master config');
          updateConfig((current) => ({
            ...current,
            siteConfig: {
              ...current.siteConfig,
              ...loadedConfig,
              updatedAt: eventUpdatedAt,
            } as Partial<AppConfig['siteConfig']>,
            ...(loadedNavigation ? { navigation: loadedNavigation } : {}),
          }));
          hasSyncedConfig.current = true;
        }
      } catch (error) {
        console.error('[NostrSync] Failed to sync site config from master:', error);
      }
    };

    syncSiteConfigFromMaster();
  }, [masterPubkey, nostr, updateConfig, config.siteConfig?.updatedAt]);

  return null;
}