import { memo } from 'react';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SortableSection } from './SortableSection';
import { type SiteConfig } from './types';

interface HeroSectionProps {
  heroBanner: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBackgroundType: 'none' | 'image' | 'color';
  heroBackground: string;
  heroBackgroundColor: string;
  heroTextColor: string;
  onChange: (updates: Partial<SiteConfig>) => void;
  disabled: boolean;
  isDirty?: boolean;
}

export const HeroSection = memo(function HeroSection({
  heroBanner,
  heroTitle,
  heroSubtitle,
  heroBackgroundType,
  heroBackground,
  heroBackgroundColor,
  heroTextColor,
  onChange,
  disabled,
  isDirty,
}: HeroSectionProps) {
  return (
    <SortableSection id="hero" title="Hero Section" isDirty={isDirty}>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="heroBanner">Banner Image URL (optional, shown above hero)</Label>
          <Input
            id="heroBanner"
            value={heroBanner}
            onChange={(e) => onChange({ heroBanner: e.target.value })}
            placeholder="https://... (leave empty for no banner)"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground mt-1">A banner image displayed between the navigation bar and the hero section. Tall images are height-capped (400px) with color-matched fill on the sides.</p>
        </div>

        <Separator />

        <div>
          <Label htmlFor="heroTitle">Hero Title</Label>
          <Input
            id="heroTitle"
            value={heroTitle}
            onChange={(e) => onChange({ heroTitle: e.target.value })}
            placeholder="Welcome to Our Community"
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
          <Input
            id="heroSubtitle"
            value={heroSubtitle}
            onChange={(e) => onChange({ heroSubtitle: e.target.value })}
            placeholder="Join us for amazing meetups and events"
            disabled={disabled}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <Label>Hero Background Type</Label>
            <p className="text-sm text-muted-foreground mb-2">Choose whether the hero uses a background image, a solid color, or no background</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={heroBackgroundType === 'none' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ heroBackgroundType: 'none' })}
              disabled={disabled}
            >
              None
            </Button>
            <Button
              variant={heroBackgroundType === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ heroBackgroundType: 'image' })}
              disabled={disabled}
            >
              Background Image
            </Button>
            <Button
              variant={heroBackgroundType === 'color' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ heroBackgroundType: 'color' })}
              disabled={disabled}
            >
              Solid Color
            </Button>
          </div>

          {heroBackgroundType === 'image' && (
            <div>
              <Label htmlFor="heroBackground">Hero Background Image URL</Label>
              <Input
                id="heroBackground"
                value={heroBackground}
                onChange={(e) => onChange({ heroBackground: e.target.value })}
                placeholder="https://..."
                disabled={disabled}
              />
            </div>
          )}
          {heroBackgroundType === 'color' && (
            <div className="flex items-center gap-3">
              <Label htmlFor="heroBackgroundColor">Hero Background Color</Label>
              <input
                type="color"
                id="heroBackgroundColor"
                value={heroBackgroundColor}
                onChange={(e) => onChange({ heroBackgroundColor: e.target.value })}
                disabled={disabled}
                className="h-9 w-12 rounded border border-input cursor-pointer"
              />
              <Input
                value={heroBackgroundColor}
                onChange={(e) => onChange({ heroBackgroundColor: e.target.value })}
                placeholder="#1a1a2e"
                disabled={disabled}
                className="w-32"
              />
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Label htmlFor="heroTextColor">Hero Text Color</Label>
            <input
              type="color"
              id="heroTextColor"
              value={heroTextColor}
              onChange={(e) => onChange({ heroTextColor: e.target.value })}
              disabled={disabled}
              className="h-9 w-12 rounded border border-input cursor-pointer"
            />
            <Input
              value={heroTextColor}
              onChange={(e) => onChange({ heroTextColor: e.target.value })}
              placeholder="#000000"
              disabled={disabled}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">Choose a text color that contrasts with your background.</p>
          </div>
        </div>
      </CardContent>
    </SortableSection>
  );
});
