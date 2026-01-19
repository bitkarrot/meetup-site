import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Eye, Layout, Share2, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';

interface StaticPage {
  id: string;
  path: string;
  content: string;
  sha256: string;
  created_at: number;
  pubkey: string;
}

export default function AdminPages() {
  const { nostr, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { toast } = useToast();
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingPage, setEditingPage] = useState<StaticPage | null>(null);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    path: '',
    content: '',
  });

  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  const { data: pages, refetch } = useQuery({
    queryKey: ['admin-static-pages'],
    queryFn: async () => {
      const signal = AbortSignal.timeout(5000);
      const events = await nostr.query([
        { kinds: [34128], limit: 100 }
      ], { signal });
      
      return events.map(event => {
        const tags = event.tags || [];
        return {
          id: event.id,
          path: tags.find(([name]) => name === 'd')?.[1] || '',
          sha256: tags.find(([name]) => name === 'sha256')?.[1] || '',
          content: event.content, // Fallback or summary content
          created_at: event.created_at,
          pubkey: event.pubkey,
        };
      }).filter(p => p.path);
    },
  });

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
      ];

      publishEvent({
        event: {
          kind: 34128,
          content: formData.content, // Store markdown/source in content for easy retrieval
          tags,
        },
        relays: selectedRelays,
      }, {
        onSuccess: () => {
          toast({
            title: editingPage ? 'Page Updated' : 'Page Created',
            description: `Static page at ${formData.path} has been published.`,
          });
          setFormData({ path: '', content: '' });
          setIsCreating(false);
          setEditingPage(null);
          refetch();
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
      path: page.path,
      content: page.content,
    });
    setEditingPage(page);
    setIsCreating(true);
  };

  const handleDelete = (page: StaticPage) => {
    if (user && page.pubkey !== user.pubkey) {
      alert("You cannot delete another user's page.");
      return;
    }
    if (confirm('Are you sure you want to delete this page?')) {
      publishEvent({
        event: {
          kind: 5,
          tags: [['e', page.id]],
        },
        relays: selectedRelays,
      }, {
        onSuccess: () => {
          toast({
            title: 'Page Deleted',
            description: `The page at ${page.path} has been deleted.`,
          });
          refetch();
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Static Pages</h2>
          <p className="text-muted-foreground">
            Manage static site content mapped via NIP-nsite (kind 34128).
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          New Page
        </Button>
      </div>

      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>{editingPage ? 'Edit Page' : 'Create New Page'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="path">Path (e.g. /about)</Label>
                <Input
                  id="path"
                  value={formData.path}
                  onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
                  placeholder="/about"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="content">Content (HTML or Markdown)</Label>
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
                      value={formData.content}
                      onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Enter page content..."
                      className="min-h-[300px] font-mono"
                      required
                    />
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
                      >
                        {relay.replace('wss://', '').replace('ws://', '')}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  {editingPage ? 'Update Page' : 'Create Page'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingPage(null);
                    setFormData({ path: '', content: '' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {pages?.map((page) => (
          <Card key={page.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <h3 className="text-lg font-semibold">{page.path}</h3>
                    <Badge variant="outline">Kind 34128</Badge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground break-all">
                    SHA256: {page.sha256}
                  </p>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {page.content.replace(/[*#>`]/g, '').slice(0, 200)}...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(page.created_at * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button variant="ghost" size="sm" asChild title="View Page">
                    <a href={page.path} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-4 w-4" />
                    </a>
                  </Button>
                  {user && page.pubkey === user.pubkey && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(page)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(page)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {(!pages || pages.length === 0) && (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No static pages yet. Create your first page!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
