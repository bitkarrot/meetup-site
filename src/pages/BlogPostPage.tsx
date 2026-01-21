import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSeoMeta } from '@unhead/react';
import { useAppContext } from '@/hooks/useAppContext';
import { AuthorInfo } from '@/components/AuthorInfo';

export default function BlogPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const { nostr } = useDefaultRelay();
  const { config } = useAppContext();

  const { data: post, isLoading } = useQuery({
    queryKey: ['blog-post', postId, config.siteConfig?.adminRoles],
    queryFn: async () => {
      if (!postId) return null;
      const [event] = await nostr.query([
        { ids: [postId], kinds: [30023] }
      ]);
      
      if (!event) return null;

      const adminRoles = config.siteConfig?.adminRoles || {};
      const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();
      
      const authorPubkey = event.pubkey.toLowerCase().trim();
      if (authorPubkey !== masterPubkey && adminRoles[authorPubkey] !== 'primary') return null;

      return {
        id: event.id,
        title: event.tags.find(([name]) => name === 'title')?.[1] || 'Untitled',
        content: event.content,
        published: event.tags.find(([name]) => name === 'published')?.[1] === 'true' || !event.tags.find(([name]) => name === 'published'),
        created_at: event.created_at,
        pubkey: event.pubkey,
        image: event.tags.find(([name]) => name === 'image')?.[1],
      };
    },
  });

  useSeoMeta({
    title: post ? `${post.title} - ${config.siteConfig?.title || 'Blog'}` : 'Blog Post',
    description: post ? post.content.slice(0, 160) : 'Read this blog post on our community site.',
    ogImage: post?.image || config.siteConfig?.ogImage,
    twitterImage: post?.image || config.siteConfig?.ogImage,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-4 w-1/4 mb-8" />
          <Skeleton className="h-64 w-full mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Post not found</h1>
          <p className="text-muted-foreground mb-8">The blog post you're looking for doesn't exist or has been removed.</p>
          <Button asChild>
            <Link to="/blog">Back to Blog</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation />
      <article className="max-w-3xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-8 -ml-2">
          <Link to="/blog">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Blog
          </Link>
        </Button>

        {post.image && (
          <img 
            src={post.image} 
            alt={post.title} 
            className="w-full h-auto aspect-video object-cover rounded-xl mb-8"
          />
        )}

        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">{post.title}</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <time>{new Date(post.created_at * 1000).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</time>
          </div>
        </header>

        <AuthorInfo pubkey={post.pubkey} size="lg" showNpub={true} className="flex items-center gap-3 py-6 border-y mb-8" />

        <div className="prose prose-lg dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
