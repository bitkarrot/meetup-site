import { extractUrls, stripUrls, truncateText } from '@/lib/zaplytics/utils';
import { ExternalLink } from 'lucide-react';

interface ContentPreviewProps {
  content: string;
  maxLength?: number;
}

/**
 * Renders Nostr content with:
 * - Image thumbnails for image URLs (lazy-loaded)
 * - Domain chips for other URLs (instead of raw links)
 * - Clean text with URLs stripped out
 */
export function ContentPreview({ content, maxLength = 120 }: ContentPreviewProps) {
  if (!content) {
    return <span className="text-muted-foreground italic">Content unavailable</span>;
  }

  const urls = extractUrls(content);
  const textWithoutUrls = stripUrls(content);
  const cleanText = truncateText(textWithoutUrls, maxLength);
  const imageUrls = urls.filter(u => u.type === 'image');
  const linkUrls = urls.filter(u => u.type === 'link' || u.type === 'video');

  return (
    <div className="space-y-2">
      {/* Text content */}
      {cleanText && (
        <p className="text-sm leading-relaxed text-foreground break-words break-all">
          {cleanText}
        </p>
      )}

      {/* Image thumbnails */}
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageUrls.slice(0, 4).map((img, i) => (
            <a
              key={i}
              href={img.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={img.url}
                alt=""
                loading="lazy"
                className="h-20 w-20 object-cover rounded-lg border border-border hover:ring-2 hover:ring-primary/50 transition-all"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </a>
          ))}
        </div>
      )}

      {/* Link domain chips */}
      {linkUrls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {linkUrls.slice(0, 5).map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {link.domain}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
