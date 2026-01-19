import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Eye, Layout, Share2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  published: boolean;
  created_at: number;
  d: string;
  pubkey: string;
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

export default function AdminBlog() {
  const { nostr, publishRelays: initialPublishRelays } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const [isCreating, setIsCreating] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    published: false,
  });

  // Initialize selected relays when publishRelays change
  useEffect(() => {
    if (initialPublishRelays.length > 0 && selectedRelays.length === 0) {
      setSelectedRelays(initialPublishRelays);
    }
  }, [initialPublishRelays, selectedRelays.length]);

  // Fetch blog posts
  const { data: posts, refetch } = useQuery({
    queryKey: ['admin-blog-posts'],
    queryFn: async () => {
      const signal = AbortSignal.timeout(2000);
      const events = await nostr.query([
        { kinds: [30023], limit: 100 }
      ], { signal });
      
      return events.map(event => {
        const tags = event.tags || [];
        return {
          id: event.id,
          title: tags.find(([name]) => name === 'title')?.[1] || 'Untitled',
          content: event.content,
          published: tags.find(([name]) => name === 'published')?.[1] === 'true' || !tags.find(([name]) => name === 'published'),
          created_at: event.created_at,
          d: tags.find(([name]) => name === 'd')?.[1] || event.id,
          pubkey: event.pubkey,
        };
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim() || !formData.content.trim()) return;

    if (editingPost && editingPost.pubkey !== user.pubkey) {
      alert("You cannot edit another user's post.");
      return;
    }

    const tags = [
      ['d', editingPost?.d || `blog-${Date.now()}`],
      ['title', formData.title],
      ['published', formData.published.toString()],
    ];

    if (editingPost) {
      // Update existing post
      publishEvent({
        event: {
          kind: 30023,
          content: formData.content,
          tags,
        },
        relays: selectedRelays,
      });
    } else {
      // Create new post
      publishEvent({
        event: {
          kind: 30023,
          content: formData.content,
          tags,
        },
        relays: selectedRelays,
      });
    }

    // Reset form
    setFormData({ title: '', content: '', published: false });
    setIsCreating(false);
    setEditingPost(null);
    refetch();
  };

  const handleEdit = (post: BlogPost) => {
    if (user && post.pubkey !== user.pubkey) {
      alert("You cannot edit another user's post.");
      return;
    }
    setFormData({
      title: post.title,
      content: post.content,
      published: post.published,
    });
    setEditingPost(post);
    setIsCreating(true);
  };

  const handleDelete = (post: BlogPost) => {
    if (user && post.pubkey !== user.pubkey) {
      alert("You cannot delete another user's post.");
      return;
    }
    if (confirm('Are you sure you want to delete this post?')) {
      // Create a deletion event (kind 5)
      publishEvent({
        event: {
          kind: 5,
          tags: [['e', post.id]],
        },
        relays: selectedRelays,
      });
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Blog Posts</h2>
          <p className="text-muted-foreground">
            Manage your blog posts and long-form content.
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          New Post
        </Button>
      </div>

      {/* Create/Edit Form */}
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>{editingPost ? 'Edit Post' : 'Create New Post'}</CardTitle>
          </CardHeader>
          <CardContent>
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
                      value={formData.content}
                      onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Write your post in Markdown..."
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
                  onClick={() => {
                    setIsCreating(false);
                    setEditingPost(null);
                    setFormData({ title: '', content: '', published: false });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Posts List */}
      <div className="space-y-4">
        {posts?.map((post) => (
          <Card key={post.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{post.title}</h3>
                    <Badge variant={post.published ? 'default' : 'secondary'}>
                      {post.published ? 'Published' : 'Draft'}
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
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(post)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(post)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {(!posts || posts.length === 0) && (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No blog posts yet. Create your first post!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}