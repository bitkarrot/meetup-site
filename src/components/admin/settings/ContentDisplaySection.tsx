import { memo } from 'react';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableSection } from './SortableSection';
import { NumberInput } from './NumberInput';
import { type SiteConfig } from './types';

interface ContentDisplaySectionProps {
  showEvents: boolean;
  showBlog: boolean;
  showFeed: boolean;
  maxEvents: number;
  maxBlogPosts: number;
  maxFeedNotes: number;
  heroButtons: SiteConfig['heroButtons'];
  onChange: (updates: Partial<SiteConfig>) => void;
  disabled: boolean;
  isDirty?: boolean;
}

export const ContentDisplaySection = memo(function ContentDisplaySection({
  showEvents,
  showBlog,
  showFeed,
  maxEvents,
  maxBlogPosts,
  maxFeedNotes,
  heroButtons,
  onChange,
  disabled,
  isDirty,
}: ContentDisplaySectionProps) {
  return (
    <SortableSection id="content" title="Content Display" isDirty={isDirty}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Show Events on Homepage</Label>
            <p className="text-sm text-muted-foreground">Display upcoming events on the home page</p>
          </div>
          <Switch
            checked={showEvents}
            onCheckedChange={(checked) => onChange({ showEvents: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Show Blog Posts on Homepage</Label>
            <p className="text-sm text-muted-foreground">Display recent blog posts on home page</p>
          </div>
          <Switch
            checked={showBlog}
            onCheckedChange={(checked) => onChange({ showBlog: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Show Feed on Homepage</Label>
            <p className="text-sm text-muted-foreground">Display recent notes from your community feed</p>
          </div>
          <Switch
            checked={showFeed}
            onCheckedChange={(checked) => onChange({ showFeed: checked })}
            disabled={disabled}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="maxEvents">Maximum Events to Show</Label>
            <NumberInput
              id="maxEvents"
              value={maxEvents}
              onChange={(val) => onChange({ maxEvents: val })}
              min={1}
              max={20}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="maxBlogPosts">Maximum Blog Posts to Show</Label>
            <NumberInput
              id="maxBlogPosts"
              value={maxBlogPosts}
              onChange={(val) => onChange({ maxBlogPosts: val })}
              min={1}
              max={20}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="maxFeedNotes">Maximum Feed Notes to Show</Label>
            <NumberInput
              id="maxFeedNotes"
              value={maxFeedNotes}
              onChange={(val) => onChange({ maxFeedNotes: val })}
              min={1}
              max={20}
              disabled={disabled}
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

          {heroButtons.map((button, index) => (
            <div key={index} className="mb-4 p-4 border rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Button {index + 1}</span>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`enable-button-${index}`} className="text-xs text-muted-foreground">Enabled</Label>
                  <Switch
                    id={`enable-button-${index}`}
                    checked={button.label !== '' && button.href !== ''}
                    onCheckedChange={(checked) => {
                      const newButtons = [...heroButtons];
                      if (!checked) {
                        newButtons[index] = { ...button, label: '', href: '' };
                      } else {
                        newButtons[index] = { ...button, label: `Button ${index + 1}`, href: '/' };
                      }
                      onChange({ heroButtons: newButtons });
                    }}
                    disabled={disabled}
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
                      const newButtons = [...heroButtons];
                      newButtons[index] = { ...button, label: e.target.value };
                      onChange({ heroButtons: newButtons });
                    }}
                    placeholder="View Events"
                    disabled={disabled || (button.label === '' && button.href === '')}
                  />
                </div>
                <div>
                  <Label htmlFor={`button-href-${index}`} className="text-xs">Button Link</Label>
                  <Input
                    id={`button-href-${index}`}
                    value={button.href}
                    onChange={(e) => {
                      const newButtons = [...heroButtons];
                      newButtons[index] = { ...button, href: e.target.value };
                      onChange({ heroButtons: newButtons });
                    }}
                    placeholder="/events"
                    disabled={disabled || (button.label === '' && button.href === '')}
                  />
                </div>
                <div>
                  <Label htmlFor={`button-variant-${index}`} className="text-xs">Button Style</Label>
                  <Select
                    value={button.variant || 'default'}
                    onValueChange={(val: 'default' | 'outline') => {
                      const newButtons = [...heroButtons];
                      newButtons[index] = { ...button, variant: val };
                      onChange({ heroButtons: newButtons });
                    }}
                    disabled={disabled || (button.label === '' && button.href === '')}
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

          {heroButtons.length < 6 && (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onChange({ heroButtons: [...heroButtons, { label: '', href: '', variant: 'outline' }] })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Button
            </Button>
          )}
        </div>
      </CardContent>
    </SortableSection>
  );
});
