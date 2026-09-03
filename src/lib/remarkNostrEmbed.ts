/**
 * Custom remark plugin to replace nostr: links with <nostr-embed> elements.
 * 
 * This enables blog posts and page content to render rich event preview cards
 * for nostr: references. The plugin transforms nostr: links into custom HTML
 * elements that are then rendered as NostrEventEmbed components by ReactMarkdown.
 */

import { visit } from 'unist-util-visit';
import { nip19 } from 'nostr-tools';

export function remarkNostrEmbed() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'link', (node: any) => {
      const url = node.url as string;

      // Check if this is a nostr: reference
      if (url.startsWith('nostr:')) {
        try {
          const identifier = url.replace('nostr:', '');
          const decoded = nip19.decode(identifier);

          // Only process note, nevent, naddr references (not npub/nprofile/nrelay)
          const type = decoded.type as string;
          if (type === 'note' || type === 'nevent' || type === 'naddr') {
            // Replace the link node with a custom HTML element
            node.type = 'html';
            node.value = `<nostr-embed data-identifier="${identifier}"></nostr-embed>`;
          }
        } catch {
          // If decoding fails, leave the link as-is
        }
      }
    });
  };
}