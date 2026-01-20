import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Save, Plus, Trash2, GripVertical, RefreshCw, ShieldAlert } from 'lucide-react';

interface NavigationItem {
  id: string;
  name: string;
  href: string;
  isSubmenu: boolean;
  parentId?: string;
}

interface SiteConfig {
  title: string;
  logo: string;
  favicon: string;
  ogImage: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBackground: string;
  showEvents: boolean;
  showBlog: boolean;
  maxEvents: number;
  maxBlogPosts: number;
  defaultRelay: string;
  publishRelays: string[];
  adminRoles: Record<string, 'primary' | 'secondary'>;
  updatedAt?: number;
}

export default function AdminSettings() {
  const { config, updateConfig } = useAppContext();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();
  const isMasterUser = user?.pubkey.toLowerCase().trim() === masterPubkey;

  const [navigation, setNavigation] = useState<NavigationItem[]>(() => 
    config.navigation ?? [
      { id: '1', name: 'Home', href: '/', isSubmenu: false },
      { id: '2', name: 'Events', href: '/events', isSubmenu: false },
      { id: '3', name: 'Blog', href: '/blog', isSubmenu: false },
      { id: '4', name: 'About', href: '/about', isSubmenu: false },
      { id: '5', name: 'Contact', href: '/contact', isSubmenu: false },
    ]
  );

  const [siteConfig, setSiteConfig] = useState<SiteConfig>(() => ({
    title: config.siteConfig?.title ?? 'My Meetup Site',
    logo: config.siteConfig?.logo ?? '',
    favicon: config.siteConfig?.favicon ?? '',
    ogImage: config.siteConfig?.ogImage ?? '',
    heroTitle: config.siteConfig?.heroTitle ?? 'Welcome to Our Community',
    heroSubtitle: config.siteConfig?.heroSubtitle ?? 'Join us for amazing meetups and events',
    heroBackground: config.siteConfig?.heroBackground ?? 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&h=1080&fit=crop',
    showEvents: config.siteConfig?.showEvents ?? true,
    showBlog: config.siteConfig?.showBlog ?? true,
    maxEvents: config.siteConfig?.maxEvents ?? 6,
    maxBlogPosts: config.siteConfig?.maxBlogPosts ?? 3,
    defaultRelay: config.siteConfig?.defaultRelay ?? import.meta.env.VITE_DEFAULT_RELAY ?? '',
    publishRelays: config.siteConfig?.publishRelays ?? Array.from(
      (import.meta.env.VITE_PUBLISH_RELAYS || '').split(',').filter(Boolean)
    ),
    adminRoles: config.siteConfig?.adminRoles ?? {},
  }));

  // Sync state with config when it changes (e.g. after loading from localStorage or Relay)
  // but only if we're not currently saving or refreshing to avoid overwriting user input
  useEffect(() => {
    if (isSaving || isRefreshing) {
      console.log('[AdminSettings] Skipping sync because isSaving/isRefreshing is true');
      return;
    }

    if (config.siteConfig) {
      console.log('[AdminSettings] Syncing form state with updated config:', config.siteConfig);
      setSiteConfig(prev => ({
        ...prev,
        ...config.siteConfig,
        // Ensure arrays are handled correctly if partial
        publishRelays: config.siteConfig?.publishRelays ?? prev.publishRelays,
        adminRoles: config.siteConfig?.adminRoles ?? prev.adminRoles,
      }) as SiteConfig);
    }
    if (config.navigation) {
      setNavigation(config.navigation);
    }
  }, [config.siteConfig, config.navigation, isSaving, isRefreshing]);

  if (!isMasterUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">
          Only the Master User can access site settings.
        </p>
      </div>
    );
  }

  // Load existing site configuration from NIP-78 kind 30078
  const handleLoadConfig = async () => {
    setIsRefreshing(true);

    try {
      const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();
      const signal = AbortSignal.timeout(5000);
      const events = await nostr.query([
        {
          kinds: [30078],
          authors: [masterPubkey],
          '#d': ['nostr-meetup-site-config'],
          limit: 1
        }
      ], { signal });

      if (events.length > 0) {
        const event = events[0];
        const loadedConfig: Partial<SiteConfig> = {};
        
        const tags = {
          title: 'title',
          logo: 'logo',
          favicon: 'favicon',
          ogImage: 'og_image',
          heroTitle: 'hero_title',
          heroSubtitle: 'hero_subtitle',
          heroBackground: 'hero_background',
          defaultRelay: 'default_relay'
        };

        const eventTags = event.tags || [];

        Object.entries(tags).forEach(([key, tagName]) => {
          const val = eventTags.find(([name]) => name === tagName)?.[1];
          if (val !== undefined) {
            (loadedConfig as Record<string, string | boolean | number | string[] | Record<string, string> | undefined>)[key] = val;
          }
        });

        const updatedAtTag = eventTags.find(([name]) => name === 'updated_at')?.[1];
        const eventUpdatedAt = updatedAtTag ? parseInt(updatedAtTag) : event.created_at;
        loadedConfig.updatedAt = eventUpdatedAt;

        // Handle booleans and numbers separately
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
            console.error('Failed to parse publish_relays tag', e);
          }
        }

        const adminRolesTag = eventTags.find(([name]) => name === 'admin_roles')?.[1];
        if (adminRolesTag) {
          try {
            const parsed = JSON.parse(adminRolesTag);
            if (parsed && typeof parsed === 'object') loadedConfig.adminRoles = parsed;
          } catch (e) {
            console.error('Failed to parse admin_roles tag', e);
          }
        }

        // Also load navigation from content
        let loadedNavigation: NavigationItem[] = [];
        try {
          const parsedContent = JSON.parse(event.content);
          if (Array.isArray(parsedContent)) {
            loadedNavigation = parsedContent;
          } else if (parsedContent && typeof parsedContent === 'object' && Array.isArray(parsedContent.navigation)) {
            loadedNavigation = parsedContent.navigation;
          }
        } catch {
          // Use default navigation
        }

        setSiteConfig(prev => ({
          ...prev,
          ...loadedConfig
        }) as SiteConfig);
        setNavigation(loadedNavigation);
        
        // Update local app config immediately
        updateConfig((currentConfig) => ({
          ...currentConfig,
          siteConfig: {
            ...(currentConfig.siteConfig || {}),
            ...loadedConfig,
            updatedAt: eventUpdatedAt,
          },
          navigation: loadedNavigation,
        }));

        // Clear all query cache to force refresh with new config
        queryClient.clear();
      }
    } catch (error) {
      console.error('Failed to load existing config:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      // Save site configuration as a replaceable event (kind 30078) following NIP-78
      console.log('Saving config to Nostr and local context...', siteConfig);
      const configTags = [
        ['d', 'nostr-meetup-site-config'],
        ['title', siteConfig.title],
        ['logo', siteConfig.logo],
        ['favicon', siteConfig.favicon],
        ['og_image', siteConfig.ogImage],
        ['hero_title', siteConfig.heroTitle],
        ['hero_subtitle', siteConfig.heroSubtitle],
        ['hero_background', siteConfig.heroBackground],
        ['show_events', siteConfig.showEvents.toString()],
        ['show_blog', siteConfig.showBlog.toString()],
        ['max_events', siteConfig.maxEvents.toString()],
        ['max_blog_posts', siteConfig.maxBlogPosts.toString()],
        ['default_relay', siteConfig.defaultRelay],
        ['publish_relays', JSON.stringify(siteConfig.publishRelays)],
        ['admin_roles', JSON.stringify(siteConfig.adminRoles)],
        ['updated_at', Math.floor(Date.now() / 1000).toString()],
      ];

      publishEvent({
        event: {
          kind: 30078,
          content: JSON.stringify({ navigation }),
          tags: configTags,
        }
      });

      // Update local app config
      console.log('Updating AppContext with:', siteConfig);
      updateConfig((currentConfig) => ({
        ...currentConfig,
        siteConfig: {
          ...(currentConfig.siteConfig || {}),
          ...siteConfig,
          updatedAt: Math.floor(Date.now() / 1000),
        },
        navigation,
      }));

      // Clear all query cache to force refresh with new config
      queryClient.clear();
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addNavigationItem = (isSubmenu: boolean = false, parentId?: string) => {
    const newItem: NavigationItem = {
      id: Date.now().toString(),
      name: 'New Item',
      href: '/new-page',
      isSubmenu,
      parentId,
    };
    setNavigation([...navigation, newItem]);
  };

  const removeNavigationItem = (id: string) => {
    setNavigation(navigation.filter(item => item.id !== id));
    // Also remove submenus
    setNavigation(prev => prev.filter(item => item.parentId !== id));
  };

  const updateNavigationItem = (id: string, updates: Partial<NavigationItem>) => {
    setNavigation(navigation.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const mainNavigation = navigation.filter(item => !item.isSubmenu);
  const subNavigation = navigation.filter(item => item.isSubmenu);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Site Settings</h2>
          <p className="text-muted-foreground">
            Configure your meetup site appearance and navigation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleLoadConfig} disabled={isRefreshing || !user}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh from Relay'}
          </Button>
          <Button onClick={handleSaveConfig} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Basic Site Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Site Title</Label>
              <Input
                id="title"
                value={siteConfig.title}
                onChange={(e) => setSiteConfig(prev => ({ ...prev, title: e.target.value }))}
                placeholder="My Meetup Site"
              />
            </div>
            <div>
              <Label htmlFor="logo">Logo URL</Label>
              <Input
                id="logo"
                value={siteConfig.logo}
                onChange={(e) => setSiteConfig(prev => ({ ...prev, logo: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="favicon">Favicon URL</Label>
              <Input
                id="favicon"
                value={siteConfig.favicon}
                onChange={(e) => setSiteConfig(prev => ({ ...prev, favicon: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="ogImage">Open Graph Image URL</Label>
              <Input
                id="ogImage"
                value={siteConfig.ogImage}
                onChange={(e) => setSiteConfig(prev => ({ ...prev, ogImage: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero Section Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Hero Section</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="heroTitle">Hero Title</Label>
            <Input
              id="heroTitle"
              value={siteConfig.heroTitle}
              onChange={(e) => setSiteConfig(prev => ({ ...prev, heroTitle: e.target.value }))}
              placeholder="Welcome to Our Community"
            />
          </div>
          <div>
            <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
            <Input
              id="heroSubtitle"
              value={siteConfig.heroSubtitle}
              onChange={(e) => setSiteConfig(prev => ({ ...prev, heroSubtitle: e.target.value }))}
              placeholder="Join us for amazing meetups and events"
            />
          </div>
          <div>
            <Label htmlFor="heroBackground">Hero Background Image URL</Label>
            <Input
              id="heroBackground"
              value={siteConfig.heroBackground}
              onChange={(e) => setSiteConfig(prev => ({ ...prev, heroBackground: e.target.value }))}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Content Display Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Content Display</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Events on Homepage</Label>
              <p className="text-sm text-muted-foreground">Display upcoming events on the home page</p>
            </div>
            <Switch
              checked={siteConfig.showEvents}
              onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, showEvents: checked }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Blog Posts on Homepage</Label>
              <p className="text-sm text-muted-foreground">Display recent blog posts on home page</p>
            </div>
            <Switch
              checked={siteConfig.showBlog}
              onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, showBlog: checked }))}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="maxEvents">Maximum Events to Show</Label>
              <Input
                id="maxEvents"
                type="number"
                value={siteConfig.maxEvents}
                onChange={(e) => setSiteConfig(prev => ({ ...prev, maxEvents: parseInt(e.target.value) || 6 }))}
                min="1"
                max="20"
              />
            </div>
            <div>
              <Label htmlFor="maxBlogPosts">Maximum Blog Posts to Show</Label>
              <Input
                id="maxBlogPosts"
                type="number"
                value={siteConfig.maxBlogPosts}
                onChange={(e) => setSiteConfig(prev => ({ ...prev, maxBlogPosts: parseInt(e.target.value) || 3 }))}
                min="1"
                max="20"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Navigation Menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Main Navigation</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNavigationItem(false)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
          
          <div className="space-y-4">
            {mainNavigation.map((item) => (
              <div key={item.id} className="flex items-center gap-2 p-3 border rounded-md">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    value={item.name}
                    onChange={(e) => updateNavigationItem(item.id, { name: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    value={item.href}
                    onChange={(e) => updateNavigationItem(item.id, { href: e.target.value })}
                    placeholder="/path"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addNavigationItem(true, item.id)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeNavigationItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          
          {subNavigation.length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-2">Submenu Items</div>
                {subNavigation.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-3 border rounded-md ml-6">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        value={item.name}
                        onChange={(e) => updateNavigationItem(item.id, { name: e.target.value })}
                        placeholder="Name"
                      />
                      <Input
                        value={item.href}
                        onChange={(e) => updateNavigationItem(item.id, { href: e.target.value })}
                        placeholder="/path"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeNavigationItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}