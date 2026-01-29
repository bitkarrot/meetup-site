import { useState, useEffect, useRef, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useToast } from '@/hooks/useToast';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Eye, Layout, Share2, Search, Image as ImageIcon, Library, Loader2 } from 'lucide-react';
import { MediaSelectorDialog } from './MediaSelectorDialog';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { useAppContext } from '@/hooks/useAppContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  published: boolean;
  created_at: number;
  d: string;
  pubkey: string;
  kind: number;
}

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

function BlogPostCard({ post, user, usernameSearch, onEdit, onDelete }: {
  post: BlogPost;
  user: { pubkey: string } | undefined;
  usernameSearch: string;
  onEdit: (post: BlogPost) => void;
  onDelete: (post: BlogPost) => void;
}) {
  const { data: author } = useAuthor(post.pubkey);

  // Filter by username search
  if (usernameSearch.trim()) {
    const username = author?.metadata?.name || author?.metadata?.display_name || '';
    if (!username.toLowerCase().includes(usernameSearch.toLowerCase())) {
      return null;
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{post.title}</h3>
              <Badge variant={post.published ? 'default' : 'secondary'}>
                {post.published ? 'Published' : 'Draft'}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                Kind {post.kind}
              </Badge>
            </div>
            <AuthorInfo pubkey={post.pubkey} />
            <p className="text-sm text-muted-foreground line-clamp-2">
              {post.content.replace(/[*#>`]/g, '').slice(0, 200)}...
            </p>
            <p className="text-xs text-muted-foreground">
              Created: {new Date(post.created_at * 1000).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2 ml-4">
            {user && post.pubkey === user.pubkey && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onEdit(post)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(post)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminBlog() {
  const { nostr, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [usernameSearch, setUsernameSearch] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    published: false,
  });
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derive blossom relays (same as AdminNotes)
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
        const uploader = new BlossomUploader({
          servers: [defaultBlossomRelay],
          signer: user.signer,
        });

        const result = await uploader.upload(file);
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
          const newContent = formData.content.slice(0, start) + '\n' + urlText + '\n' + formData.content.slice(end);
          setFormData(prev => ({ ...prev, content: newContent }));
        } else {
          setFormData(prev => ({ ...prev, content: prev.content + '\n' + urlText }));
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

  // Initialize selected relays when publishRelays change
  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  // Fetch blog posts
  const { data: allPosts, refetch } = useQuery({
    queryKey: ['admin-blog-posts', user?.pubkey],
    queryFn: async () => {
      const signal = AbortSignal.timeout(5000);
      const filters: NostrFilter[] = [{ kinds: [30023], limit: 100 }];

      // If user is logged in, also fetch their private drafts (Kind 31234)
      if (user?.pubkey) {
        filters.push({ kinds: [31234], authors: [user.pubkey], '#k': ['30023'], limit: 50 });
      }

      const events = (await nostr.query(filters, { signal })).filter(event =>
        event.kind === 30023 ||
        (event.kind === 31234 && event.tags.some(([name, value]) => name === 'k' && value === '30023'))
      );

      const processedPosts = await Promise.all(events.map(async (event) => {
        const tags = event.tags || [];
        let content = event.content;
        let title = tags.find(([name]) => name === 'title')?.[1] || 'Untitled';
        let published = tags.find(([name]) => name === 'published')?.[1] === 'true' || !tags.find(([name]) => name === 'published');
        let d = tags.find(([name]) => name === 'd')?.[1] || event.id;

        // Handle Kind 31234 (NIP-37 Draft Wraps)
        if (event.kind === 31234) {
          published = false;
          try {
            if (user?.signer?.nip44) {
              const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
              const draftEvent = JSON.parse(decrypted);
              content = draftEvent.content || '';
              const draftTags = draftEvent.tags || [];
              title = draftTags.find(([name]: string[]) => name === 'title')?.[1] || title;
              d = draftTags.find(([name]: string[]) => name === 'd')?.[1] || d;
            } else if (user?.signer?.nip04) {
              const decrypted = await user.signer.nip04.decrypt(user.pubkey, event.content);
              const draftEvent = JSON.parse(decrypted);
              content = draftEvent.content || '';
              const draftTags = draftEvent.tags || [];
              title = draftTags.find(([name]: string[]) => name === 'title')?.[1] || title;
              d = draftTags.find(([name]: string[]) => name === 'd')?.[1] || d;
            } else {
              // Try to parse as unencrypted JSON if no decryption available
              try {
                const draftEvent = JSON.parse(event.content);
                content = draftEvent.content || '';
                const draftTags = draftEvent.tags || [];
                title = draftTags.find(([name]: string[]) => name === 'title')?.[1] || title;
                d = draftTags.find(([name]: string[]) => name === 'd')?.[1] || d;
              } catch {
                content = "[Encrypted Draft]";
              }
            }
          } catch (e) {
            console.error('Failed to decrypt draft:', e);
            content = "[Decryption Failed]";
          }
        }

        return {
          id: event.id,
          title,
          content,
          published,
          created_at: event.created_at,
          d,
          pubkey: event.pubkey,
          kind: event.kind,
        };
      }));

      // Deduplicate by d-tag, preferring Kind 31234 or newer events
      const deduped = processedPosts.reduce((acc: BlogPost[], post) => {
        const existingIndex = acc.findIndex(p => p.d === post.d && p.pubkey === post.pubkey);
        if (existingIndex === -1) {
          acc.push(post);
        } else {
          const existing = acc[existingIndex];
          // Prefer 31234 (private draft) over 30023 if same d-tag, or newer event
          if (post.kind === 31234 || post.created_at > existing.created_at) {
            acc[existingIndex] = post;
          }
        }
        return acc;
      }, []);

      return deduped.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!nostr,
  });

  // Note: We'll filter posts client-side based on author metadata in the render
  // This is a simple approach - for better performance with many posts,
  // consider using a separate component with useAuthor for each post
  const posts = allPosts;

  // Check if form is dirty
  const isDirty = editingPost
    ? (formData.title !== editingPost.title || formData.content !== editingPost.content || formData.published !== editingPost.published)
    : (formData.title.trim() !== '' || formData.content.trim() !== '');

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

  const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      return;
    }
    setIsCreating(false);
    setEditingPost(null);
    setFormData({ title: '', content: '', published: false });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim() || !formData.content.trim()) return;

    if (editingPost && editingPost.pubkey !== user.pubkey) {
      toast({
        title: "Error",
        description: "You cannot edit another user's post.",
        variant: "destructive"
      });
      return;
    }

    try {
      const dTag = editingPost?.d || `blog-${Date.now()}`;
      const tags = [
        ['d', dTag],
        ['title', formData.title],
        ['published', formData.published.toString()],
      ];

      if (formData.published) {
        console.log('Publishing as Kind 30023');
        // Publish as Kind 30023 (Long-form Content)
        await publishEvent({
          event: {
            kind: 30023,
            content: formData.content,
            tags: [
              ...tags,
              ['published_at', Math.floor(Date.now() / 1000).toString()]
            ],
          },
          relays: selectedRelays,
        });

        // If we were editing a private draft, delete it
        if (editingPost && editingPost.kind === 31234) {
          await publishEvent({
            event: {
              kind: 5,
              tags: [
                ['e', editingPost.id],
                ['a', `31234:${user.pubkey}:${editingPost.d}`]
              ],
            },
            relays: selectedRelays,
          });
        }

        toast({ title: "Success", description: "Post published successfully." });
      } else {
        console.log('Saving as Kind 31234 Draft');
        // Save as Kind 31234 (NIP-37 Draft Wrap) for privacy
        const draftEvent = {
          kind: 30023,
          content: formData.content,
          tags,
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

        await publishEvent({
          event: {
            kind: 31234,
            content: encryptedContent,
            tags: [
              ['d', dTag],
              ['k', '30023'],
            ],
          },
          relays: selectedRelays,
        });

        // If we were editing a published post, delete it
        if (editingPost && editingPost.kind === 30023) {
          await publishEvent({
            event: {
              kind: 5,
              tags: [
                ['e', editingPost.id],
                ['a', `30023:${user.pubkey}:${editingPost.d}`]
              ],
            },
            relays: selectedRelays,
          });
        }

        toast({ title: "Success", description: "Draft saved privately." });
      }

      // Reset form
      setFormData({ title: '', content: '', published: false });
      setIsCreating(false);
      setEditingPost(null);
      refetch();
    } catch (error: unknown) {
      console.error('Submit failed:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save post.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleEdit = (post: BlogPost) => {
    if (user && post.pubkey !== user.pubkey) {
      toast({
        title: "Error",
        description: "You cannot edit another user's post.",
        variant: "destructive"
      });
      return;
    }
    setFormData({
      title: post.title,
      content: post.content,
      published: post.published,
    });
    setEditingPost(post);
    setIsCreating(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = async (post: BlogPost) => {
    if (user && post.pubkey !== user.pubkey) {
      toast({
        title: "Error",
        description: "You cannot delete another user's post.",
        variant: "destructive"
      });
      return;
    }
    if (confirm('Are you sure you want to delete this post?')) {
      try {
        // Create a deletion event (kind 5)
        // For replaceable events, we should use both e and a tags
        await publishEvent({
          event: {
            kind: 5,
            tags: [
              ['e', post.id],
              ['a', `${post.kind}:${post.pubkey}:${post.d}`]
            ],
          },
          relays: selectedRelays,
        });
        toast({ title: "Success", description: "Post deleted successfully." });
        refetch();
      } catch (error: unknown) {
        console.error('Delete failed:', error);
        const errorMessage = error instanceof Error ? error.message : "Failed to delete post.";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      {isCreating ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              {editingPost ? 'Edit Post' : 'Create New Post'}
            </h2>
            <Button variant="outline" onClick={handleCancel}>
              Back to List
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter post title..."
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="content">Content (Markdown)</Label>
                  <Tabs defaultValue="edit" className="mt-2">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="edit">
                        <Layout className="h-4 w-4 mr-2" />
                        Edit
                      </TabsTrigger>
                      <TabsTrigger value="preview">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="edit" className="mt-2">
                      <Textarea
                        id="content"
                        ref={textareaRef}
                        value={formData.content}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        onPaste={handlePaste}
                        onDrop={handleDrop}
                        placeholder="Write your post in Markdown... (Paste or drop media files to upload)"
                        className="min-h-[300px] font-mono"
                        required
                      />
                      <div className="flex items-center gap-2 mt-2">
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
                                type="button"
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
                                type="button"
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

                        <MediaSelectorDialog
                          open={showMediaSelector}
                          onOpenChange={setShowMediaSelector}
                          onSelect={(url) => {
                            const textarea = textareaRef.current;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const newContent = formData.content.slice(0, start) + '\n' + url + '\n' + formData.content.slice(end);
                              setFormData(prev => ({ ...prev, content: newContent }));
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + url.length + 2, start + url.length + 2);
                              }, 0);
                            } else {
                              setFormData(prev => ({ ...prev, content: prev.content + '\n' + url + '\n' }));
                            }
                            setShowMediaSelector(false);
                          }}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="preview" className="mt-2">
                      <div className="min-h-[300px] p-4 border rounded-md prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-slate-950 overflow-auto">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {formData.content || "*Nothing to preview*"}
                        </ReactMarkdown>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="published"
                    checked={formData.published}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, published: checked }))}
                  />
                  <Label htmlFor="published">Publish immediately</Label>
                </div>

                {/* Relay Selection */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Share2 className="h-4 w-4" />
                    Publishing Relays
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
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
                </div>

                <div className="flex gap-2">
                  <Button type="submit">
                    {editingPost ? 'Update Post' : 'Create Post'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold tracking-tight">Blog Posts</h2>
              <p className="text-muted-foreground">
                Manage your blog posts and long-form content.
              </p>
              <div className="mt-3 max-w-sm">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by username..."
                    value={usernameSearch}
                    onChange={(e) => setUsernameSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Post
            </Button>
          </div>

          <div className="space-y-4">
            {posts?.map((post) => (
              <BlogPostCard
                key={post.id}
                post={post}
                user={user}
                usernameSearch={usernameSearch}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}

            {(!posts || posts.length === 0) && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">No blog posts yet. Create your first post!</p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}