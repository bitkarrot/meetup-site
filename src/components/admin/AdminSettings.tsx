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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { useAdminAuth } from '@/hooks/useRemoteNostrJson';
import { AlertTriangle } from 'lucide-react';
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
  isLabelOnly?: boolean;
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
  heroButtons: Array<{
    label: string;
    href: string;
    variant?: 'default' | 'outline';
  }>;
  showEvents: boolean;
  showBlog: boolean;
  feedNpubs: string[];
  feedReadFromPublishRelays: boolean;
  maxEvents: number;
  maxBlogPosts: number;
  defaultRelay: string;
  publishRelays: string[];
  adminRoles: Record<string, 'primary' | 'secondary'>;
  tweakcnThemeUrl?: string;
  sectionOrder?: string[];
  nip19Gateway?: string;
  readOnlyAdminAccess: boolean;
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
  navigation: NavigationItem[];
  onUpdate: (id: string, updates: Partial<NavigationItem>) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function SortableNavItem({ item, navigation, onUpdate, onRemove, disabled }: SortableNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const parentItems = navigation.filter(n => !n.parentId && n.id !== item.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col gap-2 p-3 border rounded-md bg-card",
        item.parentId && "ml-8 border-l-4 border-l-primary/30"
      )}
    >
      <div className="flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            value={item.name}
            onChange={(e) => onUpdate(item.id, { name: e.target.value })}
            placeholder="Name"
            disabled={disabled}
          />
          {!item.isLabelOnly ? (
            <Input
              value={item.href}
              onChange={(e) => onUpdate(item.id, { href: e.target.value })}
              placeholder="/path"
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center px-3 text-sm text-muted-foreground italic border rounded-md bg-muted/50 h-10">
              No link (Label Only)
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 px-2">
          {!item.parentId && (
            <div className="flex items-center gap-2">
              <Label htmlFor={`label-only-${item.id}`} className="text-xs text-muted-foreground whitespace-nowrap">Label Only</Label>
              <Switch
                id={`label-only-${item.id}`}
                checked={item.isLabelOnly}
                onCheckedChange={(checked) => onUpdate(item.id, { isLabelOnly: checked })}
                disabled={disabled}
              />
            </div>
          )}
          {!item.parentId && (
            <Select
              value={item.parentId || "none"}
              onValueChange={(val) => onUpdate(item.id, { parentId: val === "none" ? undefined : val })}
              disabled={disabled}
            >
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="No parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Main Menu</SelectItem>
                {parentItems.map(p => (
                  <SelectItem key={p.id} value={p.id}>Child of {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {item.parentId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(item.id, { parentId: undefined })}
              title="Move to root"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRemove(item.id)}
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SortableSectionProps {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

function SortableSection({ id, title, description, children }: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50")}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2 -mr-2 rounded-md hover:bg-muted text-muted-foreground transition-colors">
            <GripVertical className="h-5 w-5" />
          </div>
        </CardHeader>
        {children}
      </Card>
    </div>
  );
}

export default function AdminSettings() {
  const { config, updateConfig } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
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
      { id: '2', name: 'Events', href: '/events', isSubmenu: false },
      { id: '3', name: 'Blog', href: '/blog', isSubmenu: false },
      { id: '6', name: 'Feed', href: '/feed', isSubmenu: false },
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
    heroButtons: config.siteConfig?.heroButtons ?? [
      { label: 'View Events', href: '/events', variant: 'default' },
      { label: 'Read Blog', href: '/blog', variant: 'outline' },
    ],
    showEvents: config.siteConfig?.showEvents ?? true,
    showBlog: config.siteConfig?.showBlog ?? true,
    feedNpubs: config.siteConfig?.feedNpubs ?? [],
    feedReadFromPublishRelays: config.siteConfig?.feedReadFromPublishRelays ?? false,
    maxEvents: config.siteConfig?.maxEvents ?? 6,
    maxBlogPosts: config.siteConfig?.maxBlogPosts ?? 3,
    defaultRelay: config.siteConfig?.defaultRelay ?? import.meta.env.VITE_DEFAULT_RELAY,
    publishRelays: config.siteConfig?.publishRelays ?? [
      import.meta.env.VITE_DEFAULT_RELAY,
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://nos.lol'
    ].filter(Boolean),
    adminRoles: config.siteConfig?.adminRoles ?? {},
    tweakcnThemeUrl: config.siteConfig?.tweakcnThemeUrl ?? '',
    nip19Gateway: config.siteConfig?.nip19Gateway ?? 'https://nostr.at',
    sectionOrder: config.siteConfig?.sectionOrder ?? ['navigation', 'basic', 'styling', 'hero', 'content'],
    readOnlyAdminAccess: config.siteConfig?.readOnlyAdminAccess ?? false,
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
      JSON.stringify(siteConfig.heroButtons) !== JSON.stringify(originalConfig.heroButtons ?? [
        { label: 'View Events', href: '/events', variant: 'default' },
        { label: 'Read Blog', href: '/blog', variant: 'outline' },
      ]) ||
      siteConfig.showEvents !== (originalConfig.showEvents ?? true) ||
      siteConfig.showBlog !== (originalConfig.showBlog ?? true) ||
      JSON.stringify(siteConfig.feedNpubs) !== JSON.stringify(originalConfig.feedNpubs ?? []) ||
      siteConfig.feedReadFromPublishRelays !== (originalConfig.feedReadFromPublishRelays ?? false) ||
      siteConfig.maxEvents !== (originalConfig.maxEvents ?? 6) ||
      siteConfig.maxBlogPosts !== (originalConfig.maxBlogPosts ?? 3) ||
      siteConfig.defaultRelay !== (originalConfig.defaultRelay ?? import.meta.env.VITE_DEFAULT_RELAY) ||
      siteConfig.tweakcnThemeUrl !== (originalConfig.tweakcnThemeUrl ?? '') ||
      siteConfig.nip19Gateway !== (originalConfig.nip19Gateway ?? 'https://nostr.at') ||
      JSON.stringify(siteConfig.sectionOrder) !== JSON.stringify(originalConfig.sectionOrder ?? ['navigation', 'basic', 'styling', 'hero', 'content']);

    const hasNavChanged = JSON.stringify(navigation) !== JSON.stringify(config.navigation || [
      { id: '2', name: 'Events', href: '/events', isSubmenu: false },
      { id: '3', name: 'Blog', href: '/blog', isSubmenu: false },
      { id: '6', name: 'Feed', href: '/feed', isSubmenu: false },
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

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSiteConfig((prev) => {
        const order = prev.sectionOrder || ['navigation', 'basic', 'styling', 'hero', 'content'];
        const oldIndex = order.indexOf(active.id as string);
        const newIndex = order.indexOf(over.id as string);
        return {
          ...prev,
          sectionOrder: arrayMove(order, oldIndex, newIndex),
        };
      });
    }
  };

  const { isAdmin, isLoading: authLoading } = useAdminAuth(user?.pubkey);
  const canView = isMasterUser || (isAdmin && (siteConfig.readOnlyAdminAccess || config.siteConfig?.readOnlyAdminAccess));

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Checking authorization...</p>
      </div>
    );
  }

  if (!canView) {
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
          tweakcnThemeUrl: 'tweakcn_theme_url',
          nip19Gateway: 'nip19_gateway',
          sectionOrder: 'section_order',
          readOnlyAdminAccess: 'read_only_admin_access'
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

        const readOnlyAdminAccess = eventTags.find(([name]) => name === 'read_only_admin_access')?.[1];
        if (readOnlyAdminAccess !== undefined) loadedConfig.readOnlyAdminAccess = readOnlyAdminAccess === 'true';

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

        const sectionOrderTag = eventTags.find(([name]) => name === 'section_order')?.[1];
        if (sectionOrderTag) {
          try {
            const parsed = JSON.parse(sectionOrderTag);
            if (Array.isArray(parsed)) loadedConfig.sectionOrder = parsed;
          } catch (e) {
            console.error('Failed to parse section_order tag', e);
          }
        }

        const feedNpubsTag = eventTags.find(([name]) => name === 'feed_npubs')?.[1];
        if (feedNpubsTag) {
          try {
            const parsed = JSON.parse(feedNpubsTag);
            if (Array.isArray(parsed)) loadedConfig.feedNpubs = parsed;
          } catch (e) {
            console.error('Failed to parse feed_npubs tag', e);
          }
        }

        const feedReadFromPublishRelays = eventTags.find(([name]) => name === 'feed_read_from_publish_relays')?.[1];
        if (feedReadFromPublishRelays !== undefined) loadedConfig.feedReadFromPublishRelays = feedReadFromPublishRelays === 'true';

        const heroButtonsTag = eventTags.find(([name]) => name === 'hero_buttons')?.[1];
        if (heroButtonsTag) {
          try {
            const parsed = JSON.parse(heroButtonsTag);
            if (Array.isArray(parsed)) loadedConfig.heroButtons = parsed;
          } catch (e) {
            console.error('Failed to parse hero_buttons tag', e);
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
    const filteredRelays = siteConfig.publishRelays.filter(r => r.trim() !== '');

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
        ['hero_buttons', JSON.stringify(siteConfig.heroButtons)],
        ['show_events', siteConfig.showEvents.toString()],
        ['show_blog', siteConfig.showBlog.toString()],
        ['max_events', siteConfig.maxEvents.toString()],
        ['max_blog_posts', siteConfig.maxBlogPosts.toString()],
        ['default_relay', siteConfig.defaultRelay],
        ['publish_relays', JSON.stringify(filteredRelays)],
        ['admin_roles', JSON.stringify(siteConfig.adminRoles)],
        ['feed_npubs', JSON.stringify(siteConfig.feedNpubs)],
        ['feed_read_from_publish_relays', siteConfig.feedReadFromPublishRelays.toString()],
        ['tweakcn_theme_url', siteConfig.tweakcnThemeUrl || ''],
        ['nip19_gateway', siteConfig.nip19Gateway || 'https://nostr.at'],
        ['section_order', JSON.stringify(siteConfig.sectionOrder)],
        ['read_only_admin_access', siteConfig.readOnlyAdminAccess.toString()],
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
          publishRelays: filteredRelays,
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
            Configure your site appearance and navigation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleLoadConfig} disabled={isRefreshing || !user || !isMasterUser}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh from Relay'}
          </Button>
          <Button onClick={handleSaveConfig} disabled={isSaving || !isMasterUser}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {siteConfig.readOnlyAdminAccess && !isMasterUser && (
        <div className="flex items-center gap-2 p-4 border rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-bold">Read Only Mode:</span> You are viewing these settings in demo mode. Changes cannot be saved.
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext
          items={siteConfig.sectionOrder || ['navigation', 'basic', 'styling', 'hero', 'content', 'feed']}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-6">
            {(siteConfig.sectionOrder || ['navigation', 'basic', 'styling', 'hero', 'content', 'feed']).map((sectionId) => {
              switch (sectionId) {
                case 'basic':
                  return (
                    <SortableSection key="basic" id="basic" title="Basic Information">
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="title">Site Title</Label>
                            <Input
                              id="title"
                              value={siteConfig.title}
                              onChange={(e) => setSiteConfig(prev => ({ ...prev, title: e.target.value }))}
                              placeholder="My Meetup Site"
                              disabled={!isMasterUser}
                            />
                          </div>
                          <div>
                            <Label htmlFor="logo">Logo URL</Label>
                            <Input
                              id="logo"
                              value={siteConfig.logo}
                              onChange={(e) => setSiteConfig(prev => ({ ...prev, logo: e.target.value }))}
                              placeholder="https://..."
                              disabled={!isMasterUser}
                            />
                          </div>
                          <div>
                            <Label htmlFor="favicon">Favicon URL</Label>
                            <Input
                              id="favicon"
                              value={siteConfig.favicon}
                              onChange={(e) => setSiteConfig(prev => ({ ...prev, favicon: e.target.value }))}
                              placeholder="https://..."
                              disabled={!isMasterUser}
                            />
                          </div>
                          <div>
                            <Label htmlFor="ogImage">Open Graph Image URL</Label>
                            <Input
                              id="ogImage"
                              value={siteConfig.ogImage}
                              onChange={(e) => setSiteConfig(prev => ({ ...prev, ogImage: e.target.value }))}
                              placeholder="https://..."
                              disabled={!isMasterUser}
                            />
                          </div>
                          <div>
                            <Label htmlFor="nip19Gateway">NIP-19 Gateway URL</Label>
                            <Select
                              value={siteConfig.nip19Gateway || 'https://nostr.at'}
                              onValueChange={(val) => setSiteConfig(prev => ({ ...prev, nip19Gateway: val }))}
                              disabled={!isMasterUser}
                            >
                              <SelectTrigger id="nip19Gateway">
                                <SelectValue placeholder="Select a gateway" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="https://nostr.at">nostr.at</SelectItem>
                                <SelectItem value="https://njump.me">njump.me</SelectItem>
                                <SelectItem value="https://nostr.ae">nostr.ae</SelectItem>
                                <SelectItem value="https://nostr.eu">nostr.eu</SelectItem>
                                <SelectItem value="https://primal.net">primal.net</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              External gateway used for viewing Nostr identifiers (npub, note, etc.).
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </SortableSection>
                  );
                case 'styling':
                  return (
                    <SortableSection
                      key="styling"
                      id="styling"
                      title="Site Styling (TweakCN)"
                      description="TweakCN is a powerful theme engine that allows you to customize the visual appearance of your site using a simple JSON configuration."
                    >
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
                              disabled={!isMasterUser}
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
                              disabled={!isMasterUser}
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
                    </SortableSection>
                  );
                case 'hero':
                  return (
                    <SortableSection key="hero" id="hero" title="Hero Section">
                      <CardContent className="space-y-4">
                        <div>
                          <Label htmlFor="heroTitle">Hero Title</Label>
                          <Input
                            id="heroTitle"
                            value={siteConfig.heroTitle}
                            onChange={(e) => setSiteConfig(prev => ({ ...prev, heroTitle: e.target.value }))}
                            placeholder="Welcome to Our Community"
                            disabled={!isMasterUser}
                          />
                        </div>
                        <div>
                          <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
                          <Input
                            id="heroSubtitle"
                            value={siteConfig.heroSubtitle}
                            onChange={(e) => setSiteConfig(prev => ({ ...prev, heroSubtitle: e.target.value }))}
                            placeholder="Join us for amazing meetups and events"
                            disabled={!isMasterUser}
                          />
                        </div>
                        <div>
                          <Label htmlFor="heroBackground">Hero Background Image URL</Label>
                          <Input
                            id="heroBackground"
                            value={siteConfig.heroBackground}
                            onChange={(e) => setSiteConfig(prev => ({ ...prev, heroBackground: e.target.value }))}
                            placeholder="https://..."
                            disabled={!isMasterUser}
                          />
                        </div>
                      </CardContent>
                    </SortableSection>
                  );
                case 'content':
                  return (
                    <SortableSection key="content" id="content" title="Content Display">
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Show Events on Homepage</Label>
                            <p className="text-sm text-muted-foreground">Display upcoming events on the home page</p>
                          </div>
                          <Switch
                            checked={siteConfig.showEvents}
                            onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, showEvents: checked }))}
                            disabled={!isMasterUser}
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
                            disabled={!isMasterUser}
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
                              disabled={!isMasterUser}
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
                              disabled={!isMasterUser}
                            />
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <Label>Hero Buttons</Label>
                              <p className="text-sm text-muted-foreground">Configure buttons displayed in the hero section</p>
                            </div>
                          </div>

                          {siteConfig.heroButtons.map((button, index) => (
                            <div key={index} className="mb-4 p-4 border rounded-md space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Button {index + 1}</span>
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`enable-button-${index}`} className="text-xs text-muted-foreground">Enabled</Label>
                                  <Switch
                                    id={`enable-button-${index}`}
                                    checked={button.label !== '' && button.href !== ''}
                                    onCheckedChange={(checked) => {
                                      const newButtons = [...siteConfig.heroButtons];
                                      if (!checked) {
                                        newButtons[index] = { ...button, label: '', href: '' };
                                      } else {
                                        newButtons[index] = { ...button, label: `Button ${index + 1}`, href: '/' };
                                      }
                                      setSiteConfig(prev => ({ ...prev, heroButtons: newButtons }));
                                    }}
                                    disabled={!isMasterUser}
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <Label htmlFor={`button-label-${index}`} className="text-xs">Button Label</Label>
                                  <Input
                                    id={`button-label-${index}`}
                                    value={button.label}
                                    onChange={(e) => {
                                      const newButtons = [...siteConfig.heroButtons];
                                      newButtons[index] = { ...button, label: e.target.value };
                                      setSiteConfig(prev => ({ ...prev, heroButtons: newButtons }));
                                    }}
                                    placeholder="View Events"
                                    disabled={!isMasterUser || (button.label === '' && button.href === '')}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`button-href-${index}`} className="text-xs">Button Link</Label>
                                  <Input
                                    id={`button-href-${index}`}
                                    value={button.href}
                                    onChange={(e) => {
                                      const newButtons = [...siteConfig.heroButtons];
                                      newButtons[index] = { ...button, href: e.target.value };
                                      setSiteConfig(prev => ({ ...prev, heroButtons: newButtons }));
                                    }}
                                    placeholder="/events"
                                    disabled={!isMasterUser || (button.label === '' && button.href === '')}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`button-variant-${index}`} className="text-xs">Button Style</Label>
                                  <Select
                                    value={button.variant || 'default'}
                                    onValueChange={(val: 'default' | 'outline') => {
                                      const newButtons = [...siteConfig.heroButtons];
                                      newButtons[index] = { ...button, variant: val };
                                      setSiteConfig(prev => ({ ...prev, heroButtons: newButtons }));
                                    }}
                                    disabled={!isMasterUser || (button.label === '' && button.href === '')}
                                  >
                                    <SelectTrigger id={`button-variant-${index}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="default">Default (Filled)</SelectItem>
                                      <SelectItem value="outline">Outline</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </SortableSection>
                  );
                case 'navigation':
                  return (
                    <SortableSection key="navigation" id="navigation" title="Navigation Menu">
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label>Main Navigation</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isMasterUser}
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
                                  navigation={navigation}
                                  onUpdate={updateNavigationItem}
                                  onRemove={removeNavigationItem}
                                  disabled={!isMasterUser}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                        </div>
                      </CardContent>
                    </SortableSection>
                  );
                default:
                  return null;
              }
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}