import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
}

function isImageUrl(url: string) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.split('#')[0]?.split('?')[0] ?? '';

    // Check for common image extensions
    if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i.test(path)) return true;

    // Check for Blossom-style SHA256 hashes (64 hex characters)
    // Blossom URLs often look like https://server.com/sha256
    const pathParts = path.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    if (/^[0-9a-f]{64}$/i.test(lastPart)) return true;

    return false;
  } catch {
    return false;
  }
}

function isVideoUrl(url: string) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.split('#')[0]?.split('?')[0] ?? '';

    // Check for common video extensions
    if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv|wmv)$/i.test(path)) return true;

    return false;
  } catch {
    return false;
  }
}

/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({
  event,
  className,
}: NoteContentProps) {
  const { config } = useAppContext();
  const gateway = config.siteConfig?.nip19Gateway || 'https://nostr.at';
  const cleanGateway = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;

  // Process the content to render mentions, links, etc.
  const content = useMemo(() => {
    const text = event.content;

    // Regex to find URLs, Nostr references, and hashtags
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const nostrRegex = /nostr:(npub1|note1|nprofile1|nevent1|naddr1|nrelay1)([023456789acdefghjklmnpqrstuvwxyz]+)/gi;
    const hashtagRegex = /(#\w+)/g;

    // Combined regex for splitting
    const regex = new RegExp(`${urlRegex.source}|${nostrRegex.source}|${hashtagRegex.source}`, 'gi');

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyCounter = 0;

    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const url = match[1];
      const nostrPrefix = match[2];
      const nostrData = match[3];
      const hashtag = match[4];
      const index = match.index;

      // Add text before this match
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index));
      }

      if (url) {
        // Handle URLs
        const cleanUrl = url.replace(/[.,;!?]$/, ''); // Remove trailing punctuation
        if (isImageUrl(cleanUrl)) {
          parts.push(
            <a
              key={`img-${keyCounter++}`}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block my-2"
            >
              <img
                src={cleanUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="max-w-full h-auto rounded-lg border shadow-sm hover:opacity-95 transition-opacity"
                onError={(e) => {
                  // Fallback if image fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </a>
          );
        } else if (isVideoUrl(cleanUrl)) {
          parts.push(
            <div key={`video-${keyCounter++}`} className="my-2 max-w-full">
              <video
                src={cleanUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-lg border shadow-sm"
              />
            </div>
          );
        } else {
          parts.push(
            <a
              key={`url-${keyCounter++}`}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline break-all"
            >
              {cleanUrl}
            </a>
          );
        }
      } else if (nostrPrefix && nostrData) {
        // Handle Nostr references
        try {
          const nostrId = `${nostrPrefix}${nostrData}`;
          const decoded = nip19.decode(nostrId);

          if (decoded.type === 'npub') {
            const pubkey = decoded.data;
            const npub = nip19.npubEncode(pubkey);
            parts.push(
              <a
                key={`mention-${keyCounter++}`}
                href={`${cleanGateway}/${npub}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <NostrMention pubkey={pubkey} />
              </a>
            );
          } else if (decoded.type === 'nprofile') {
            const pubkey = decoded.data.pubkey;
            const nprofile = nip19.nprofileEncode(decoded.data);
            parts.push(
              <a
                key={`mention-${keyCounter++}`}
                href={`${cleanGateway}/${nprofile}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <NostrMention pubkey={pubkey} />
              </a>
            );
          } else {
            // For other types, just show as a link
            parts.push(
              <a
                key={`nostr-${keyCounter++}`}
                href={`${cleanGateway}/${nostrId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline break-all"
              >
                {fullMatch}
              </a>
            );
          }
        } catch {
          // If decoding fails, just render as text
          parts.push(fullMatch);
        }
      } else if (hashtag) {
        // Handle hashtags
        const tag = hashtag.slice(1); // Remove the #
        parts.push(
          <Link
            key={`hashtag-${keyCounter++}`}
            to={`/t/${tag}`}
            className="text-blue-500 hover:underline"
          >
            {hashtag}
          </Link>
        );
      }

      lastIndex = index + fullMatch.length;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    // If no special content was found, just use the plain text
    if (parts.length === 0) {
      parts.push(text);
    }

    return parts;
  }, [event, cleanGateway]);

  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {content.length > 0 ? content : event.content}
    </div>
  );
}

// Helper component to display user mentions
function NostrMention({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);

  return (
    <span
      className={cn(
        "font-medium hover:underline",
        hasRealName
          ? "text-blue-500"
          : "text-gray-500 hover:text-gray-700"
      )}
    >
      @{displayName}
    </span>
  );
}