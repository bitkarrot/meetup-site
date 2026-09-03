import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GripVertical, Plus, Trash2, Eye, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { type NavigationItem } from './types';
import { PageContent } from './PageContent';

interface SortableNavItemProps {
  item: NavigationItem;
  navigation: NavigationItem[];
  onUpdate: (id: string, updates: Partial<NavigationItem>) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function SortableNavItem({ item, navigation, onUpdate, onRemove, disabled }: SortableNavItemProps) {
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
      <div className="flex items-start gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-2.5 shrink-0 flex items-center justify-center w-11 h-11 -ml-2 rounded-md hover:bg-muted touch-none">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
          <div className="flex items-center gap-3 flex-wrap">
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
                  {parentItems.filter(p => !!p.id).map(p => (
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
              className="ml-auto"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SortableHomepageItemProps {
  id: string;
  label: string;
  description: string;
  isPage: boolean;
  path?: string;
  content?: string;
  disabled?: boolean;
}

export function SortableHomepageItem({ id, label, description, isPage, path, content, disabled }: SortableHomepageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const [previewOpen, setPreviewOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border rounded-md bg-card"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 flex items-center justify-center w-11 h-11 -ml-1 rounded-md hover:bg-muted touch-none">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{label}</span>
          {isPage ? (
            <Badge variant="secondary" className="text-[10px]">Page</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Built-in</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      {isPage && path && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewOpen(true)}
            title="Preview page"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" hideCloseButton>
              <DialogHeader className="flex flex-row items-center justify-between space-y-0 pr-0">
                <DialogTitle className="truncate">{label}</DialogTitle>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" title="Close">
                    <X className="h-5 w-5" />
                  </Button>
                </DialogClose>
              </DialogHeader>
              <div className="overflow-y-auto flex-1 -mx-6 px-6 pb-2">
                <div className="prose prose-slate dark:prose-invert max-w-none">
                  <PageContent content={content || ''} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
