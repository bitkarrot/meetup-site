import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import NotFound from './NotFound';
import StaticPage from './StaticPage';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();
  const { config } = useAppContext();

  const isValidNip19 = (() => {
    if (!identifier) return false;
    try {
      nip19.decode(identifier);
      return true;
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (!identifier || !isValidNip19) return;
    const gateway = config.siteConfig?.nip19Gateway || 'https://nostr.at';
    const cleanGateway = gateway.endsWith('/') ? gateway.slice(0, -1) : gateway;
    window.location.href = `${cleanGateway}/${identifier}`;
  }, [identifier, config.siteConfig?.nip19Gateway, isValidNip19]);

  if (!identifier) {
    return <NotFound />;
  }

  if (!isValidNip19) {
    return <StaticPage pathOverride={`/${identifier}`} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Redirecting to Nostr gateway...</p>
    </div>
  );
} 