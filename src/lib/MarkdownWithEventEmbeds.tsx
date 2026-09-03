/**
 * React component that renders Markdown with event embed support.
 * 
 * This is a wrapper around ReactMarkdown that uses the remarkNostrEmbed
 * plugin to transform nostr: links into <nostr-embed> elements, which are
 * then rendered as NostrEventEmbed components.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { remarkNostrEmbed } from './remarkNostrEmbed';
import { NostrEventEmbed } from '@/components/NostrEventEmbed';
import { useAppContext } from '@/hooks/useAppContext';
import { type Components } from 'react-markdown';

interface MarkdownWithEventEmbedsProps {
  content: string;
  className?: string;
}

export function MarkdownWithEventEmbeds({ content, className }: MarkdownWithEventEmbedsProps) {
  const { config } = useAppContext();
  const gateway = config.siteConfig?.nip19Gateway || 'https://nostr.at';
  const cleanGateway = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;

  // Map the custom <nostr-embed> element (produced by remarkNostrEmbed and
  // parsed by rehype-raw) to the NostrEventEmbed React component.
  const components = {
    'nostr-embed': ({ 'data-identifier': identifier }: { 'data-identifier'?: string }) =>
      identifier ? <NostrEventEmbed identifier={identifier} gateway={cleanGateway} truncate={false} /> : null,
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