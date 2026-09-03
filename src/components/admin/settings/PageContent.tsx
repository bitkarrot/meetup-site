import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { remarkNostrEmbed } from '@/lib/remarkNostrEmbed';
import { NostrEventEmbed } from '@/components/NostrEventEmbed';
import { useAppContext } from '@/hooks/useAppContext';

interface PageContentProps {
  content: string;
  className?: string;
}

/**
 * Renders page content as HTML or Markdown, matching the homepage rendering.
 * If the content starts with '<', it's treated as raw HTML.
 * Otherwise, it's rendered as Markdown with GFM and raw HTML support.
 *
 * `nostr:note1…`, `nostr:nevent1…`, and `nostr:naddr1…` references in the
 * Markdown are rendered as inline preview cards via `NostrEventEmbed`
 * (see `remarkNostrEmbed`).
 */
export function PageContent({ content, className }: PageContentProps) {
  const { config } = useAppContext();
  const gateway = config.siteConfig?.nip19Gateway || 'https://nostr.at';
  const cleanGateway = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;

  const isHtml = content.trim().startsWith('<');

  if (isHtml) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: content }} />;
  }

  // Map the custom <nostr-embed> element (produced by remarkNostrEmbed and
  // parsed by rehype-raw) to the NostrEventEmbed React component.
  // `nostr-embed` is not a standard HTML element, so it's not in
  // JSX.IntrinsicElements — we cast the components map to `Components`
  // to satisfy react-markdown's prop type.
  const components = {
    'nostr-embed': ({ 'data-identifier': identifier }: { 'data-identifier'?: string }) =>
      identifier ? <NostrEventEmbed identifier={identifier} gateway={cleanGateway} /> : null,
  } as unknown as Components;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkNostrEmbed]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
