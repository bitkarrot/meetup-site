import { useMemo, useState } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import { NostrEventEmbed } from './NostrEventEmbed';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
  centerMedia?: boolean;
  /** When false, embedded event previews show full content instead of truncated snippets. */
  truncateEmbeds?: boolean;
}

function isImageUrl(url: string) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.split('#')[0]?.split('?')[0] ?? '';

    // Only auto-embed when URL explicitly looks like an image file.
    // Bare Blossom hashes can point to any content type and cause noisy load errors.
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)) return true;

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
  centerMedia = false,
  truncateEmbeds = true,
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
              className={cn("block my-2", centerMedia && "mx-auto w-fit")}
            >
              <img
                src={cleanUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[400px] object-contain rounded-lg border shadow-sm hover:opacity-95 transition-opacity"
                onError={(e) => {
                  // Fallback if image fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </a>
          );
        } else if (isVideoUrl(cleanUrl)) {
          parts.push(
            <SafeVideo
              key={`video-${keyCounter++}`}
              src={cleanUrl}
              centerMedia={centerMedia}
            />
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
              <NostrMention
                key={`mention-${keyCounter++}`}
                pubkey={pubkey}
                href={`${cleanGateway}/${npub}`}
              />
            );
          } else if (decoded.type === 'nprofile') {
            const pubkey = decoded.data.pubkey;
            const nprofile = nip19.nprofileEncode(decoded.data);
            parts.push(
              <NostrMention
                key={`mention-${keyCounter++}`}
                pubkey={pubkey}
                href={`${cleanGateway}/${nprofile}`}
              />
            );
          } else if (decoded.type === 'note' || decoded.type === 'nevent' || decoded.type === 'naddr') {
            // Render embedded preview for note1, nevent1, naddr1 references
            parts.push(
              <NostrEventEmbed
                key={`embed-${keyCounter++}`}
                identifier={nostrId}
                gateway={cleanGateway}
                truncate={truncateEmbeds}
              />
            );
          } else {
            // For other types (nrelay, etc.), just show as a link
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
  }, [event, cleanGateway, centerMedia, truncateEmbeds]);

  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {content.length > 0 ? content : event.content}
    </div>
  );
}

// Helper component to render a video with a fallback link if the browser
// cannot decode the source (codec/network/CORS error).
function SafeVideo({ src, centerMedia = false }: { src: string; centerMedia?: boolean }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline break-all"
      >
        {src}
      </a>
    );
  }

  return (
    <div className={cn("my-2 max-w-full", centerMedia && "mx-auto w-fit")}>
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-w-full max-h-[400px] rounded-lg border shadow-sm"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

// Helper component to display user mentions
function NostrMention({ pubkey, href }: { pubkey: string; href: string }) {
  const author = useAuthor(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "font-medium hover:underline",
        hasRealName
          ? "text-blue-500"
          : "text-gray-500 hover:text-gray-700"
      )}
    >
      @{displayName}
    </a>
  );
}