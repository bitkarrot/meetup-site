import { memo } from 'react';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableSection } from './SortableSection';
import { type SiteConfig } from './types';

interface BasicInfoSectionProps {
  title: string;
  logo: string;
  favicon: string;
  ogImage: string;
  nip19Gateway: string;
  onChange: (updates: Partial<SiteConfig>) => void;
  disabled: boolean;
  isDirty?: boolean;
}

export const BasicInfoSection = memo(function BasicInfoSection({
  title,
  logo,
  favicon,
  ogImage,
  nip19Gateway,
  onChange,
  disabled,
  isDirty,
}: BasicInfoSectionProps) {
  return (
    <SortableSection id="basic" title="Basic Information" isDirty={isDirty}>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="title">Site Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="My Meetup Site"
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="logo">Logo URL</Label>
            <Input
              id="logo"
              value={logo}
              onChange={(e) => onChange({ logo: e.target.value })}
              placeholder="https://..."
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="favicon">Favicon URL</Label>
            <Input
              id="favicon"
              value={favicon}
              onChange={(e) => onChange({ favicon: e.target.value })}
              placeholder="https://..."
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="ogImage">Open Graph Image URL</Label>
            <Input
              id="ogImage"
              value={ogImage}
              onChange={(e) => onChange({ ogImage: e.target.value })}
              placeholder="https://..."
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="nip19Gateway">NIP-19 Gateway URL</Label>
            <Select
              value={nip19Gateway || 'https://nostr.at'}
              onValueChange={(val) => onChange({ nip19Gateway: val })}
              disabled={disabled}
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
});
