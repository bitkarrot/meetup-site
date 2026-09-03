import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles } from 'lucide-react';
import { type SiteConfig, type NavigationItem } from './types';

interface Preset {
  name: string;
  description: string;
  siteConfig: Partial<SiteConfig>;
  navigation?: NavigationItem[];
}

const PRESETS: Preset[] = [
  {
    name: 'Meetup Site',
    description: 'Events-focused community with blog and feed',
    siteConfig: {
      title: 'My Meetup Site',
      heroTitle: 'Welcome to Our Community',
      heroSubtitle: 'Join us for amazing meetups and events',
      heroBackgroundType: 'none',
      heroTextColor: '#000000',
      showEvents: true,
      showBlog: true,
      showFeed: false,
      maxEvents: 6,
      maxBlogPosts: 3,
      heroButtons: [
        { label: 'View Events', href: '/events', variant: 'default' },
        { label: 'Read Blog', href: '/blog', variant: 'outline' },
        { label: '', href: '', variant: 'outline' },
      ],
      homepageSectionOrder: ['hero', 'events', 'blog', 'feed'],
    },
    navigation: [
      { id: '2', name: 'Events', href: '/events', isSubmenu: false },
      { id: '3', name: 'Blog', href: '/blog', isSubmenu: false },
      { id: '4', name: 'About', href: '/about', isSubmenu: false },
    ],
  },
  {
    name: 'Blog-Focused',
    description: 'Content-first site with events secondary',
    siteConfig: {
      title: 'My Blog',
      heroTitle: 'Ideas & Stories',
      heroSubtitle: 'Thoughts from our community',
      heroBackgroundType: 'none',
      heroTextColor: '#000000',
      showEvents: false,
      showBlog: true,
      showFeed: true,
      maxBlogPosts: 6,
      maxFeedNotes: 5,
      heroButtons: [
        { label: 'Read Posts', href: '/blog', variant: 'default' },
        { label: '', href: '', variant: 'outline' },
        { label: '', href: '', variant: 'outline' },
      ],
      homepageSectionOrder: ['hero', 'blog', 'feed', 'events'],
    },
    navigation: [
      { id: '3', name: 'Blog', href: '/blog', isSubmenu: false },
      { id: '6', name: 'Feed', href: '/feed', isSubmenu: false },
      { id: '4', name: 'About', href: '/about', isSubmenu: false },
    ],
  },
  {
    name: 'Minimal Landing',
    description: 'Clean single-page with just hero and about',
    siteConfig: {
      title: 'My Site',
      heroTitle: 'Hello',
      heroSubtitle: 'A simple landing page',
      heroBackgroundType: 'color',
      heroBackgroundColor: '#1a1a2e',
      heroTextColor: '#ffffff',
      showEvents: false,
      showBlog: false,
      showFeed: false,
      heroButtons: [
        { label: 'Learn More', href: '/about', variant: 'outline' },
        { label: '', href: '', variant: 'outline' },
        { label: '', href: '', variant: 'outline' },
      ],
      homepageSectionOrder: ['hero', 'events', 'blog', 'feed'],
    },
    navigation: [
      { id: '4', name: 'About', href: '/about', isSubmenu: false },
    ],
  },
  {
    name: 'Community Hub',
    description: 'Active feed with events and blog',
    siteConfig: {
      title: 'Community Hub',
      heroTitle: 'Join the Conversation',
      heroSubtitle: 'Connect with our community in real time',
      heroBackgroundType: 'color',
      heroBackgroundColor: '#1a1a2e',
      heroTextColor: '#ffffff',
      showEvents: true,
      showBlog: true,
      showFeed: true,
      maxEvents: 4,
      maxBlogPosts: 3,
      maxFeedNotes: 8,
      heroButtons: [
        { label: 'Join Feed', href: '/feed', variant: 'default' },
        { label: 'View Events', href: '/events', variant: 'outline' },
        { label: '', href: '', variant: 'outline' },
      ],
      homepageSectionOrder: ['hero', 'feed', 'events', 'blog'],
    },
    navigation: [
      { id: '6', name: 'Feed', href: '/feed', isSubmenu: false },
      { id: '2', name: 'Events', href: '/events', isSubmenu: false },
      { id: '3', name: 'Blog', href: '/blog', isSubmenu: false },
      { id: '4', name: 'About', href: '/about', isSubmenu: false },
    ],
  },
];

interface SettingsPresetsProps {
  onApply: (preset: Preset) => void;
  disabled: boolean;
  hasUnsavedChanges: boolean;
}

export const SettingsPresets = memo(function SettingsPresets({
  onApply,
  disabled,
  hasUnsavedChanges,
}: SettingsPresetsProps) {
  const [selected, setSelected] = useState('');

  const handleApply = () => {
    const preset = PRESETS.find(p => p.name === selected);
    if (preset) {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          'Applying a preset will overwrite your current unsaved changes. Continue?'
        );
        if (!confirmed) return;
      }
      onApply(preset);
      setSelected('');
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={selected} onValueChange={setSelected} disabled={disabled}>
        <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-[180px] sm:flex-none">
          <SelectValue placeholder="Apply a template..." />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map(preset => (
            <SelectItem key={preset.name} value={preset.name}>
              {preset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <Button size="sm" variant="default" onClick={handleApply} disabled={disabled} className="shrink-0">
          Apply
        </Button>
      )}
    </div>
  );
});

export type { Preset };
