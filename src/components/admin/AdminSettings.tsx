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
import { Save, Plus, Trash2, GripVertical } from 'lucide-react';

interface NavigationItem {
  id: string;
  label: string;
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
}

export default function AdminSettings() {
  const { updateConfig } = useAppContext();
  const { mutate: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const [isSaving, setIsSaving] = useState(false);

  const [navigation, setNavigation] = useState<NavigationItem[]>([
    { id: '1', label: 'Home', href: '/', isSubmenu: false },
    { id: '2', label: 'Events', href: '/events', isSubmenu: false },
    { id: '3', label: 'Blog', href: '/blog', isSubmenu: false },
    { id: '4', label: 'About', href: '/about', isSubmenu: false },
    { id: '5', label: 'Contact', href: '/contact', isSubmenu: false },
  ]);

  const [siteConfig, setSiteConfig] = useState<SiteConfig>({
    title: 'My Meetup Site',
    logo: '',
    favicon: '',
    ogImage: '',
    heroTitle: 'Welcome to Our Community',
    heroSubtitle: 'Join us for amazing meetups and events',
    heroBackground: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&h=1080&fit=crop',
    showEvents: true,
    showBlog: true,
    maxEvents: 6,
    maxBlogPosts: 3,
    defaultRelay: import.meta.env.VITE_DEFAULT_RELAY,
    publishRelays: import.meta.env.VITE_PUBLISH_RELAYS.split(','),
  });

  // Load existing site configuration from NIP-78 kind 30078
  useEffect(() => {
    const loadExistingConfig = async () => {
      if (!user) return;

      try {
        const signal = AbortSignal.timeout(3000);
        const events = await nostr.query([
          {
            kinds: [30078],
            authors: [user.pubkey],
            '#d': ['nostr-meetup-site-config'],
            limit: 1
          }
        ], { signal });

        if (events.length > 0) {
          const event = events[0];
          const loadedConfig = {
            title: event.tags.find(([name]) => name === 'title')?.[1] || 'My Meetup Site',
            logo: event.tags.find(([name]) => name === 'logo')?.[1] || '',
            favicon: event.tags.find(([name]) => name === 'favicon')?.[1] || '',
            ogImage: event.tags.find(([name]) => name === 'og_image')?.[1] || '',
            heroTitle: event.tags.find(([name]) => name === 'hero_title')?.[1] || 'Welcome to Our Community',
            heroSubtitle: event.tags.find(([name]) => name === 'hero_subtitle')?.[1] || 'Join us for amazing meetups and events',
            heroBackground: event.tags.find(([name]) => name === 'hero_background')?.[1] || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&h=1080&fit=crop',
            showEvents: event.tags.find(([name]) => name === 'show_events')?.[1] === 'true',
            showBlog: event.tags.find(([name]) => name === 'show_blog')?.[1] === 'true',
            maxEvents: parseInt(event.tags.find(([name]) => name === 'max_events')?.[1] || '6'),
            maxBlogPosts: parseInt(event.tags.find(([name]) => name === 'max_blog_posts')?.[1] || '3'),
            defaultRelay: event.tags.find(([name]) => name === 'default_relay')?.[1] || import.meta.env.VITE_DEFAULT_RELAY,
            publishRelays: (() => {
              const relaysTag = event.tags.find(([name]) => name === 'publish_relays')?.[1];
              try {
                return relaysTag ? JSON.parse(relaysTag) : import.meta.env.VITE_PUBLISH_RELAYS.split(',');
              } catch {
                return import.meta.env.VITE_PUBLISH_RELAYS.split(',');
              }
            })(),
          };

          // Also load navigation from content
          let loadedNavigation = [];
          try {
            loadedNavigation = JSON.parse(event.content);
          } catch {
            // Use default navigation
          }

          setSiteConfig(loadedConfig);
          setNavigation(loadedNavigation);
          // Update local app config immediately
          updateConfig((currentConfig) => ({
            ...currentConfig,
            siteConfig: loadedConfig,
            navigation: loadedNavigation,
          }));

          // Clear all query cache to force refresh with new config
          queryClient.clear();
        }
      } catch (error) {
        console.error('Failed to load existing config:', error);
      }
    };

    loadExistingConfig();
  }, [nostr, updateConfig, queryClient, user]);

  // Load existing site configuration


  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      // Save site configuration as a replaceable event (kind 30078) following NIP-78
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
      ];

      createEvent({
        kind: 30078,
        content: JSON.stringify({ navigation }),
        tags: configTags,
      });

      // Update local app config
      updateConfig((currentConfig) => ({
        ...currentConfig,
        siteConfig,
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
      label: 'New Item',
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
        <Button onClick={handleSaveConfig} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
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

      {/* Relay Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Relay Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="defaultRelay">Default Relay (for content)</Label>
            <Input
              id="defaultRelay"
              value={siteConfig.defaultRelay}
              onChange={(e) => setSiteConfig(prev => ({ ...prev, defaultRelay: e.target.value }))}
              placeholder={import.meta.env.VITE_DEFAULT_RELAY}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This relay will be used to read all content for the public site.
            </p>
          </div>
          
          <div>
            <Label htmlFor="publishRelays">Publishing Relays</Label>
            <div className="space-y-2">
              {siteConfig.publishRelays.map((relay, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={relay}
                    onChange={(e) => {
                      const newRelays = [...siteConfig.publishRelays];
                      newRelays[index] = e.target.value;
                      setSiteConfig(prev => ({ ...prev, publishRelays: newRelays }));
                    }}
                    placeholder="wss://relay.example.com"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newRelays = siteConfig.publishRelays.filter((_, i) => i !== index);
                      setSiteConfig(prev => ({ ...prev, publishRelays: newRelays }));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => {
                  setSiteConfig(prev => ({ 
                    ...prev, 
                    publishRelays: [...prev.publishRelays, ''] 
                  }));
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Relay
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              These relays will receive all published content (events, blog posts, etc.).
            </p>
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
                    value={item.label}
                    onChange={(e) => updateNavigationItem(item.id, { label: e.target.value })}
                    placeholder="Label"
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
                        value={item.label}
                        onChange={(e) => updateNavigationItem(item.id, { label: e.target.value })}
                        placeholder="Label"
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