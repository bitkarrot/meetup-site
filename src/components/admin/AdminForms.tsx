import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { getDefaultRelayUrl } from '@/lib/relay';
import { useAuthor } from '@/hooks/useAuthor';
import { useRemoteNostrJson, useAdminAuth } from '@/hooks/useRemoteNostrJson';
import { useToast } from '@/hooks/useToast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  Share2,
  Copy,
  CopyPlus,
  ExternalLink,
  GripVertical,
  FileText,
  User,
  Filter,
  Link as LinkIcon,
  ClipboardList,
  Settings,
  ChevronDown,
  ChevronUp,
  X,
  PanelRightOpen,
  PanelRightClose,
  Type,
  AlignLeft,
  Hash,
  Mail,
  Link2,
  CalendarDays,
  CircleDot,
  CheckSquare,
  ArrowUp,
  ArrowDown,
  Tag,
  Download,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
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
import { AuthorInfo } from '@/components/AuthorInfo';
import type { NostrEvent } from '@nostrify/nostrify';

// Form field types supported by formstr
type FieldType =
  | 'shortText'
  | 'paragraph'
  | 'number'
  | 'singleChoice'
  | 'multipleChoice'
  | 'email'
  | 'url'
  | 'date'
  | 'label';

interface FieldChoice {
  id: string;
  label: string;
  isOther?: boolean;
}

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  description?: string;
  choices?: FieldChoice[];
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

interface NostrForm {
  id: string;
  eventId: string;
  pubkey: string;
  name: string;
  description?: string;
  fields: FormField[];
  settings: Record<string, unknown>;
  created_at: number;
  relays: string[];
  linkedPath?: string; // For admin-linked static page paths
}

// Field type options with icons
const FIELD_TYPES: { value: FieldType; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'shortText', label: 'Short Text', description: 'Single-line text input', icon: <Type className="h-4 w-4" /> },
  { value: 'paragraph', label: 'Paragraph', description: 'Multi-line text input', icon: <AlignLeft className="h-4 w-4" /> },
  { value: 'number', label: 'Number', description: 'Numeric input', icon: <Hash className="h-4 w-4" /> },
  { value: 'email', label: 'Email', description: 'Email address input', icon: <Mail className="h-4 w-4" /> },
  { value: 'url', label: 'URL', description: 'Website URL input', icon: <Link2 className="h-4 w-4" /> },
  { value: 'date', label: 'Date', description: 'Date picker', icon: <CalendarDays className="h-4 w-4" /> },
  { value: 'singleChoice', label: 'Single Choice', description: 'Select one option', icon: <CircleDot className="h-4 w-4" /> },
  { value: 'multipleChoice', label: 'Multiple Choice', description: 'Select multiple options', icon: <CheckSquare className="h-4 w-4" /> },
  { value: 'label', label: 'Label/Description', description: 'Text description (no input)', icon: <Tag className="h-4 w-4" /> },
];

// Generate a random ID for fields
function generateId(): string {
  return Math.random().toString(36).substring(2, 8);
}

// Form Card Component
function FormCard({
  form,
  user,
  isAdmin,
  onEdit,
  onDuplicate,
  onDelete,
  onShare,
  onLinkPage,
  onViewResponses,
  responsesCount,
}: {
  form: NostrForm;
  user: { pubkey: string } | null;
  isAdmin: boolean;
  onEdit: (form: NostrForm) => void;
  onDuplicate: (form: NostrForm) => void;
  onDelete: (form: NostrForm) => void;
  onShare: (form: NostrForm) => void;
  onLinkPage: (form: NostrForm) => void;
  onViewResponses: (form: NostrForm) => void;
  responsesCount: number;
}) {
  const { data: authorData } = useAuthor(form.pubkey);
  const metadata = authorData?.metadata;
  const displayName = metadata?.name || metadata?.display_name || `${form.pubkey.slice(0, 8)}...`;
  const isOwner = user?.pubkey === form.pubkey;

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="h-4 w-4 text-primary shrink-0" />
              <HoverCard openDelay={200}>
                <HoverCardTrigger asChild>
                  <h3 className="text-lg font-semibold cursor-help hover:text-primary transition-colors break-words">
                    {form.name}
                  </h3>
                </HoverCardTrigger>
                <HoverCardContent className="w-[calc(100vw-2rem)] max-w-[400px] max-h-[400px] overflow-auto p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Form Preview
                      </h4>
                      <Badge variant="outline" className="text-[10px]">
                        {form.fields.length} fields
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {form.description && (
                        <p className="text-sm text-muted-foreground">{form.description}</p>
                      )}
                      <div className="space-y-1">
                        {form.fields.slice(0, 5).map((field, idx) => (
                          <div key={field.id} className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="text-[10px]">
                              {idx + 1}
                            </Badge>
                            <span className="truncate">{field.label}</span>
                            <Badge variant="outline" className="text-[10px] ml-auto">
                              {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                            </Badge>
                          </div>
                        ))}
                        {form.fields.length > 5 && (
                          <p className="text-xs text-muted-foreground italic">
                            +{form.fields.length - 5} more fields
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <Badge variant="outline" className="shrink-0">Kind 30168</Badge>
              {form.linkedPath && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 shrink-0">
                  <LinkIcon className="h-3 w-3 mr-1" />
                  {form.linkedPath}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback><User className="h-3 w-3" /></AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{displayName}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">
                  {responsesCount} responses
                </Badge>
              </div>
            </div>
            {form.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{form.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{form.fields.length} fields</span>
              <span>Created: {new Date(form.created_at * 1000).toLocaleDateString()}</span>
            </div>
            {form.relays && form.relays.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-xs text-muted-foreground mr-1">Relays:</span>
                {form.relays.slice(0, 2).map((relay) => (
                  <Badge key={relay} variant="secondary" className="text-xs font-mono">
                    {relay.replace('wss://', '').replace('ws://', '')}
                  </Badge>
                ))}
                {form.relays.length > 2 && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    +{form.relays.length - 2} more
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Form Actions at the bottom */}
        <div className="mt-6 pt-4 border-t flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onShare(form)}
            className="flex items-center gap-2"
          >
            <Share2 className="h-4 w-4 text-primary" />
            <span>Share Form</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewResponses(form)}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4 text-primary" />
            <span>View Responses</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDuplicate(form)}
            className="flex items-center gap-2"
          >
            <CopyPlus className="h-4 w-4" />
            <span>Duplicate</span>
          </Button>

          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onLinkPage(form)}
              className="flex items-center gap-2"
            >
              <LinkIcon className="h-4 w-4" />
              <span>Link to Page</span>
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isOwner && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(form)}
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  <span>Edit</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(form)}
                  className="flex items-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Field Editor Component
function FieldEditor({
  field,
  index,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: FormField;
  index: number;
  onUpdate: (field: FormField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
  };

  const [isExpanded, setIsExpanded] = useState(true);
  const hasChoices = field.type === 'singleChoice' || field.type === 'multipleChoice';

  const addChoice = () => {
    const newChoice: FieldChoice = {
      id: generateId(),
      label: '',
    };
    onUpdate({
      ...field,
      choices: [...(field.choices || []), newChoice],
    });
  };

  const updateChoice = (choiceId: string, label: string) => {
    onUpdate({
      ...field,
      choices: field.choices?.map(c => c.id === choiceId ? { ...c, label } : c),
    });
  };

  const removeChoice = (choiceId: string) => {
    onUpdate({
      ...field,
      choices: field.choices?.filter(c => c.id !== choiceId),
    });
  };

  return (
    <Card ref={setNodeRef} style={style} className="border-l-4 border-l-primary/50">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted text-muted-foreground transition-colors">
            <GripVertical className="h-4 w-4" />
          </div>
          <Badge variant="outline">{index + 1}</Badge>
          <span className="font-medium truncate flex-1">{field.label || 'Untitled Field'}</span>
          <Badge variant="secondary">
            {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse Field" : "Expand Field"}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-primary" />
            ) : (
              <ChevronDown className="h-4 w-4 text-primary" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move Up"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            disabled={isLast}
            title="Move Down"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isExpanded && (
          <div className="space-y-4 pl-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Field Label</Label>
                <Input
                  value={field.label}
                  onChange={(e) => onUpdate({ ...field, label: e.target.value })}
                  placeholder="Enter field label..."
                />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select
                  value={field.type}
                  onValueChange={(value: FieldType) => onUpdate({ ...field, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex flex-col">
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground">{type.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={field.description || ''}
                onChange={(e) => onUpdate({ ...field, description: e.target.value })}
                placeholder="Help text for this field..."
              />
            </div>

            {field.type !== 'label' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`required-${field.id}`}
                  checked={field.required || false}
                  onCheckedChange={(checked) => onUpdate({ ...field, required: !!checked })}
                />
                <label htmlFor={`required-${field.id}`} className="text-sm cursor-pointer">
                  Required field
                </label>
              </div>
            )}

            {hasChoices && (
              <div className="space-y-2">
                <Label>Choices</Label>
                <div className="space-y-2">
                  {field.choices?.map((choice, idx) => (
                    <div key={choice.id} className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0">{idx + 1}</Badge>
                      <Input
                        value={choice.label}
                        onChange={(e) => updateChoice(choice.id, e.target.value)}
                        placeholder="Choice label..."
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChoice(choice.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addChoice}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Choice
                </Button>
              </div>
            )}

            {field.type === 'number' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Minimum Value</Label>
                  <Input
                    type="number"
                    value={field.min ?? ''}
                    onChange={(e) => onUpdate({ ...field, min: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="No minimum"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Maximum Value</Label>
                  <Input
                    type="number"
                    value={field.max ?? ''}
                    onChange={(e) => onUpdate({ ...field, max: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="No maximum"
                  />
                </div>
              </div>
            )}

            {(field.type === 'shortText' || field.type === 'paragraph') && (
              <div className="space-y-2">
                <Label>Placeholder Text</Label>
                <Input
                  value={field.placeholder || ''}
                  onChange={(e) => onUpdate({ ...field, placeholder: e.target.value })}
                  placeholder="Placeholder text..."
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Response Viewer Component
interface ResponseViewerProps {
  form: NostrForm;
}

const ResponseViewer: React.FC<ResponseViewerProps> = ({ form }) => {
  const { nostr, poolNostr, defaultRelayUrl } = useDefaultRelay();
  const { toast } = useToast();

  const { data: responses, isLoading } = useQuery({
    queryKey: ['form-responses', form.id, form.eventId],
    queryFn: async () => {
      const signal = AbortSignal.timeout(10000);
      const address = `30168:${form.pubkey}:${form.id}`;
      const filters = [
        { kinds: [30169], '#e': [form.eventId, form.id] },
        { kinds: [30169], '#a': [address] }
      ];

      // Query multiple relays to improve reliability
      const relaysToQuery = Array.from(new Set([
        ...form.relays,
        defaultRelayUrl
      ])).filter(Boolean);

      const queryRelay = async (relayUrl: string) => {
        try {
          const r = (poolNostr as { relay: (url: string) => { query: (f: unknown[], o: { signal: AbortSignal }) => Promise<unknown[]> } }).relay(relayUrl);
          return await r.query(filters, { signal }) as NostrEvent[];
        } catch (e) {
          console.error(`[ResponseViewer] Error querying ${relayUrl}:`, e);
          return [];
        }
      };

      const results = await Promise.allSettled([
        nostr ? nostr.query(filters, { signal }) : Promise.resolve([]),
        ...relaysToQuery.map(url => queryRelay(url))
      ]);

      const allEvents = results
        .filter((r): r is PromiseFulfilledResult<NostrEvent[]> => r.status === 'fulfilled')
        .flatMap(r => r.value);

      // Deduplicate by ID
      const uniqueEvents = Array.from(new Map(allEvents.map(e => [e.id, e])).values());
      return uniqueEvents.map(event => {
        let answers: Record<string, unknown> = {};
        try {
          const content = JSON.parse(event.content);
          // Support both array [{questionId, answer}, ...] and object { questionId: answer } formats
          if (Array.isArray(content)) {
            answers = content.reduce((acc: Record<string, unknown>, curr: { questionId?: string; answer?: unknown }) => {
              if (curr.questionId) {
                acc[curr.questionId] = curr.answer;
              }
              return acc;
            }, {});
          } else {
            answers = content || {};
          }
        } catch {
          console.warn('Failed to parse response content:', event.id);
        }
        return {
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          answers,
        };
      });
    },
    enabled: !!nostr,
    refetchInterval: 30000,
  });

  // Fetch profiles for CSV export and display
  const { data: profiles } = useQuery({
    queryKey: ['form-responder-profiles', responses?.map(r => r.pubkey)],
    enabled: !!responses && responses.length > 0,
    queryFn: async () => {
      const pubkeys = Array.from(new Set(responses!.map(r => r.pubkey)));
      const events = await nostr!.query([{ kinds: [0], authors: pubkeys }]);
      const map: Record<string, { name?: string; display_name?: string }> = {};
      events.forEach(event => {
        try {
          const content = JSON.parse(event.content);
          map[event.pubkey] = content;
        } catch {
          // ignore parse errors
        }
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const getDisplayValue = (field: FormField, val: unknown) => {
    if (val === undefined || val === null || val === '') return '';

    if (field.type === 'singleChoice' || field.type === 'multipleChoice') {
      const choices = field.choices || [];
      const resolve = (id: string) => choices.find(c => c.id === id)?.label || id;

      if (Array.isArray(val)) {
        return val.map(resolve).filter(Boolean).join(', ');
      }
      return resolve(String(val));
    }

    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  const downloadCSV = () => {
    if (!responses || responses.length === 0) return;

    // Headers: Date, Username, User Pubkey, and each field label
    const fieldLabels = form.fields.filter(f => f.type !== 'label').map(f => f.label);
    const headers = ['Date', 'Username', 'User Pubkey', ...fieldLabels];

    const rows = responses.map(resp => {
      const date = new Date(resp.created_at * 1000).toISOString();
      const profile = profiles?.[resp.pubkey];
      const username = profile?.name || profile?.display_name || '';
      const pubkey = resp.pubkey;

      const values = form.fields.filter(f => f.type !== 'label').map(field => {
        return getDisplayValue(field, resp.answers[field.id]);
      });

      return [date, username, pubkey, ...values].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Format timestamp for filename: YYYY-MM-DD-T-HH-mm-ss
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const filename = `responses-${form.name.replace(/\s+/g, '-').toLowerCase()}-${dateStr}-T${timeStr}.csv`;

    link.className = 'hidden';
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Success',
      description: `Downloaded: ${filename}`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-muted-foreground text-sm">Fetching responses from relays...</p>
      </div>
    );
  }

  if (!responses || responses.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
        <p className="text-muted-foreground">No responses found for this form yet.</p>
        <p className="text-xs text-muted-foreground mt-2">
          Responses are stored as Kind 30169 events on Nostr.
        </p>
      </div>
    );
  }

  const inputFields = form.fields.filter(f => f.type !== 'label');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">Collected Responses</h3>
          <p className="text-sm text-muted-foreground">
            {responses.length} submission{responses.length === 1 ? '' : 's'} recorded
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={downloadCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export to CSV
        </Button>
      </div>

      <div className="border rounded-md overflow-hidden bg-background">
        <div className="overflow-x-auto max-h-[500px]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
              <TableRow>
                <TableHead className="w-[180px] min-w-[150px]">Date</TableHead>
                <TableHead className="w-[120px]">User</TableHead>
                {inputFields.map(field => (
                  <TableHead key={field.id} className="min-w-[150px]">
                    {field.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map(resp => (
                <TableRow key={resp.id}>
                  <TableCell className="text-xs font-mono">
                    {new Date(resp.created_at * 1000).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <AuthorInfo pubkey={resp.pubkey} className="flex items-center gap-2" />
                  </TableCell>
                  {inputFields.map(field => (
                    <TableCell key={field.id} className="text-sm">
                      {getDisplayValue(field, resp.answers[field.id]) || (
                        <span className="text-muted-foreground italic">empty</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

// Main AdminForms Component
export default function AdminForms() {
  const { nostr, poolNostr, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const { data: remoteNostrJson } = useRemoteNostrJson();
  const { isAdmin, isMaster } = useAdminAuth(user?.pubkey);
  const queryClient = useQueryClient();

  // State
  const [isCreating, setIsCreating] = useState(false);
  const [editingForm, setEditingForm] = useState<NostrForm | null>(null);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [filterByNostrJson, setFilterByNostrJson] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [responsesDialogOpen, setResponsesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<NostrForm | null>(null);
  const [linkedPath, setLinkedPath] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingFormResponseCount, setEditingFormResponseCount] = useState<number>(0);

  // Form builder state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [formSettings, setFormSettings] = useState({
    encrypted: false,
  });

  // Initialize relays
  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  // Fetch forms from Nostr
  const { data: allForms, isLoading: _isLoading, refetch } = useQuery({
    queryKey: ['admin-forms'],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const signal = AbortSignal.timeout(5000);
      const events = await nostr!.query(
        [{ kinds: [30168], limit: 100 }],
        { signal }
      );

      return events.map((event) => {
        const tags = event.tags || [];
        const relayTags = tags.filter(([name]) => name === 'relay').map(([, url]) => url);
        const dTag = tags.find(([name]) => name === 'd')?.[1] || '';
        const linkedPathTag = tags.find(([name]) => name === 'linked-path')?.[1];

        let formData: { name?: string; description?: string; fields?: FormField[]; settings?: Record<string, unknown> } = {};
        try {
          formData = JSON.parse(event.content);
        } catch {
          console.warn('Failed to parse form content:', event.id);
        }

        return {
          id: dTag || event.id,
          eventId: event.id,
          pubkey: event.pubkey,
          name: formData.name || 'Untitled Form',
          description: formData.description,
          fields: (formData.fields || []).map((f: FormField) => ({
            ...f,
            // Guard against empty/unknown type values that crash <SelectItem value="">
            type: (f.type && FIELD_TYPES.some(t => t.value === f.type)) ? f.type : 'shortText',
          })),
          settings: formData.settings || {},
          created_at: event.created_at,
          relays: relayTags,
          linkedPath: linkedPathTag,
        } as NostrForm;
      });
    },
    enabled: !!nostr,
  });

  // Fetch response counts for all forms
  const { data: responseCounts } = useQuery({
    queryKey: ['form-response-counts', allForms?.map(f => f.eventId).join(',')],
    enabled: !!allForms && allForms.length > 0,
    queryFn: async () => {
      const signal = AbortSignal.timeout(10000);
      const addresses = allForms!.map(f => `30168:${f.pubkey}:${f.id}`);
      const eventIds = allForms!.map(f => f.eventId);
      const filters = [
        { kinds: [30169], '#a': addresses },
        { kinds: [30169], '#e': eventIds }
      ];

      // Query multiple relays to improve reliability
      const relaysToQuery = Array.from(new Set([
        ...allForms!.flatMap(f => f.relays),
        getDefaultRelayUrl()
      ])).filter(Boolean);

      const queryRelay = async (relayUrl: string) => {
        try {
          const r = (poolNostr as { relay: (url: string) => { query: (f: unknown[], o: { signal: AbortSignal }) => Promise<unknown[]> } }).relay(relayUrl);
          return await r.query(filters, { signal }) as NostrEvent[];
        } catch {
          return [];
        }
      };

      const results = await Promise.allSettled([
        nostr ? nostr.query(filters, { signal }) : Promise.resolve([]),
        ...relaysToQuery.map(url => queryRelay(url))
      ]);

      const allEvents = results
        .filter((r): r is PromiseFulfilledResult<NostrEvent[]> => r.status === 'fulfilled')
        .flatMap(r => r.value);

      // Deduplicate by ID
      const uniqueEvents = Array.from(new Map(allEvents.map(e => [e.id, e])).values());

      const counts: Record<string, number> = {};
      uniqueEvents.forEach(event => {
        const aTag = event.tags.find(([t]) => t === 'a')?.[1];
        if (aTag) {
          counts[aTag] = (counts[aTag] || 0) + 1;
        } else {
          // Fallback to #e tagging if #a is missing
          const eTag = event.tags.find(([t]) => t === 'e')?.[1];
          if (eTag) {
            const form = allForms?.find(f => f.eventId === eTag || f.id === eTag);
            if (form) {
              const address = `30168:${form.pubkey}:${form.id}`;
              counts[address] = (counts[address] || 0) + 1;
            }
          }
        }
      });
      return counts;
    },
    refetchInterval: 30000, // Refresh counts every 30s
  });

  // Filter forms based on nostr.json users
  const forms = filterByNostrJson && remoteNostrJson?.names
    ? allForms?.filter((form) => {
      const normalizedPubkey = form.pubkey.toLowerCase().trim();
      return Object.values(remoteNostrJson.names).some(
        (pubkey) => pubkey.toLowerCase().trim() === normalizedPubkey
      );
    })
    : allForms;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['form-response-counts'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Check if form is dirty
  const isDirty = editingForm
    ? formName !== editingForm.name ||
    formDescription !== (editingForm.description || '') ||
    JSON.stringify(formFields) !== JSON.stringify(editingForm.fields)
    : formName.trim() !== '' || formDescription.trim() !== '' || formFields.length > 0;

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isCreating && isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isCreating, isDirty]);

  // Reset form state
  const resetForm = useCallback(() => {
    setFormName('');
    setFormDescription('');
    setFormFields([]);
    setFormSettings({ encrypted: false });
    setEditingForm(null);
    setIsCreating(false);
    setIsPublishing(false);
    setEditingFormResponseCount(0);
  }, []);

  // Cancel form editing
  const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      return;
    }
    resetForm();
  };

  // Add a new field
  const addField = (type: FieldType) => {
    const fieldTypeInfo = FIELD_TYPES.find(t => t.value === type);
    const newField: FormField = {
      id: generateId(),
      type,
      label: fieldTypeInfo?.label || 'New Field',
      required: false,
    };
    if (type === 'singleChoice' || type === 'multipleChoice') {
      newField.choices = [
        { id: generateId(), label: 'Option 1' },
        { id: generateId(), label: 'Option 2' },
      ];
    }
    setFormFields([...formFields, newField]);
    toast({
      title: "Field Added",
      description: `Added ${fieldTypeInfo?.label} field`,
    });
  };

  // Update a field
  const updateField = (index: number, field: FormField) => {
    const updated = [...formFields];
    updated[index] = field;
    setFormFields(updated);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = formFields.findIndex((i) => i.id === active.id);
      const newIndex = formFields.findIndex((i) => i.id === over.id);
      const newFields = arrayMove(formFields, oldIndex, newIndex);
      setFormFields(newFields);
      // setIsDirty(true); // This is already handled by the general isDirty check
    }
  };

  // Remove a field
  const removeField = (index: number) => {
    setFormFields(formFields.filter((_, i) => i !== index));
  };

  // Move field up
  const moveFieldUp = (index: number) => {
    if (index === 0) return;
    const updated = [...formFields];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setFormFields(updated);
  };

  // Move field down
  const moveFieldDown = (index: number) => {
    if (index === formFields.length - 1) return;
    const updated = [...formFields];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setFormFields(updated);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to create a form.',
        variant: 'destructive',
      });
      return;
    }

    if (isPublishing) return;
    setIsPublishing(true);

    if (!formName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a form name.',
        variant: 'destructive',
      });
      return;
    }

    if (formFields.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one field to your form.',
        variant: 'destructive',
      });
      return;
    }

    // Validate fields
    for (const field of formFields) {
      if (!field.label.trim()) {
        toast({
          title: 'Error',
          description: 'All fields must have a label.',
          variant: 'destructive',
        });
        return;
      }
      if ((field.type === 'singleChoice' || field.type === 'multipleChoice') &&
        (!field.choices || field.choices.length < 2 || field.choices.some(c => !c.label.trim()))) {
        toast({
          title: 'Error',
          description: `Choice field "${field.label}" must have at least 2 non-empty choices.`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const formId = editingForm?.id || generateId();
      const formContent = {
        name: formName,
        description: formDescription || undefined,
        fields: formFields,
        settings: formSettings,
      };

      const tags: string[][] = [
        ['d', formId],
        ['alt', `Nostr Form: ${formName}`],
        ...selectedRelays.map(relay => ['relay', relay]),
      ];

      // Preserve linked path if editing
      if (editingForm?.linkedPath) {
        tags.push(['linked-path', editingForm.linkedPath]);
      }

      toast({
        title: editingForm ? 'Updating Form...' : 'Publishing Form...',
        description: 'Please sign the event to continue.',
      });

      publishEvent(
        {
          event: {
            kind: 30168,
            content: JSON.stringify(formContent),
            tags,
          },
          relays: selectedRelays,
        },
        {
          onSuccess: () => {
            toast({
              title: editingForm ? 'Form Updated' : 'Form Created',
              description: `Your form "${formName}" has been published.`,
            });
            resetForm();
            refetch();
          },
          onError: (error) => {
            console.error('Failed to publish form:', error);
            setIsPublishing(false);
            toast({
              title: 'Error',
              description: 'Failed to publish form. Please try again.',
              variant: 'destructive',
            });
          },
        }
      );
    } catch (error) {
      console.error('Failed to create form:', error);
      setIsPublishing(false);
      toast({
        title: 'Error',
        description: 'Failed to create form.',
        variant: 'destructive',
      });
    }
  };

  // Edit form
  const _handleEdit = (form: NostrForm) => {
    if (user && form.pubkey !== user.pubkey) {
      toast({
        title: 'Error',
        description: "You can only edit your own forms.",
        variant: 'destructive',
      });
      return;
    }
    setFormName(form.name);
    setFormDescription(form.description || '');
    setFormFields(form.fields);
    setFormSettings({
      encrypted: !!form.settings?.encrypted,
    });
    setEditingForm(form);
    setEditingFormResponseCount(responseCounts?.[`30168:${form.pubkey}:${form.id}`] || 0);
    setIsCreating(true);
    window.scrollTo(0, 0);
  };

  // Delete form
  const _handleDelete = (form: NostrForm) => {
    setSelectedForm(form);
    setDeleteDialogOpen(true);
  };

  // Duplicate form — loads a copy into the builder as a new form
  const handleDuplicate = (form: NostrForm) => {
    setFormName(`${form.name} (Copy)`);
    setFormDescription(form.description || '');
    setFormFields(form.fields.map((field) => ({
      ...field,
      id: generateId(),
    })));
    setFormSettings({
      encrypted: !!form.settings?.encrypted,
    });
    setEditingForm(null);
    setEditingFormResponseCount(0);
    setIsCreating(true);
    window.scrollTo(0, 0);
  };

  const confirmDelete = () => {
    if (!selectedForm) return;

    publishEvent(
      {
        event: {
          kind: 5,
          tags: [['e', selectedForm.eventId]],
        },
        relays: selectedRelays,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Form Deleted',
            description: `The form "${selectedForm.name}" has been deleted.`,
          });
          setDeleteDialogOpen(false);
          setSelectedForm(null);
          refetch();
        },
      }
    );
  };

  // Share form
  const handleShare = (form: NostrForm) => {
    setSelectedForm(form);
    setShareDialogOpen(true);
  };

  const copyShareLink = async () => {
    if (!selectedForm) return;

    // Generate naddr for the form
    const naddr = nip19.naddrEncode({
      kind: 30168,
      pubkey: selectedForm.pubkey,
      identifier: selectedForm.id,
      relays: selectedForm.relays.slice(0, 3),
    });

    const link = `${window.location.origin}/form/${naddr}`;

    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: 'Link Copied',
        description: 'Form link copied to clipboard.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy link to clipboard.',
        variant: 'destructive',
      });
    }
  };

  // Link form to page (admin only)
  const handleLinkPage = (form: NostrForm) => {
    // Ownership check: only owner or master admin can manage links
    if (user && form.pubkey !== user.pubkey && !isMaster) {
      toast({
        title: 'Permission Denied',
        description: "Only the form owner or a master admin can link this form to a page.",
        variant: 'destructive',
      });
      return;
    }
    setSelectedForm(form);
    setLinkedPath(form.linkedPath || '');
    setLinkDialogOpen(true);
  };

  const getConflictForm = (path: string) => {
    if (!path || !allForms) return null;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return allForms.find(f =>
      f.linkedPath === normalized &&
      f.id !== selectedForm?.id
    );
  };

  const saveLinkedPath = () => {
    if (!selectedForm || !user) return;

    const normalizedPath = linkedPath.trim()
      ? (linkedPath.startsWith('/') ? linkedPath : `/${linkedPath}`)
      : '';

    // Check for conflict
    const conflict = getConflictForm(normalizedPath);
    if (conflict && !isMaster) {
      toast({
        title: 'Endpoint Already in Use',
        description: `The path "${normalizedPath}" is already assigned to form "${conflict.name}". Only a master admin can override this.`,
        variant: 'destructive',
      });
      return;
    }

    if (conflict && isMaster && !confirm(`WARNING: The path "${normalizedPath}" is already assigned to form "${conflict.name}". Saving this will remove the link from the other form. Do you want to continue?`)) {
      return;
    }

    const formContent = {
      name: selectedForm.name,
      description: selectedForm.description,
      fields: selectedForm.fields,
      settings: selectedForm.settings,
    };

    const tags: string[][] = [
      ['d', selectedForm.id],
      ['alt', `Nostr Form: ${selectedForm.name}`],
      ...selectedRelays.map(relay => ['relay', relay]),
    ];

    if (normalizedPath) {
      tags.push(['linked-path', normalizedPath]);
    }

    publishEvent(
      {
        event: {
          kind: 30168,
          content: JSON.stringify(formContent),
          tags,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: 'Form Updated',
            description: linkedPath.trim()
              ? `Form is now linked to ${linkedPath}`
              : 'Page link has been removed.',
          });
          setLinkDialogOpen(false);
          setSelectedForm(null);
          setLinkedPath('');
          refetch();
        },
        onError: (error) => {
          console.error('Failed to update form:', error);
          toast({
            title: 'Error',
            description: 'Failed to update form link.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  // View responses
  const handleViewResponses = (form: NostrForm) => {
    setSelectedForm(form);
    setResponsesDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {isCreating ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              {editingForm ? 'Edit Form' : 'Create New Form'}
            </h2>
            <Button variant="outline" onClick={handleCancel}>
              Back to List
            </Button>
          </div>

          <div className="flex gap-6 relative">
            <div className={`flex-1 space-y-6 transition-all duration-300 ${isSidebarOpen ? 'mr-0' : 'mr-0'}`}>
              {/* Form Builder */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Form Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editingForm && editingFormResponseCount > 0 && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-bold">Form has {editingFormResponseCount} responses</p>
                        <p>Editing the form fields may make existing responses difficult to display if field IDs change. Use caution when removing or replacing fields.</p>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="form-name">Form Name *</Label>
                      <Input
                        id="form-name"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Enter form name..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="form-description">Description</Label>
                      <Input
                        id="form-description"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Brief description of your form..."
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fields Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5" />
                      Form Fields
                    </CardTitle>
                    <CardDescription>
                      Drag handle to reorder. Configure each field below.
                    </CardDescription>
                  </div>
                  {!isSidebarOpen && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setIsSidebarOpen(true)}
                      className="bg-primary hover:bg-primary/90 shadow-md animate-in fade-in zoom-in duration-300"
                    >
                      <PanelRightOpen className="h-4 w-4 mr-2" />
                      Add Field
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {formFields.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                      <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                      <p className="text-muted-foreground mb-4">No fields added yet</p>
                      <Button variant="outline" onClick={() => setIsSidebarOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Manage Fields
                      </Button>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={formFields.map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-4">
                          {formFields.map((field, index) => (
                            <FieldEditor
                              key={field.id}
                              field={field}
                              index={index}
                              onUpdate={(updated) => updateField(index, updated)}
                              onRemove={() => removeField(index)}
                              onMoveUp={() => moveFieldUp(index)}
                              onMoveDown={() => moveFieldDown(index)}
                              isFirst={index === 0}
                              isLast={index === formFields.length - 1}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </CardContent>
              </Card>

              {/* Publishing Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Share2 className="h-5 w-5" />
                    Publishing Options
                  </CardTitle>
                  <CardDescription>Select relay to publish form</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {initialPublishRelays.map((relay) => (
                      <div
                        key={relay}
                        className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md border"
                      >
                        <Checkbox
                          id={`relay-${relay}`}
                          checked={selectedRelays.includes(relay)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRelays((prev) => [...prev, relay]);
                            } else {
                              setSelectedRelays((prev) => prev.filter((r) => r !== relay));
                            }
                          }}
                        />
                        <label
                          htmlFor={`relay-${relay}`}
                          className="text-xs font-mono truncate cursor-pointer flex-1"
                        >
                          {relay.replace('wss://', '').replace('ws://', '')}
                        </label>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Submit Buttons */}
              <div className="flex gap-2 sticky bottom-0 bg-background/80 backdrop-blur-sm p-4 border rounded-lg z-10">
                <Button onClick={handleSubmit} disabled={!formName.trim() || formFields.length === 0 || isPublishing}>
                  {isPublishing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                      {editingForm ? 'Updating...' : 'Publishing...'}
                    </>
                  ) : (
                    editingForm ? 'Update Form' : 'Publish Form'
                  )}
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={isPublishing}>
                  Cancel
                </Button>
              </div>
            </div>

            {/* Sidebar Palette */}
            {isSidebarOpen && (
              <div className="w-64 shrink-0 transition-all duration-300">
                <Card className="sticky top-6">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Fields
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
                      <PanelRightClose className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 px-3 pb-4">
                    <div className="grid grid-cols-1 gap-1">
                      {FIELD_TYPES.map((type) => (
                        <Button
                          key={type.value}
                          variant="ghost"
                          className="justify-start h-9 px-2 hover:bg-primary/10 hover:text-primary transition-all group"
                          onClick={() => addField(type.value)}
                        >
                          <span className="mr-2 text-muted-foreground group-hover:text-primary">
                            {type.icon}
                          </span>
                          <span className="text-xs font-medium">{type.label}</span>
                          <Plus className="ml-auto h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* List View */}
          <div className="space-y-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Forms</h2>
              <p className="text-muted-foreground">
                Create and manage Nostr forms (kind 30168)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Forms can be shared via link or embedded on static pages
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Form
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="filter-nostr-json"
                checked={filterByNostrJson}
                onCheckedChange={setFilterByNostrJson}
              />
              <Label
                htmlFor="filter-nostr-json"
                className="text-sm cursor-pointer flex items-center gap-2"
              >
                <Filter className="h-3 w-3" />
                Show only users from nostr.json
              </Label>
            </div>
          </div>

          <div className="space-y-4">
            {forms?.map((form) => (
              <FormCard
                key={form.eventId}
                form={form}
                user={user ?? null}
                isAdmin={isAdmin}
                onEdit={() => {
                  setFormName(form.name);
                  setFormDescription(form.description || '');
                  setFormFields([...form.fields]);
                  setFormSettings({ encrypted: !!(form.settings?.encrypted) });
                  setEditingForm(form);
                  setEditingFormResponseCount(responseCounts?.[`30168:${form.pubkey}:${form.id}`] || 0);
                  setIsCreating(true);
                  window.scrollTo(0, 0);
                }}
                onDuplicate={handleDuplicate}
                onDelete={(form) => {
                  setSelectedForm(form);
                  setDeleteDialogOpen(true);
                }}
                onShare={handleShare}
                onLinkPage={handleLinkPage}
                onViewResponses={handleViewResponses}
                responsesCount={responseCounts?.[`30168:${form.pubkey}:${form.id}`] || 0}
              />
            ))}

            {(!forms || forms.length === 0) && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No forms yet. Create your first form!</p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Form</DialogTitle>
            <DialogDescription>
              Share this form via link or embed it on your website.
            </DialogDescription>
          </DialogHeader>
          {selectedForm && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Form Link</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/form/${nip19.naddrEncode({
                      kind: 30168,
                      pubkey: selectedForm.pubkey,
                      identifier: selectedForm.id,
                      relays: selectedForm.relays.slice(0, 3),
                    })}`}
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={copyShareLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {selectedForm.linkedPath && (
                <div className="space-y-2">
                  <Label>Static Page Link</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}${selectedForm.linkedPath}`}
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" asChild>
                      <a
                        href={selectedForm.linkedPath}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Badge variant="secondary">
                  {selectedForm.fields.length} fields
                </Badge>
                <Badge variant="outline">
                  Created {new Date(selectedForm.created_at * 1000).toLocaleDateString()}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Page Dialog (Admin Only) */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Form to Page</DialogTitle>
            <DialogDescription>
              Link this form to a static page endpoint. The form will be accessible at the
              specified path.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="linked-path">Page Path</Label>
              <Input
                id="linked-path"
                value={linkedPath}
                onChange={(e) => setLinkedPath(e.target.value)}
                placeholder="/join-us-form"
              />
              <p className="text-xs text-muted-foreground">
                Example: /contact-form, /join-us, /survey
              </p>
            </div>
            {linkedPath && (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm">
                    Form will be available at:
                    <br />
                    <code className="text-xs font-mono">
                      {window.location.origin}
                      {linkedPath.startsWith('/') ? linkedPath : `/${linkedPath}`}
                    </code>
                  </p>
                </div>
                {(() => {
                  const conflict = getConflictForm(linkedPath);
                  if (conflict) {
                    return (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div className="text-xs text-destructive">
                          <p className="font-bold">Endpoint Conflict</p>
                          <p>
                            Already used by: <strong>{conflict.name}</strong>
                            {isMaster
                              ? " (Saving will override)"
                              : " (Only master admin can override)"}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveLinkedPath}>
              {linkedPath.trim() ? 'Save Link' : 'Remove Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Responses Dialog */}
      <Dialog open={responsesDialogOpen} onOpenChange={setResponsesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Form Responses</DialogTitle>
            <DialogDescription>
              {selectedForm?.name} — Created {selectedForm && new Date(selectedForm.created_at * 1000).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {selectedForm && <ResponseViewer form={selectedForm} />}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/30">
            <Button variant="outline" onClick={() => setResponsesDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Form</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedForm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
