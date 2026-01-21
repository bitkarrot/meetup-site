import { nip19 } from 'nostr-tools';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';

import { ExternalLink } from 'lucide-react';

interface AuthorInfoProps {
  pubkey: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showNpub?: boolean;
}

export function AuthorInfo({ 
  pubkey, 
  className = "flex items-center gap-2 mb-4",
  size = 'sm',
  showNpub = false
}: AuthorInfoProps) {
  const { data: author } = useAuthor(pubkey);
  
  const avatarSize = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10'
  }[size];

  let npub = '';
  try {
    if (pubkey && /^[0-9a-f]{64}$/.test(pubkey)) {
      npub = nip19.npubEncode(pubkey);
    }
  } catch (e) {
    console.error('Error encoding npub:', e);
  }

  return (
    <div className={className}>
      <Avatar className={avatarSize}>
        <AvatarImage src={author?.metadata?.picture} alt={author?.metadata?.name || 'Author'} />
        <AvatarFallback>{(author?.metadata?.name || author?.metadata?.display_name || '?').charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          {npub ? (
            <a 
              href={`https://nostr.at/${npub}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${size === 'lg' ? 'font-semibold text-sm' : 'text-xs font-medium'} hover:underline`}
            >
              {author?.metadata?.name || author?.metadata?.display_name || 'Anonymous'}
            </a>
          ) : (
            <span className={`${size === 'lg' ? 'font-semibold text-sm' : 'text-xs font-medium'}`}>
              {author?.metadata?.name || author?.metadata?.display_name || 'Anonymous'}
            </span>
          )}
        </div>
        {showNpub && npub && (
          <a 
            href={`https://nostr.at/${npub}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
          >
            {npub.slice(0, 12)}...{npub.slice(-4)}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
