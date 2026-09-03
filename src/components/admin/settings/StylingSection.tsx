import { memo } from 'react';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableSection } from './SortableSection';
import { type SiteConfig, TWEAKCN_THEMES } from './types';

interface StylingSectionProps {
  tweakcnThemeUrl: string;
  onChange: (updates: Partial<SiteConfig>) => void;
  disabled: boolean;
  isDirty?: boolean;
}

export const StylingSection = memo(function StylingSection({
  tweakcnThemeUrl,
  onChange,
  disabled,
  isDirty,
}: StylingSectionProps) {
  return (
    <SortableSection
      id="styling"
      title="Site Styling (TweakCN)"
      description="TweakCN is a powerful theme engine that allows you to customize the visual appearance of your site using a simple JSON configuration."
      isDirty={isDirty}
    >
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Select a Preset Theme</Label>
          <div className="flex gap-2">
            <Select
              value={TWEAKCN_THEMES.find(t => t.url === tweakcnThemeUrl)?.url ?? 'none'}
              onValueChange={(url) => {
                onChange({ tweakcnThemeUrl: url === 'none' ? '' : url });
              }}
              disabled={disabled}
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
          </div>
          <p className="text-xs text-muted-foreground">
            Themes are applied instantly. Save changes to make them permanent.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="customThemeUrl">Custom TweakCN Theme URL</Label>
          <div className="flex gap-2">
            <Input
              id="customThemeUrl"
              value={tweakcnThemeUrl}
              onChange={(e) => {
                onChange({ tweakcnThemeUrl: e.target.value });
              }}
              placeholder="https://tweakcn.com/r/themes/..."
              disabled={disabled}
            />
            {tweakcnThemeUrl && !TWEAKCN_THEMES.some(t => t.url === tweakcnThemeUrl) && (
              <Button
                variant="outline"
                onClick={() => {
                  onChange({ tweakcnThemeUrl: '' });
                }}
              >
                Clear
              </Button>
            )}
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
});
