import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { nip19 } from 'nostr-tools';
import { NoteContent } from '@/components/NoteContent';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useAuthor } from '@/hooks/useAuthor';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  Heart,
  Zap,
  Repeat2,
  Share2,
  Image as ImageIcon,
  Smile,
  Loader2,
  Filter
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// --- Types ---

interface Note {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
  tags: string[][];
  isDraft: boolean;
  dTag?: string;
}

interface NoteStats {
  reactions: number;
  zaps: number;
  zapAmount: number;
  reposts: number;
}

// --- Helper Components ---

function AuthorInfo({ pubkey }: { pubkey: string }) {
  const { data: author } = useAuthor(pubkey);
  let npub = '';
  try {
    if (pubkey && /^[0-9a-f]{64}$/.test(pubkey)) {
      npub = nip19.npubEncode(pubkey);
    }
  } catch (e) {
    console.error('Error encoding npub:', e);
  }

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-5 w-5">
        <AvatarImage src={author?.metadata?.picture} />
        <AvatarFallback>{author?.metadata?.name?.charAt(0) || '?'}</AvatarFallback>
      </Avatar>
      {npub ? (
        <a
          href={`https://nostr.at/${npub}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium hover:underline"
        >
          {author?.metadata?.name || author?.metadata?.display_name || 'Anonymous'}
        </a>
      ) : (
        <span className="text-xs font-medium">
          {author?.metadata?.name || author?.metadata?.display_name || 'Anonymous'}
        </span>
      )}
    </div>
  );
}

function useNoteStats(noteId: string, notePubkey: string): NoteStats & { isLoading: boolean } {
  const { nostr } = useNostr();

  const { data, isLoading } = useQuery({
    queryKey: ['note-stats', noteId],
    queryFn: async () => {
      const signal = AbortSignal.timeout(5000);

      // Fetch reactions (kind 7), zaps (kind 9735), and reposts (kind 6)
      const [reactions, zaps, reposts] = await Promise.all([
        nostr.query([{ kinds: [7], '#e': [noteId] }], { signal }),
        nostr.query([{ kinds: [9735], '#e': [noteId] }], { signal }),
        nostr.query([{ kinds: [6], '#e': [noteId] }], { signal }),
      ]);

      // Calculate zap amount
      let zapAmount = 0;
      zaps.forEach(zap => {
        // Try to extract amount from bolt11 or amount tag
        const amountTag = zap.tags.find(([name]) => name === 'amount')?.[1];
        if (amountTag) {
          zapAmount += Math.floor(parseInt(amountTag) / 1000);
        } else {
          const descriptionTag = zap.tags.find(([name]) => name === 'description')?.[1];
          if (descriptionTag) {
            try {
              const zapRequest = JSON.parse(descriptionTag);
              const requestAmountTag = zapRequest.tags?.find(([name]: string[]) => name === 'amount')?.[1];
              if (requestAmountTag) {
                zapAmount += Math.floor(parseInt(requestAmountTag) / 1000);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      });

      return {
        reactions: reactions.length,
        zaps: zaps.length,
        zapAmount,
        reposts: reposts.length,
      };
    },
    enabled: !!noteId,
    staleTime: 60000,
  });

  return {
    reactions: data?.reactions ?? 0,
    zaps: data?.zaps ?? 0,
    zapAmount: data?.zapAmount ?? 0,
    reposts: data?.reposts ?? 0,
    isLoading,
  };
}

function NoteCard({
  note,
  user,
  gateway,
  onEdit,
  onDelete,
  onPublish,
  hideIfNoEngagement
}: {
  note: Note;
  user: { pubkey: string } | undefined;
  gateway: string;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  onPublish?: (note: Note) => void;
  hideIfNoEngagement?: boolean;
}) {
  const stats = useNoteStats(note.id, note.pubkey);

  if (hideIfNoEngagement &&
    !stats.isLoading &&
    stats.reactions === 0 &&
    stats.zaps === 0 &&
    stats.reposts === 0) {
    return null;
  }
  const noteId = useMemo(() => {
    try {
      return nip19.noteEncode(note.id);
    } catch {
      return note.id;
    }
  }, [note.id]);

  const cleanGateway = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;
  const noteUrl = `${cleanGateway}/${noteId}`;

  return (
    <Card className="py-2">
      <CardContent className="py-2 px-4">
        {/* Top row: Badges on left, Engagement stats + Actions on right */}
        <div className="flex items-center justify-between gap-3 mb-2">
          {/* Left: Status badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={note.isDraft ? 'secondary' : 'default'} className="text-xs">
              {note.isDraft ? 'Draft' : 'Published'}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono">
              Kind 1
            </Badge>
          </div>

          {/* Right: Large engagement stats + action buttons */}
          <div className="flex items-center gap-3">
            {/* Engagement stats - big and prominent for published notes */}
            {!note.isDraft && (
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${stats.reactions > 0
                    ? 'bg-red-500/10 border-red-500/20 opacity-100'
                    : 'bg-muted/10 border-transparent opacity-30 grayscale'
                    }`}
                  title="Reactions"
                >
                  <Heart className={`h-5 w-5 ${stats.reactions > 0 ? 'text-red-500 fill-red-500' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-semibold ${stats.reactions > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{stats.reactions}</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${stats.zaps > 0
                    ? 'bg-yellow-500/10 border-yellow-500/20 opacity-100'
                    : 'bg-muted/10 border-transparent opacity-30 grayscale'
                    }`}
                  title={`${stats.zapAmount} sats`}
                >
                  <Zap className={`h-5 w-5 ${stats.zaps > 0 ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-semibold ${stats.zaps > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                    {stats.zaps}{stats.zapAmount > 0 ? ` · ${stats.zapAmount.toLocaleString()}` : ''}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${stats.reposts > 0
                    ? 'bg-green-500/10 border-green-500/20 opacity-100'
                    : 'bg-muted/10 border-transparent opacity-30 grayscale'
                    }`}
                  title="Reposts"
                >
                  <Repeat2 className={`h-5 w-5 ${stats.reposts > 0 ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-semibold ${stats.reposts > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>{stats.reposts}</span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-1 flex-shrink-0">
              {user && note.pubkey === user.pubkey && (
                <>
                  {note.isDraft && onPublish && (
                    <Button variant="default" size="icon" className="h-7 w-7" onClick={() => onPublish(note)} title="Publish">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
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
            <a
              href={noteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Create Note Dialog ---

function CreateNoteDialog({
  open,
  onOpenChange,
  editingNote,
  publishRelays,
  blossomRelays,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingNote: Note | null;
  publishRelays: string[];
  blossomRelays: string[];
  onSuccess: () => void;
}) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { toast } = useToast();

  const [content, setContent] = useState('');
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize form when editing
  useEffect(() => {
    if (editingNote) {
      setContent(editingNote.content);
    } else {
      setContent('');
    }
  }, [editingNote]);

  // Initialize selected relays
  useEffect(() => {
    if (publishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(publishRelays);
    }
  }, [publishRelays, selectedRelays.length]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
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

      for (const file of Array.from(files)) {
        const uploader = new BlossomUploader({
          servers: [defaultBlossomRelay],
          signer: user.signer,
        });

        const result = await uploader.upload(file);
        // BlossomUploader returns tags array like [["url", "https://..."]]
        if (result && result.length > 0) {
          const urlTag = result.find((tag: string[]) => tag[0] === 'url');
          if (urlTag && urlTag[1]) {
            urls.push(urlTag[1]);
          }
        }
      }

      // Insert URLs at cursor position or at end
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

  const handleSubmit = async (asDraft: boolean) => {
    if (!user || !content.trim()) return;

    try {
      if (asDraft) {
        // Save as Kind 31234 (NIP-37 Draft Wrap) for drafts
        const draftEvent = {
          kind: 1,
          content: content,
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
        };

        let encryptedContent: string;
        if (user.signer.nip44) {
          encryptedContent = await user.signer.nip44.encrypt(user.pubkey, JSON.stringify(draftEvent));
        } else if (user.signer.nip04) {
          encryptedContent = await user.signer.nip04.encrypt(user.pubkey, JSON.stringify(draftEvent));
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
          relays: selectedRelays,
        });

        toast({ title: 'Draft Saved', description: 'Your note draft has been saved privately.' });
      } else {
        // Publish as Kind 1
        await publishEvent({
          event: {
            kind: 1,
            content: content,
            tags: [],
          },
          relays: selectedRelays,
        });

        // If editing a draft, delete it after publishing
        if (editingNote?.isDraft && editingNote.dTag) {
          await publishEvent({
            event: {
              kind: 5,
              tags: [
                ['e', editingNote.id],
                ['a', `31234:${user.pubkey}:${editingNote.dTag}`]
              ],
            },
            relays: selectedRelays,
          });
        }

        toast({ title: 'Note Published', description: 'Your note has been published to the network!' });
      }

      setContent('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Failed to save/publish note:', error);
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to save note.',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    if (content.trim() && !confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    setContent('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingNote ? 'Edit Note' : 'New Note'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Edit/Preview Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
            <TabsList className="grid w-fit grid-cols-2">
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="mt-2">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write something... (Paste or drop media files to upload)"
                className="min-h-[200px] resize-none"
              />
            </TabsContent>

            <TabsContent value="preview" className="mt-2">
              <div className="min-h-[200px] p-4 border rounded-md max-w-none bg-muted/30 overflow-auto">
                {content ? (
                  <NoteContent
                    event={{ content, kind: 1, tags: [], created_at: 0, id: '', pubkey: '', sig: '' }}
                  />
                ) : (
                  <span className="text-muted-foreground italic">Nothing to preview</span>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Relay Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Share2 className="h-4 w-4" />
              Post to
              <Badge variant="outline" className="text-xs">Optimal relays</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 max-h-32 overflow-y-auto">
              {publishRelays.map((relay) => (
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
            </div>
          </div>
        </div>

        {/* Footer with action buttons */}
        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <div className="flex items-center justify-between w-full">
            {/* Left side - media buttons */}
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*"
                multiple
                onChange={handleFileUpload}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Upload image"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              </Button>

              {/* Emoji Picker */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Insert emoji"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  type="button"
                >
                  <Smile className="h-4 w-4" />
                </Button>
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
                              const textarea = textareaRef.current;
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const newContent = content.slice(0, start) + emoji + content.slice(end);
                                setContent(newContent);
                                // Set cursor position after emoji
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + emoji.length, start + emoji.length);
                                }, 0);
                              } else {
                                setContent(prev => prev + emoji);
                              }
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
            </div>

            {/* Right side - action buttons */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Mentions</span>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleSubmit(true)}
                disabled={isPending || !content.trim()}
              >
                Save Draft
              </Button>
              <Button
                onClick={() => handleSubmit(false)}
                disabled={isPending || !content.trim()}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Post
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Component ---

export default function AdminNotes() {
  const { nostr, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { config } = useAppContext();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'drafts' | 'published'>('published');
  const [isCreating, setIsCreating] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showOnlyEngaged, setShowOnlyEngaged] = useState(false);

  const gateway = config.siteConfig?.nip19Gateway || 'https://nostr.at';

  // Derive blossom relays including the default relay (same logic as AdminMedia)
  const blossomRelays = useMemo(() => {
    const storedRelays = config.siteConfig?.blossomRelays || [];
    const excludedRelays = config.siteConfig?.excludedBlossomRelays || [];
    const relays = [...storedRelays];
    const defaultRelay = config.siteConfig?.defaultRelay;

    if (defaultRelay) {
      let normalizedDefault = defaultRelay.replace(/\/$/, '');
      if (normalizedDefault.startsWith('wss://')) {
        normalizedDefault = normalizedDefault.replace('wss://', 'https://');
      } else if (normalizedDefault.startsWith('ws://')) {
        normalizedDefault = normalizedDefault.replace('ws://', 'http://');
      }

      const isExcluded = excludedRelays.includes(normalizedDefault);

      if ((normalizedDefault.startsWith('http://') || normalizedDefault.startsWith('https://')) && !relays.includes(normalizedDefault) && !isExcluded) {
        relays.unshift(normalizedDefault);
      }
    }

    return relays;
  }, [config.siteConfig?.blossomRelays, config.siteConfig?.defaultRelay, config.siteConfig?.excludedBlossomRelays]);

  // Fetch published notes (Kind 1) from the logged-in user
  const { data: publishedNotes, refetch: refetchPublished } = useQuery({
    queryKey: ['admin-notes-published', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];
      const signal = AbortSignal.timeout(5000);
      const events = await nostr.query([
        { kinds: [1], authors: [user.pubkey], limit: 100 }
      ], { signal });

      return events.map((event: NostrEvent) => ({
        id: event.id,
        content: event.content,
        created_at: event.created_at,
        pubkey: event.pubkey,
        tags: event.tags,
        isDraft: false,
      })).sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!nostr && !!user?.pubkey,
  });

  // Fetch draft notes (Kind 31234 with k=1) from the logged-in user
  const { data: draftNotes, refetch: refetchDrafts } = useQuery({
    queryKey: ['admin-notes-drafts', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];
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
        };
      }));

      return processedDrafts.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!nostr && !!user?.pubkey,
  });

  const refetchAll = useCallback(() => {
    refetchPublished();
    refetchDrafts();
  }, [refetchPublished, refetchDrafts]);

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
      refetchAll();
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
    setIsCreating(true);
  };

  const handlePublishDraft = async (note: Note) => {
    setEditingNote(note);
    setIsCreating(true);
  };

  const notes = activeTab === 'drafts' ? draftNotes : publishedNotes;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notes</h2>
          <p className="text-muted-foreground">
            Create and manage your short-form notes (Kind 1).
          </p>
        </div>
        <Button onClick={() => { setEditingNote(null); setIsCreating(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Note
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'drafts' | 'published')}>
        <div className="flex items-center justify-between">
          <TabsList className="grid w-fit grid-cols-2">
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
            <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-lg border">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="engaged-filter" className="text-xs cursor-pointer">Engagement only</Label>
              <Switch
                id="engaged-filter"
                checked={showOnlyEngaged}
                onCheckedChange={setShowOnlyEngaged}
              />
            </div>
          )}
        </div>

        <TabsContent value="drafts" className="mt-4 space-y-4">
          {draftNotes?.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              user={user}
              gateway={gateway}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPublish={handlePublishDraft}
            />
          ))}
          {(!draftNotes || draftNotes.length === 0) && (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No draft notes. Create a new note!</p>
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
              hideIfNoEngagement={showOnlyEngaged}
            />
          ))}
          {(!publishedNotes || publishedNotes.length === 0) && (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No published notes yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <CreateNoteDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        editingNote={editingNote}
        publishRelays={initialPublishRelays}
        blossomRelays={blossomRelays}
        onSuccess={refetchAll}
      />
    </div>
  );
}
