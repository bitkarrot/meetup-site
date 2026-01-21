import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Save, Plus, Trash2, GripVertical, RefreshCw, ShieldAlert, Eye, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  tweakcnThemeUrl?: string;
  updatedAt?: number;
}

const TWEAKCN_THEMES = [
  { name: 'Default', url: 'none' },
  { name: 'Tangerine', url: 'https://tweakcn.com/r/themes/tangerine.json' },
  { name: 'Amethyst Haze', url: 'https://tweakcn.com/r/themes/amethyst-haze.json' },
  { name: 'Midnight Bloom', url: 'https://tweakcn.com/r/themes/midnight-bloom.json' },
  { name: 'Clean Slate', url: 'https://tweakcn.com/r/themes/clean-slate.json' },
  { name: 'Bold Tech', url: 'https://tweakcn.com/r/themes/bold-tech.json' },
];

interface SortableNavItemProps {
  item: NavigationItem;
  onUpdate: (id: string, updates: Partial<NavigationItem>) => void;
  onRemove: (id: string) => void;
}

function SortableNavItem({ item, onUpdate, onRemove }: SortableNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 border rounded-md bg-card"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input
          value={item.name}
          onChange={(e) => onUpdate(item.id, { name: e.target.value })}
          placeholder="Name"
        />
        <Input
          value={item.href}
          onChange={(e) => onUpdate(item.id, { href: e.target.value })}
          placeholder="/path"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onRemove(item.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function AdminSettings() {
  const { config, updateConfig } = useAppContext();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewThemeUrl, setPreviewThemeUrl] = useState<string | null>(null);

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
    tweakcnThemeUrl: config.siteConfig?.tweakcnThemeUrl ?? '',
  }));

  const isDirty = useMemo(() => {
    const originalConfig = config.siteConfig || {};
    const hasConfigChanged = 
      siteConfig.title !== (originalConfig.title ?? 'My Meetup Site') ||
      siteConfig.logo !== (originalConfig.logo ?? '') ||
      siteConfig.favicon !== (originalConfig.favicon ?? '') ||
      siteConfig.ogImage !== (originalConfig.ogImage ?? '') ||
      siteConfig.heroTitle !== (originalConfig.heroTitle ?? 'Welcome to Our Community') ||
      siteConfig.heroSubtitle !== (originalConfig.heroSubtitle ?? 'Join us for amazing meetups and events') ||
      siteConfig.heroBackground !== (originalConfig.heroBackground ?? 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&h=1080&fit=crop') ||
      siteConfig.showEvents !== (originalConfig.showEvents ?? true) ||
      siteConfig.showBlog !== (originalConfig.showBlog ?? true) ||
      siteConfig.maxEvents !== (originalConfig.maxEvents ?? 6) ||
      siteConfig.maxBlogPosts !== (originalConfig.maxBlogPosts ?? 3) ||
      siteConfig.defaultRelay !== (originalConfig.defaultRelay ?? import.meta.env.VITE_DEFAULT_RELAY ?? '') ||
      siteConfig.tweakcnThemeUrl !== (originalConfig.tweakcnThemeUrl ?? '');
    
    const hasNavChanged = JSON.stringify(navigation) !== JSON.stringify(config.navigation || [
      { id: '1', name: 'Home', href: '/', isSubmenu: false },
      { id: '2', name: 'Events', href: '/events', isSubmenu: false },
      { id: '3', name: 'Blog', href: '/blog', isSubmenu: false },
      { id: '4', name: 'About', href: '/about', isSubmenu: false },
      { id: '5', name: 'Contact', href: '/contact', isSubmenu: false },
    ]);

    return hasConfigChanged || hasNavChanged;
  }, [siteConfig, navigation, config]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Handle theme preview
  useEffect(() => {
    const themeToApply = previewThemeUrl ?? siteConfig.tweakcnThemeUrl;
    
    if (!themeToApply) {
      const existingStyle = document.getElementById('tweakcn-theme');
      if (existingStyle && !previewThemeUrl) {
        // Only remove if we're not in preview mode and there's no saved theme
        existingStyle.remove();
      }
      return;
    }

    const fetchTheme = async () => {
      try {
        const response = await fetch(themeToApply);
        if (!response.ok) throw new Error(`Failed to fetch theme: ${response.statusText}`);
        const themeData = await response.json();
        const vars = themeData.cssVars || themeData;

        let cssVars = '';
        const formatVars = (entries: Record<string, string>) => {
          return Object.entries(entries)
            .map(([k, v]) => {
              const varName = k === 'sidebar' ? 'sidebar-background' : k;
              return `--${varName}: ${v};`;
            })
            .join(' ');
        };

        if (vars.light) cssVars += `:root { ${formatVars(vars.light)} }\n`;
        if (vars.dark) cssVars += `.dark { ${formatVars(vars.dark)} }\n`;
        if (vars.theme) cssVars += `:root { ${formatVars(vars.theme)} }\n`;
        if (!vars.light && !vars.dark && !vars.theme) {
          cssVars += `:root { ${formatVars(vars)} }`;
        }

        let styleTag = document.getElementById('tweakcn-theme') as HTMLStyleElement;
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'tweakcn-theme';
          document.head.appendChild(styleTag);
        }
        styleTag.textContent = cssVars;
      } catch (error) {
        console.error('Error applying theme preview:', error);
      }
    };

    fetchTheme();
    
    // Cleanup preview on unmount if it was just a preview
    return () => {
      if (previewThemeUrl) {
        // Re-apply original theme from config if we were previewing
        const originalTheme = siteConfig.tweakcnThemeUrl;
        if (!originalTheme) {
          document.getElementById('tweakcn-theme')?.remove();
        }
      }
    };
  }, [previewThemeUrl, siteConfig.tweakcnThemeUrl]);

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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setNavigation((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

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
          defaultRelay: 'default_relay',
          tweakcnThemeUrl: 'tweakcn_theme_url'
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
        ['tweakcn_theme_url', siteConfig.tweakcnThemeUrl || ''],
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

  const addNavigationItem = () => {
    if (navigation.length >= 5) {
      toast({
        title: "Limit Reached",
        description: "You can only have up to 5 navigation items at the top level.",
        variant: "destructive",
      });
      return;
    }

    const newItem: NavigationItem = {
      id: Date.now().toString(),
      name: 'New Item',
      href: '/new-page',
      isSubmenu: false,
    };
    setNavigation([...navigation, newItem]);
  };

  const removeNavigationItem = (id: string) => {
    setNavigation(navigation.filter(item => item.id !== id));
  };

  const updateNavigationItem = (id: string, updates: Partial<NavigationItem>) => {
    setNavigation(navigation.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

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

      {/* TweakCN Theme Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Site Styling (TweakCN)</CardTitle>
          <CardDescription>
            <a href="https://tweakcn.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">TweakCN</a> is a powerful theme engine that allows you to customize the visual appearance of your site using a simple JSON configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select a Preset Theme</Label>
            <div className="flex gap-2">
              <Select
                value={TWEAKCN_THEMES.find(t => t.url === siteConfig.tweakcnThemeUrl)?.url ?? 'none'}
                onValueChange={(url) => {
                  setSiteConfig(prev => ({ ...prev, tweakcnThemeUrl: url === 'none' ? '' : url }));
                  setPreviewThemeUrl(null); // Clear preview when selection changes
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  {TWEAKCN_THEMES.map((theme) => (
                    <SelectItem key={theme.name} value={theme.url}>
                      {theme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {siteConfig.tweakcnThemeUrl && TWEAKCN_THEMES.some(t => t.url === siteConfig.tweakcnThemeUrl) && (
                <Button 
                  variant="outline" 
                  size="icon"
                  title="Preview Theme"
                  onClick={() => {
                    setPreviewThemeUrl(siteConfig.tweakcnThemeUrl || null);
                    toast({
                      title: "Theme Preview",
                      description: "Previewing selected theme. Save changes to apply permanently.",
                    });
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="customThemeUrl">Custom TweakCN Theme URL</Label>
            <div className="flex gap-2">
              <Input
                id="customThemeUrl"
                value={siteConfig.tweakcnThemeUrl}
                onChange={(e) => {
                  setSiteConfig(prev => ({ ...prev, tweakcnThemeUrl: e.target.value }));
                  setPreviewThemeUrl(null);
                }}
                placeholder="https://tweakcn.com/r/themes/..."
              />
              <div className="flex gap-1">
                {siteConfig.tweakcnThemeUrl && (
                  <Button 
                    variant="outline" 
                    size="icon"
                    title="Preview Custom Theme"
                    onClick={() => {
                      if (siteConfig.tweakcnThemeUrl) {
                        setPreviewThemeUrl(siteConfig.tweakcnThemeUrl);
                        toast({
                          title: "Custom Theme Preview",
                          description: "Previewing custom theme. Save changes to apply permanently.",
                        });
                      }
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                {siteConfig.tweakcnThemeUrl && !TWEAKCN_THEMES.some(t => t.url === siteConfig.tweakcnThemeUrl) && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSiteConfig(prev => ({ ...prev, tweakcnThemeUrl: '' }));
                      setPreviewThemeUrl(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a direct link to a <a href="https://tweakcn.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">TweakCN</a> theme JSON file to apply custom styling.
            </p>
          </div>

          {isDirty && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-md text-sm border border-yellow-200 dark:border-yellow-900/30">
              <AlertCircle className="h-4 w-4" />
              <span>You have unsaved changes. Remember to save before navigating away.</span>
            </div>
          )}
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
              onClick={() => addNavigationItem()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
          
          <div className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={navigation.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {navigation.map((item) => (
                  <SortableNavItem
                    key={item.id}
                    item={item}
                    onUpdate={updateNavigationItem}
                    onRemove={removeNavigationItem}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          
        </CardContent>
      </Card>
    </div>
  );
}