import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ExpandableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpandableSearch({
  value,
  onChange,
  placeholder = 'Search...',
  open,
  onOpenChange,
}: ExpandableSearchProps) {
  if (open) {
    return (
      <div className="w-full flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !value) onOpenChange(false);
            }}
            className="pl-8"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { onChange(''); onOpenChange(false); }}
          title="Clear and close search"
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => onOpenChange(true)}
      title="Search"
    >
      <Search className="h-4 w-4" />
    </Button>
  );
}
