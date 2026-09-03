import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useAuthor } from '@/hooks/useAuthor';
import { useRemoteNostrJson } from '@/hooks/useRemoteNostrJson';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Plus, Edit, Trash2, Eye, Layout, Share2, Globe, User, Filter, RefreshCw, Search, ChevronDown, Code, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { MarkdownToolbar } from './settings/MarkdownToolbar';
import { PageContent } from './settings/PageContent';
import { getPageLabel } from './settings/types';
import { titleToSlug } from './settings/slug';

interface StaticPage {
  id: string;
  path: string;
  content: string;
  sha256: string;
  created_at: number;
  pubkey: string;
  relays: string[];
  homepageSection: boolean;
}

function PageCard({ page, user, onEdit, onDelete }: {
  page: StaticPage;
  user: { pubkey: string } | null;
  onEdit: (page: StaticPage) => void;
  onDelete: (page: StaticPage) => void;
}) {
  const { data: authorData } = useAuthor(page.pubkey);
  const metadata = authorData?.metadata;
  const displayName = metadata?.name || metadata?.display_name || `${page.pubkey.slice(0, 8)}...`;
  const title = getPageLabel(page.path);
  const canEdit = user && page.pubkey === user.pubkey;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Globe className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-lg font-semibold break-words">{title}</h3>
              {page.homepageSection && (
                <Badge variant="secondary" className="shrink-0">On Homepage</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback><User className="h-3 w-3" /></AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">{displayName}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {new Date(page.created_at * 1000).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {page.content.replace(/[*#>`[\]()!]/g, '').slice(0, 200)}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(true)} title="Preview page">
              <Eye className="h-4 w-4" />
            </Button>
            {canEdit && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onEdit(page)} title="Edit page">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(page)} title="Delete page">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>

      {/* Preview dialog — renders page content inline, no new tab */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" hideCloseButton>
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pr-0">
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" title="Close">
                <X className="h-5 w-5" />
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6 pb-2">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <PageContent content={page.content} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AdminPages() {
  const { nostr, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { toast } = useToast();
  const { data: remoteNostrJson } = useRemoteNostrJson();

  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingPage, setEditingPage] = useState<StaticPage | null>(null);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [filterByNostrJson, setFilterByNostrJson] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [htmlMode, setHtmlMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaticPage | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    path: '',
    content: '',
    showOnHomepage: false,
  });
  // Track whether the user has manually edited the slug
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  const { data: allPages, refetch } = useQuery({
    queryKey: ['admin-static-pages'],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const signal = AbortSignal.timeout(5000);
      const events = await nostr!.query([
        { kinds: [34128], limit: 100 }
      ], { signal });

      return events.map(event => {
        const tags = event.tags || [];
        const relayTags = tags.filter(([name]) => name === 'relay').map(([_, url]) => url);
        return {
          id: event.id,
          path: tags.find(([name]) => name === 'd')?.[1] || '',
          sha256: tags.find(([name]) => name === 'sha256')?.[1] || '',
          content: event.content,
          created_at: event.created_at,
          pubkey: event.pubkey,
          relays: relayTags,
          homepageSection: tags.find(([name]) => name === 'homepage_section')?.[1] === 'true',
        };
      }).filter(p => p.path);
    },
    enabled: !!nostr,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter pages based on nostr.json users and search query
  const pages = useMemo(() => {
    let filtered = allPages;

    if (filterByNostrJson && remoteNostrJson?.names) {
      filtered = filtered?.filter(page => {
        const normalizedPubkey = page.pubkey.toLowerCase().trim();
        return Object.values(remoteNostrJson.names).some(
          pubkey => pubkey.toLowerCase().trim() === normalizedPubkey
        );
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered?.filter(page =>
        page.path.toLowerCase().includes(q) ||
        getPageLabel(page.path).toLowerCase().includes(q) ||
        page.content.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [allPages, filterByNostrJson, remoteNostrJson, searchQuery]);

  // Check if form is dirty
  const isDirty = editingPage
    ? (formData.path !== editingPage.path || formData.content !== editingPage.content || formData.showOnHomepage !== editingPage.homepageSection)
    : (formData.title.trim() !== '' || formData.path.trim() !== '' || formData.content.trim() !== '' || formData.showOnHomepage);

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
    setEditingPage(null);
    setFormData({ title: '', path: '', content: '', showOnHomepage: false });
    setSlugManuallyEdited(false);
    setHtmlMode(false);
    setShowAdvanced(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.path.trim() || !formData.content.trim()) return;

    try {
      // 1. Create the full HTML content
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${formData.path}</title>
</head>
<body>
  ${formData.content}
</body>
</html>`;

      // 2. Upload to Blossom
      const file = new File([htmlContent], 'index.html', { type: 'text/html' });
      const blossomTags = await uploadFile(file);
      const sha256 = blossomTags.find(([name]) => name === 'x')?.[1];

      if (!sha256) {
        throw new Error('Failed to get SHA256 from Blossom upload');
      }

      // 3. Publish kind 34128 event
      const tags = [
        ['d', formData.path.startsWith('/') ? formData.path : `/${formData.path}`],
        ['sha256', sha256],
        ['alt', `Static page for ${formData.path}`],
        ...selectedRelays.map(relay => ['relay', relay]),
      ];

      if (formData.showOnHomepage) {
        tags.push(['homepage_section', 'true']);
      }

      publishEvent({
        event: {
          kind: 34128,
          content: formData.content,
          tags,
        },
      }, {
        onSuccess: () => {
          toast({
            title: editingPage ? 'Page Updated' : 'Page Created',
            description: `"${formData.title || getPageLabel(formData.path)}" has been published.`,
          });
          setFormData({ title: '', path: '', content: '', showOnHomepage: false });
          setIsCreating(false);
          setEditingPage(null);
          setSlugManuallyEdited(false);
          setHtmlMode(false);
          setShowAdvanced(false);
          refetch();
        },
        onError: (error) => {
          console.error('Failed to create page:', error);
          toast({
            title: 'Error',
            description: 'Failed to upload content to Blossom or publish event.',
            variant: 'destructive',
          });
        }
      });
    } catch (error) {
      console.error('Failed to create page:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload content to Blossom or publish event.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (page: StaticPage) => {
    if (user && page.pubkey !== user.pubkey) {
      alert("You cannot edit another user's page.");
      return;
    }
    setFormData({
      title: getPageLabel(page.path),
      path: page.path,
      content: page.content,
      showOnHomepage: page.homepageSection,
    });
    setEditingPage(page);
    setIsCreating(true);
    setSlugManuallyEdited(true); // Don't auto-generate slug when editing
    setHtmlMode(page.content.trim().startsWith('<'));
    window.scrollTo(0, 0);
  };

  const handleDelete = (page: StaticPage) => {
    setDeleteTarget(page);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    publishEvent({
      event: {
        kind: 5,
        tags: [['e', deleteTarget.id]],
      },
      relays: selectedRelays,
    }, {
      onSuccess: () => {
        toast({
          title: 'Page Deleted',
          description: `"${getPageLabel(deleteTarget.path)}" has been deleted.`,
        });
        setDeleteTarget(null);
        refetch();
      }
    });
  };

  const handleTitleChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      title: value,
      // Auto-generate slug from title unless user has manually edited the path
      path: slugManuallyEdited ? prev.path : titleToSlug(value),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete page?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget && getPageLabel(deleteTarget.path)}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isCreating ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              {editingPage ? 'Edit Page' : 'Create New Page'}
            </h2>
            <Button variant="outline" onClick={handleCancel}>
              Back to List
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Page Title with auto-slug */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Page Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder="About Us"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="path">
                      URL Path
                      {slugManuallyEdited && (
                        <span className="text-xs text-muted-foreground ml-2">(custom)</span>
                      )}
                    </Label>
                    <Input
                      id="path"
                      value={formData.path}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setFormData(prev => ({ ...prev, path: e.target.value }));
                      }}
                      placeholder="/about-us"
                      required
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      The web address for this page. Auto-generated from the title.
                    </p>
                  </div>
                </div>

                {/* Content editor with toolbar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="content">Content</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setHtmlMode(!htmlMode)}
                      title="Toggle HTML source mode"
                    >
                      <Code className="h-3.5 w-3.5 mr-1.5" />
                      {htmlMode ? 'Markdown mode' : 'HTML source'}
                    </Button>
                  </div>
                  <Tabs defaultValue="edit" className="mt-1">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="edit">
                        <Layout className="h-4 w-4 mr-2" />
                        Write
                      </TabsTrigger>
                      <TabsTrigger value="preview">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="edit" className="mt-2">
                      {!htmlMode && <MarkdownToolbar textareaId="content" />}
                      <Textarea
                        id="content"
                        value={formData.content}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        placeholder={htmlMode
                          ? "Paste or write HTML source..."
                          : "Start writing your page content. Use the toolbar above for formatting..."}
                        className={`min-h-[300px] ${htmlMode ? 'font-mono' : ''}`}
                        required
                      />
                    </TabsContent>
                    <TabsContent value="preview" className="mt-2">
                      <div className="min-h-[300px] p-4 border rounded-md prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-slate-950 overflow-auto">
                        <PageContent content={formData.content || '*Nothing to preview*'} />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Show on homepage toggle */}
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Switch
                    id="showOnHomepage"
                    checked={formData.showOnHomepage}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showOnHomepage: checked }))}
                  />
                  <Label htmlFor="showOnHomepage" className="cursor-pointer">
                    Show on homepage
                    <p className="text-xs text-muted-foreground font-normal">
                      Display this page as a section on the site landing page. Reorder it from Site Settings &rarr; Homepage Layout.
                    </p>
                  </Label>
                </div>

                {/* Advanced: Publishing relays */}
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="pt-4 border-t">
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="w-full justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Share2 className="h-4 w-4" />
                        Advanced: Publishing Relays
                      </span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
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
                          >
                            {relay.replace('wss://', '').replace('ws://', '')}
                          </label>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap pt-4 border-t">
                  <Button type="submit">
                    {editingPage ? 'Update Page' : 'Create Page'}
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
          <div className="space-y-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Pages</h2>
              <p className="text-muted-foreground">
                Create and manage pages for your site.
              </p>
            </div>

            {/* Search + actions row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search pages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="shrink-0">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => setIsCreating(true)} className="shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                New Page
              </Button>
            </div>

            {/* Filter toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="filter-nostr-json"
                checked={filterByNostrJson}
                onCheckedChange={setFilterByNostrJson}
              />
              <Label htmlFor="filter-nostr-json" className="text-sm cursor-pointer flex items-center gap-2">
                <Filter className="h-3 w-3" />
                Show only users from nostr.json
              </Label>
            </div>
          </div>

          <div className="space-y-4">
            {pages?.map((page) => (
              <PageCard
                key={page.id}
                page={page}
                user={user || null}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}

            {(!pages || pages.length === 0) && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">
                    {searchQuery
                      ? 'No pages match your search.'
                      : 'No pages yet. Click "New Page" to create your first page!'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
