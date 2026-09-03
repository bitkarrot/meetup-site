import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { nip19 } from 'nostr-tools';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { withTimeout } from '@/lib/promiseTimeout';
import { NoteContent } from '@/components/NoteContent';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useQuery, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { stripImageMetadata } from '@/lib/mediaProcessing';
import { queryWithNip65Fanout, getNip65ReadRelays } from '@/lib/queryRelays';
import {
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  Heart,
  Zap,
  Repeat2,
  Repeat,
  Share2,
  Copy,
  Image as ImageIcon,
  Smile,
  Loader2,
  Library,
  Clock,
  RefreshCw,
  MessageCircle,
  Link2,
  ChevronDown,
} from 'lucide-react';
import { MediaSelectorDialog } from './MediaSelectorDialog';
import { EventPickerDialog } from './EventPickerDialog';
import { MentionTextarea } from '@/components/MentionTextarea';
import { extractPTags } from '@/lib/mentions';
import { ExpandableSearch } from './ExpandableSearch';
import { SchedulePicker } from './SchedulePicker';
import { RepostDialog } from './RepostDialog';
import { format } from 'date-fns';
import { useCreateScheduledPost, useUpdateScheduledPost } from '@/hooks/useScheduledPosts';
import { useSchedulerHealth } from '@/hooks/useSchedulerHealth';
import type { ScheduleConfig } from '@/components/admin/SchedulePicker';
import type { NostrEvent } from '@/types/scheduled';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBlossomRelays } from '@/hooks/useBlossomRelays';
import {
  useNoteStats,
  EngagementPopover,
  filterSelf,
} from '@/components/EngagementStats';

// --- Types ---

interface Note {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
  tags: string[][];
  isDraft: boolean;
  dTag?: string;
  sig: string;
}

/** Filter notes by a case-insensitive content search query. */
function filterNotesByQuery(notes: Note[], query: string): Note[] {
  if (!query.trim()) return notes;
  const q = query.toLowerCase();
  return notes.filter((note) => note.content.toLowerCase().includes(q));
}

/**
 * Insert `text` at the textarea's current cursor position, replacing any
 * selection. Falls back to appending if the textarea ref is null. Restores
 * focus and places the caret after the inserted text.
 */
function insertAtCursor(
  textarea: HTMLTextAreaElement | null,
  text: string,
  content: string,
  setContent: (value: string) => void,
) {
  if (!textarea) {
    setContent(content + text);
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const newContent = content.slice(0, start) + text + content.slice(end);
  setContent(newContent);
  const pos = start + text.length;
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }, 0);
}

// --- Helper Components ---

function NoteCard({
  note,
  user,
  gateway,
  onEdit,
  onDelete,
  engagementFilters,
  relayUrl,
  publishRelays,
}: {
  note: Note;
  user: { pubkey: string } | undefined;
  gateway: string;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  engagementFilters?: { reactions: boolean, zaps: boolean, reposts: boolean, replies: boolean };
  relayUrl: string;
  publishRelays: string[];
}) {
  const stats = useNoteStats(note.id);
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);

  // Filter out the current user from engagement summaries
  const myPubkey = user?.pubkey;
  const reactionUsers = filterSelf(stats.reactionUsers, myPubkey);
  const zapUsers = filterSelf(stats.zapUsers, myPubkey);
  const repostUsers = filterSelf(stats.repostUsers, myPubkey);
  const replyUsers = filterSelf(stats.replyUsers, myPubkey);

  const noteId = useMemo(() => {
    try {
      return nip19.noteEncode(note.id);
    } catch {
      return note.id;
    }
  }, [note.id]);

  if (engagementFilters && !stats.isLoading) {
    const { reactions, zaps, reposts, replies } = engagementFilters;
    const isAnyFilterActive = reactions || zaps || reposts || replies;

    if (isAnyFilterActive) {
      const matchReactions = reactions && stats.reactions > 0;
      const matchZaps = zaps && stats.zaps > 0;
      const matchReposts = reposts && stats.reposts > 0;
      const matchReplies = replies && stats.replies > 0;

      if (!matchReactions && !matchZaps && !matchReposts && !matchReplies) {
        return null;
      }
    }
  }

  const cleanGateway = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;
  const noteUrl = `${cleanGateway}/${noteId}`;

  const engagementBadges = [
    { icon: Heart, count: stats.reactions, users: reactionUsers, title: 'Reactions',
      active: 'bg-red-500/10 border-red-500/20', iconActive: 'text-red-500 fill-red-500', textActive: 'text-red-500', label: String(stats.reactions) },
    { icon: Zap, count: stats.zaps, users: zapUsers, title: `${stats.zapAmount} sats`,
      active: 'bg-yellow-500/10 border-yellow-500/20', iconActive: 'text-yellow-500 fill-yellow-500', textActive: 'text-yellow-500',
      label: stats.zapAmount > 0 ? `${stats.zaps} · ${stats.zapAmount.toLocaleString()}` : String(stats.zaps) },
    { icon: Repeat2, count: stats.reposts, users: repostUsers, title: 'Reposts',
      active: 'bg-green-500/10 border-green-500/20', iconActive: 'text-green-500', textActive: 'text-green-500', label: String(stats.reposts) },
    { icon: MessageCircle, count: stats.replies, users: replyUsers, title: 'Replies',
      active: 'bg-blue-500/10 border-blue-500/20', iconActive: 'text-blue-500', textActive: 'text-blue-500', label: String(stats.replies) },
  ];

  return (
    <>
    <Card className="py-2">
      <CardContent className="py-2 px-4">
        {/* Top row: Badges on left, Engagement stats + Actions on right */}
        <div className="flex items-center justify-between gap-3 mb-2">
          {/* Left: spacer (badges removed — tab context is enough) */}
          <div className="flex-shrink-0" />

          {/* Right: Large engagement stats + action buttons */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Engagement stats - big and prominent for published notes */}
            {!note.isDraft && (
              <div className="flex items-center gap-2">
                {engagementBadges.map(({ icon: Icon, count, users, title, active, iconActive, textActive, label }, i) => (
                  <EngagementPopover key={i} users={users} count={users.length}>
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${count > 0
                        ? `${active} opacity-100`
                        : 'bg-muted/10 border-transparent opacity-30 grayscale'
                        }`}
                      title={title}
                    >
                      <Icon className={`h-5 w-5 ${count > 0 ? iconActive : 'text-muted-foreground'}`} />
                      <span className={`text-sm font-semibold ${count > 0 ? textActive : 'text-muted-foreground'}`}>{label}</span>
                    </div>
                  </EngagementPopover>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-1 flex-shrink-0">
              {!note.isDraft && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRepostOpen(true)} title="Schedule repost">
                  <Repeat className="h-4 w-4" />
                </Button>
              )}
              {user && note.pubkey === user.pubkey && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(note)} title="Edit">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(note)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content row: Compact single line with content preview and view link */}
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground truncate flex-1">
            {note.content.slice(0, 150)}{note.content.length > 150 ? '...' : ''}
          </p>
          {!note.isDraft && (
            <Button
              variant="link"
              size="sm"
              className="flex items-center gap-1 text-xs h-auto p-0 flex-shrink-0"
              onClick={() => setPreviewOpen(true)}
              title="Preview note"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </Button>
          )}
        </div>
      </CardContent>
    </Card>

    {/* In-tab note preview popup */}
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Note preview</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {format(new Date(note.created_at * 1000), 'MMM d, yyyy · h:mm a')}
          </p>
          <DialogDescription className="sr-only">
            Full content of note {noteId}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto pr-1 -mr-1">
          <NoteContent
            event={{
              id: note.id,
              pubkey: note.pubkey,
              created_at: note.created_at,
              kind: 1,
              content: note.content,
              tags: note.tags,
              sig: '',
            }}
            className="text-base whitespace-pre-wrap break-words"
          />
          <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
            <a
              href={noteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
            <div className="flex items-center gap-1.5 min-w-0 ml-auto">
              <span className="text-xs text-muted-foreground font-mono truncate">
                {noteId}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                title="Copy nostr:note ID"
                onClick={() => {
                  navigator.clipboard.writeText(`nostr:${noteId}`);
                  toast({ title: 'Copied', description: 'nostr:note ID copied to clipboard.' });
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Repost dialog */}
    {repostOpen && (
      <RepostDialog
        open={repostOpen}
        onOpenChange={setRepostOpen}
        target={{
          id: note.id,
          pubkey: note.pubkey,
          kind: 1,
          content: note.content,
          tags: note.tags,
          created_at: note.created_at,
          sig: note.sig,
        }}
        relayUrl={relayUrl}
        publishRelays={publishRelays}
        previewTitle={note.content.slice(0, 80).replace(/[*#>`]/g, '')}
      />
    )}
    </>
  );
}


// --- Main Component ---

export default function AdminNotes() {
  const location = useLocation();
  const { nostr, defaultRelayUrl, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { config } = useAppContext();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'drafts' | 'published'>('published');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingScheduledPostId, setEditingScheduledPostId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [engagementFilters, setEngagementFilters] = useState({
    reactions: false,
    zaps: false,
    reposts: false,
    replies: false
  });
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  // Track which action is in progress so only the clicked button shows loading.
  // 'draft' = Save Draft, 'publish' = Publish/Schedule, null = idle.
  const [pendingAction, setPendingAction] = useState<'draft' | 'publish' | null>(null);
  // NIP-10 p-tags for mentions in the composer, derived from content so they
  // stay correct whether content changes by typing, clearing, or loading a draft.
  const mentionTags = useMemo(() => extractPTags(content), [content]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    enabled: false,
    scheduledFor: null,
  });

  const { mutateAsync: createScheduledPost, isPending: isScheduling } = useCreateScheduledPost();
  const { mutateAsync: updateScheduledPost } = useUpdateScheduledPost();
  const { data: isSchedulerHealthy } = useSchedulerHealth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const gateway = config.siteConfig?.nip19Gateway || 'https://nostr.at';

  const blossomRelays = useBlossomRelays();

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: '200px' });

  // Fetch published notes (Kind 1) from the logged-in user with infinite scroll
  const {
    data: publishedNotesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchPublished
  } = useInfiniteQuery<Note[], Error, InfiniteData<Note[]>, readonly unknown[], number | undefined>({
    queryKey: ['admin-notes-published', user?.pubkey],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const until = pageParam;
      if (!user?.pubkey || !nostr) return [];
      const signal = AbortSignal.timeout(5000);
      // Fan out to NIP-65 relays since user's notes may live on multiple relays
      const nip65Relays = getNip65ReadRelays(config.relayMetadata);
      const events = await queryWithNip65Fanout(nostr, [
        {
          kinds: [1],
          authors: [user.pubkey],
          limit: 50,
          until
        }
      ], nip65Relays, signal);

      return events.map((event: NostrEvent) => ({
        id: event.id,
        content: event.content,
        created_at: event.created_at,
        pubkey: event.pubkey,
        tags: event.tags,
        isDraft: false,
        sig: event.sig,
      })).sort((a, b) => b.created_at - a.created_at);
    },
    getNextPageParam: (lastPage) => {
      // Keep fetching while the last page returned events. Relying on the page
      // length being exactly 50 is unreliable because NIP-65 fanout can dedupe
      // results across relays and return fewer events even when more exist.
      const lastNote = lastPage[lastPage.length - 1];
      if (!lastNote) return undefined;
      return lastNote.created_at - 1;
    },
    enabled: !!nostr && !!user?.pubkey,
  });

  const publishedNotes = useMemo(
    () => filterNotesByQuery(publishedNotesData?.pages.flat() || [], searchQuery),
    [publishedNotesData, searchQuery],
  );

  // Load more when scrolled to bottom
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Fetch draft notes (Kind 31234 with k=1) from the logged-in user
  const { data: draftNotes, refetch: refetchDrafts } = useQuery({
    queryKey: ['admin-notes-drafts', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey || !nostr) return [];
      const signal = AbortSignal.timeout(5000);
      const events = (await nostr.query([
        { kinds: [31234], authors: [user.pubkey], '#k': ['1'], limit: 50 }
      ], { signal })).filter(e => e.tags.some(([t, v]) => t === 'k' && v === '1'));

      const processedDrafts = await Promise.all(events.map(async (event: NostrEvent) => {
        let content = '[Encrypted Draft]';
        const dTag = event.tags.find(([name]) => name === 'd')?.[1];

        try {
          if (user?.signer?.nip44) {
            const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
            const draftEvent = JSON.parse(decrypted);
            content = draftEvent.content || '';
          } else if (user?.signer?.nip04) {
            const decrypted = await user.signer.nip04.decrypt(user.pubkey, event.content);
            const draftEvent = JSON.parse(decrypted);
            content = draftEvent.content || '';
          } else {
            try {
              const draftEvent = JSON.parse(event.content);
              content = draftEvent.content || '';
            } catch {
              content = '[Encrypted Draft]';
            }
          }
        } catch (e) {
          console.error('Failed to decrypt draft:', e);
        }

        return {
          id: event.id,
          content,
          created_at: event.created_at,
          pubkey: event.pubkey,
          tags: event.tags,
          isDraft: true,
          dTag,
          sig: event.sig,
        };
      }));

      return processedDrafts.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!nostr && !!user?.pubkey,
  });

  const filteredDraftNotes = useMemo(
    () => filterNotesByQuery(draftNotes || [], searchQuery),
    [draftNotes, searchQuery],
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchPublished(), refetchDrafts()]);
  }, [refetchPublished, refetchDrafts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initialize selected relays
  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  // Handle editing a scheduled post from the Scheduled page
  useEffect(() => {
    const editingScheduledPost = location.state?.editingScheduledPost;
    if (editingScheduledPost && editingScheduledPost.kind === 1) {
      // Populate form with scheduled post data
      setContent(editingScheduledPost.content || '');
      setEditingScheduledPostId(editingScheduledPost.scheduledPostId);
      setScheduleConfig({
        enabled: true,
        scheduledFor: editingScheduledPost.scheduledFor ? new Date(editingScheduledPost.scheduledFor) : null,
      });
      setSelectedRelays(editingScheduledPost.relays || []);
      setIsCreating(true);
      setEditorTab('edit');
      // Clear the location state to prevent re-populating on re-renders
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // Check if content is dirty
  const isDirty = useMemo(() => {
    if (editingNote) {
      return content !== editingNote.content;
    }
    return content.trim() !== '';
  }, [content, editingNote]);

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

  const resetEditor = useCallback(() => {
    setIsCreating(false);
    setEditingNote(null);
    setEditingScheduledPostId(null);
    setContent('');
    setEditorTab('edit');
    setScheduleConfig({ enabled: false, scheduledFor: null });
    setPendingAction(null);
  }, []);

  const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      return;
    }
    resetEditor();
  };

  const handleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0 || !user) return;

    const defaultBlossomRelay = blossomRelays[0];
    if (!defaultBlossomRelay) {
      toast({
        title: 'No Blossom Server',
        description: 'Please configure a Blossom server in Media settings first.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      const urls: string[] = [];

      for (const file of files) {
        // Strip metadata from images before upload
        const { file: strippedFile, stripped, reason } = await stripImageMetadata(file);
        if (!stripped && reason === 'gif') {
          toast({
            title: 'Metadata not stripped',
            description: `${file.name}: GIF files cannot be metadata-stripped. EXIF/GPS data may be visible.`,
            variant: 'destructive',
          });
        }

        const uploader = new BlossomUploader({
          servers: [defaultBlossomRelay],
          signer: user.signer,
        });

        const result = await uploader.upload(strippedFile);
        if (result && result.length > 0) {
          const urlTag = result.find((tag: string[]) => tag[0] === 'url');
          if (urlTag && urlTag[1]) {
            urls.push(urlTag[1]);
          }
        }
      }

      if (urls.length > 0) {
        const urlText = urls.join('\n');
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newContent = content.slice(0, start) + '\n' + urlText + '\n' + content.slice(end);
          setContent(newContent);
        } else {
          setContent(prev => prev + '\n' + urlText);
        }

        toast({
          title: 'Upload Successful',
          description: `Uploaded ${urls.length} file(s) to ${defaultBlossomRelay}`,
        });
      }
    } catch (err) {
      console.error('Upload failed:', err);
      toast({
        title: 'Upload Failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(Array.from(files));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (files.length > 0) {
      e.preventDefault();
      handleFileUpload(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files)
      .filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));

    if (files.length > 0) {
      e.preventDefault();
      handleFileUpload(files);
    }
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!user || !content.trim()) return;

    setPendingAction(asDraft ? 'draft' : 'publish');
    const relaysToUse = selectedRelays.length > 0 ? selectedRelays : initialPublishRelays;

    // If scheduling is enabled and not saving as draft
    if (scheduleConfig.enabled && scheduleConfig.scheduledFor && !asDraft) {
      try {
        // Create pre-signed event with future timestamp
        const scheduledFor = scheduleConfig.scheduledFor;
        const created_at = Math.floor(scheduledFor.getTime() / 1000);

        // Create and sign the event with future timestamp
        const signedEvent = await withTimeout(
          user.signer.signEvent({
            kind: 1,
            content: content,
            tags: mentionTags,
            created_at,
          }) as Promise<NostrEvent>,
          60_000,
          'Signing timed out. Check that your signer is unlocked and authorized.',
        );

        if (signedEvent.pubkey !== user.pubkey) {
          throw new Error(
            'The signer returned a different public key than the logged-in user. ' +
            `Make sure your extension/bunker is switched to ${user.pubkey}, not ${signedEvent.pubkey}.`,
          );
        }

        // Update existing scheduled post or create new one
        if (editingScheduledPostId) {
          await updateScheduledPost({
            id: editingScheduledPostId,
            userPubkey: user.pubkey,
            updates: {
              signed_event: signedEvent,
              scheduled_for: scheduledFor.toISOString(),
              relays: relaysToUse,
            },
          });

          toast({
            title: 'Scheduled Post Updated',
            description: `Your scheduled note has been updated for ${scheduledFor.toLocaleString()}`,
          });
        } else {
          // Store in InsForge for scheduled publishing
          await createScheduledPost({
            signedEvent,
            kind: 1,
            scheduledFor: scheduledFor,
            relays: relaysToUse,
            userPubkey: user.pubkey,
          });

          toast({
            title: 'Note Scheduled',
            description: `Your note will be published at ${scheduledFor.toLocaleString()}`,
          });
        }

        resetEditor();
        return;
      } catch (error) {
        console.error('Failed to schedule note:', error);
        setPendingAction(null);
        toast({
          title: 'Error',
          description: (error as Error).message || 'Failed to schedule note.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Normal publish or draft save
    try {
      if (asDraft) {
        const draftEvent = {
          kind: 1,
          content: content,
          tags: mentionTags,
          created_at: Math.floor(Date.now() / 1000),
        };

        let encryptedContent: string;
        if (user.signer.nip44) {
          encryptedContent = await withTimeout(
            user.signer.nip44.encrypt(user.pubkey, JSON.stringify(draftEvent)),
            60_000,
            'Encryption timed out. Check that your signer is unlocked and authorized.',
          );
        } else if (user.signer.nip04) {
          encryptedContent = await withTimeout(
            user.signer.nip04.encrypt(user.pubkey, JSON.stringify(draftEvent)),
            60_000,
            'Encryption timed out. Check that your signer is unlocked and authorized.',
          );
        } else {
          encryptedContent = JSON.stringify(draftEvent);
        }

        const dTag = editingNote?.dTag || `note-${Date.now()}`;

        await publishEvent({
          event: {
            kind: 31234,
            content: encryptedContent,
            tags: [
              ['d', dTag],
              ['k', '1'],
            ],
          },
          relays: relaysToUse,
        });

        toast({ title: 'Draft Saved', description: 'Your note draft has been saved privately.' });
      } else {
        await publishEvent({
          event: {
            kind: 1,
            content: content,
            tags: mentionTags,
          },
          relays: relaysToUse,
        });

        if (editingNote?.isDraft && editingNote.dTag) {
          await publishEvent({
            event: {
              kind: 5,
              tags: [
                ['e', editingNote.id],
                ['a', `31234:${user.pubkey}:${editingNote.dTag}`]
              ],
            },
            relays: relaysToUse,
          });
        }

        toast({ title: 'Note Published', description: 'Your note has been published to the network!' });
      }

      resetEditor();
      // Delay refetch so the relay has time to index the just-published event.
      // Without this, drafts/notes don't appear on first save (especially when
      // the NIP-07 extension adds latency for first-time kind authorization).
      setTimeout(() => refetchAll(), 500);
    } catch (error) {
      console.error('Failed to save/publish note:', error);
      setPendingAction(null);
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to save note.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (note: Note) => {
    if (!user || note.pubkey !== user.pubkey) return;

    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const tags: string[][] = [['e', note.id]];
      if (note.isDraft && note.dTag) {
        tags.push(['a', `31234:${user.pubkey}:${note.dTag}`]);
      }

      await publishEvent({
        event: {
          kind: 5,
          tags,
        },
        relays: initialPublishRelays,
      });

      toast({ title: 'Deleted', description: 'Note deleted successfully.' });
      setTimeout(() => refetchAll(), 500);
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to delete note.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setEditingScheduledPostId(null);
    setContent(note.content);
    setIsCreating(true);
    setScheduleConfig({ enabled: false, scheduledFor: null });
    window.scrollTo(0, 0);
  };

  return (
    <div className="space-y-6">
      {isCreating ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              {editingScheduledPostId ? 'Edit Scheduled Post' : editingNote ? 'Edit Note' : 'Create New Note'}
            </h2>
            <Button variant="outline" onClick={handleCancel}>
              Back to List
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <Tabs value={editorTab} onValueChange={(v) => setEditorTab(v as 'edit' | 'preview')}>
                <TabsList className="grid w-fit grid-cols-2">
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="mt-2">
                  <MentionTextarea
                    ref={textareaRef}
                    value={content}
                    onChange={setContent}
                    onPaste={handlePaste}
                    onDrop={handleDrop}
                    placeholder="Write something... (Paste or drop media files to upload, type @ to mention)"
                    className="min-h-[200px] resize-none"
                    required
                  />
                </TabsContent>

                <TabsContent value="preview" className="mt-2">
                  <div className="min-h-[200px] p-4 border rounded-md max-w-none bg-muted/30">
                    {content ? (
                      <NoteContent
                        event={{ content, kind: 1, tags: [], created_at: 0, id: '', pubkey: '', sig: '' }}
                        truncateEmbeds={false}
                      />
                    ) : (
                      <span className="text-muted-foreground italic">Nothing to preview</span>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Schedule Picker */}
              {isSchedulerHealthy && (
                <SchedulePicker
                  value={scheduleConfig}
                  onChange={setScheduleConfig}
                  disabled={isPending || isScheduling}
                />
              )}

              {/* Publishing Relays — collapsed under Advanced */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors pt-2">
                  <Share2 className="h-4 w-4" />
                  Advanced: Publishing Relays
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
                    {initialPublishRelays.map((relay) => (
                      <div key={relay} className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md border">
                        <Checkbox
                          id={`relay-${relay}`}
                          checked={selectedRelays.includes(relay)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRelays(prev => [...prev, relay]);
                            } else {
                              setSelectedRelays(prev => prev.filter(r => r !== relay));
                            }
                          }}
                        />
                        <label
                          htmlFor={`relay-${relay}`}
                          className="text-xs font-mono truncate cursor-pointer flex-1"
                          title={relay}
                        >
                          {relay.replace('wss://', '').replace('ws://', '')}
                        </label>
                      </div>
                    ))}
                    {initialPublishRelays.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No publishing relays configured.</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Footer Actions */}
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleManualUpload}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Upload Media</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => setShowMediaSelector(true)}
                        >
                          <Library className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Media Library</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => setShowEventPicker(true)}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Insert Event</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="relative">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          >
                            <Smile className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Insert Emoji</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {showEmojiPicker && (
                      <div className="absolute bottom-full left-0 mb-2 p-2 bg-popover border rounded-lg shadow-lg z-50 w-64">
                        <div className="grid grid-cols-8 gap-1">
                          {['😀', '😂', '🥰', '😎', '🤔', '😢', '😡', '🎉',
                            '❤️', '🔥', '⚡', '💜', '🙏', '👀', '🚀', '💯',
                            '👍', '👎', '👏', '🙌', '💪', '✨', '🌟', '⭐',
                            '🎵', '📸', '💻', '📱', '🔗', '✅', '❌', '⚠️'].map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                className="p-1 hover:bg-muted rounded text-lg transition-colors"
                                onClick={() => {
                                  insertAtCursor(textareaRef.current, emoji, content, setContent);
                                  setShowEmojiPicker(false);
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <MediaSelectorDialog
                    open={showMediaSelector}
                    onOpenChange={setShowMediaSelector}
                    onSelect={(url) => {
                      insertAtCursor(textareaRef.current, `\n${url}\n`, content, setContent);
                      setShowMediaSelector(false);
                    }}
                  />

                  <EventPickerDialog
                    open={showEventPicker}
                    onOpenChange={setShowEventPicker}
                    onSelect={(nostrRef) => {
                      insertAtCursor(textareaRef.current, `\n${nostrRef}\n`, content, setContent);
                    }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleSubmit(true)}
                    disabled={!!pendingAction || !content.trim()}
                    className={pendingAction === 'draft' ? 'btn-loading-snake' : ''}
                  >
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => handleSubmit(false)}
                    disabled={!!pendingAction || !content.trim()}
                    className={pendingAction === 'publish' ? 'btn-loading-snake' : ''}
                  >
                    {scheduleConfig.enabled ? (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        {editingScheduledPostId ? 'Update Scheduled Post' : 'Schedule Note'}
                      </>
                    ) : editingNote?.isDraft ? (
                      'Publish Note'
                    ) : editingNote ? (
                      'Update Note'
                    ) : (
                      'Post Note'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Notes</h2>
              <p className="text-muted-foreground">
                Create and manage your short-form notes (Kind 1).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ExpandableSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search notes by content..."
                open={searchOpen}
                onOpenChange={setSearchOpen}
              />
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button onClick={() => { resetEditor(); setIsCreating(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Note
                </Button>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'drafts' | 'published')}>
            <TabsList className="grid w-full grid-cols-2 sm:w-fit">
              <TabsTrigger value="drafts">
                Drafts
                {draftNotes && draftNotes.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1 text-xs">
                    {draftNotes.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="published">
                Published
                {publishedNotes && publishedNotes.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1 text-xs">
                    {publishedNotes.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {activeTab === 'published' && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-lg border ml-auto">
                  <Button
                    variant={engagementFilters.reactions ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-10 px-0"
                    onClick={() => setEngagementFilters(prev => ({ ...prev, reactions: !prev.reactions }))}
                    title="Filter by Likes"
                  >
                    <Heart className={cn("h-4 w-4", engagementFilters.reactions && "fill-current")} />
                  </Button>
                <Button
                  variant={engagementFilters.zaps ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 w-10 px-0"
                  onClick={() => setEngagementFilters(prev => ({ ...prev, zaps: !prev.zaps }))}
                  title="Filter by Zaps"
                >
                  <Zap className={cn("h-4 w-4", engagementFilters.zaps && "fill-current")} />
                </Button>
                <Button
                  variant={engagementFilters.reposts ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 w-10 px-0"
                  onClick={() => setEngagementFilters(prev => ({ ...prev, reposts: !prev.reposts }))}
                  title="Filter by Reposts"
                >
                  <Repeat2 className="h-4 w-4" />
                </Button>
                <Button
                  variant={engagementFilters.replies ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 w-10 px-0"
                  onClick={() => setEngagementFilters(prev => ({ ...prev, replies: !prev.replies }))}
                  title="Filter by Replies"
                >
                  <MessageCircle className={cn("h-4 w-4", engagementFilters.replies && "fill-current")} />
                </Button>
                </div>
              </div>
            )}

            <TabsContent value="drafts" className="mt-4 space-y-4">
              {filteredDraftNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  user={user}
                  gateway={gateway}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  relayUrl={defaultRelayUrl || ''}
                  publishRelays={initialPublishRelays}
                />
              ))}
              {filteredDraftNotes.length === 0 && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-muted-foreground">
                      {searchQuery ? 'No drafts match your search.' : 'No draft notes. Create a new note!'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="published" className="mt-4 space-y-4">
              {publishedNotes?.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  user={user}
                  gateway={gateway}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  engagementFilters={engagementFilters}
                  relayUrl={defaultRelayUrl || ''}
                  publishRelays={initialPublishRelays}
                />
              ))}

              {/* Infinite scroll marker */}
              {(publishedNotes && publishedNotes.length > 0) && (
                <div ref={loadMoreRef} className="py-4 flex flex-col items-center justify-center gap-2">
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-[10px] text-muted-foreground animate-pulse">Loading more notes...</p>
                    </>
                  ) : hasNextPage ? (
                    <div className="h-1 w-24 bg-muted/20 rounded-full overflow-hidden">
                      <div className="h-full bg-primary/20 animate-shimmer" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 opacity-30">
                      <div className="h-px w-8 bg-muted-foreground" />
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">End of Notes</p>
                      <div className="h-px w-8 bg-muted-foreground" />
                    </div>
                  )}
                </div>
              )}
              {(!publishedNotes || publishedNotes.length === 0) && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-muted-foreground">
                      {searchQuery ? 'No published notes match your search.' : 'No published notes yet.'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
