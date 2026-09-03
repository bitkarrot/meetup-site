/**
 * UserPicker — searchable input for selecting a Nostr user by name, handle,
 * NIP-05, or npub. Reuses the same mechanism as the mention dropdown:
 *
 *  1. **Local whitelist** (nostr.json / Swarm API) — users who have access
 *     to our relay. Shown first, instant.
 *  2. **NIP-50 relay search** + **NIP-05 lookup** — finds users on other
 *     relays by name or `name@domain`. Shown below local results.
 *
 * On selection, `onSelect` is called with the user's pubkey and display
 * name. The selected user is shown as a removable chip.
 */

import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { nip19 } from 'nostr-tools';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { NSchema as n, type NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { X, Search } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostrJsonUsers, dedupeUsersByPubkey } from '@/hooks/useNostrJsonUsers';
import { getCaretCoordinates } from '@/lib/caretCoords';

export interface UserPickerResult {
  pubkey: string;
  displayName: string;
  /** True if the user came from the local whitelist (nostr.json). */
  isLocal: boolean;
}

interface UserPickerProps {
  /** Currently selected pubkey, or null if none. */
  value: string | null;
  /** Called when a user is selected. */
  onSelect: (result: UserPickerResult) => void;
  /** Called when the selection is cleared. */
  onClear: () => void;
  placeholder?: string;
  className?: string;
}

interface Candidate {
  pubkey: string;
  npub: string;
  handle?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  external: boolean;
}

/** A single row in the dropdown; hoisted so it can read author metadata. */
const CandidateRow = ({ candidate }: { candidate: Candidate }) => {
  const skipAuthor = !candidate.external && !!(candidate.displayName || candidate.picture);
  const { data: author } = useAuthor(skipAuthor ? undefined : candidate.pubkey);
  const meta = author?.metadata;
  const displayName =
    candidate.displayName ||
    meta?.display_name ||
    meta?.name ||
    candidate.handle ||
    candidate.npub.slice(0, 12);
  const picture = candidate.picture || meta?.picture;
  const nip05 = candidate.nip05 || meta?.nip05;
  const subLabel = nip05
    ? nip05
    : candidate.handle && candidate.handle !== displayName
      ? `@${candidate.handle}`
      : candidate.npub.slice(0, 16);

  return (
    <div className="flex items-center gap-2 w-full">
      <Avatar className="h-6 w-6 flex-shrink-0">
        <AvatarImage src={picture ? picture.replace(/^http:\/\//, 'https://') : undefined} />
        <AvatarFallback className="text-[10px]">
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm truncate flex items-center gap-1">
          {displayName}
          {candidate.external && (
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground border rounded px-0.5">
              ext
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground truncate">{subLabel}</span>
      </div>
    </div>
  );
};

export function UserPicker({
  value,
  onSelect,
  onClear,
  placeholder = 'SEARCH USER BY NAME (UPDATED) - Try typing bitka',
  className,
}: UserPickerProps) {
  const { nostr } = useNostr();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const deferredQuery = useDeferredValue(query);

  // Local whitelist users (nostr.json / Swarm API)
  const { data: usersData } = useNostrJsonUsers();

  // Batch-fetch kind 0 metadata for all local whitelist users so we can
  // filter by display name, not just the nostr.json handle. Without this,
  // typing a partial display name (e.g. "rob" for "Robert") wouldn't match
  // local users whose nostr.json handle is different from their display name.
  const localPubkeys = useMemo(
    () => usersData?.users ? dedupeUsersByPubkey(usersData.users).map((u) => u.pubkey) : [],
    [usersData],
  );

  const { data: localMetadata } = useQuery<Record<string, { name?: string; display_name?: string; picture?: string; nip05?: string; _ts: number }>>({
    queryKey: ['user-picker-local-metadata', localPubkeys],
    queryFn: async ({ signal }) => {
      if (!nostr || localPubkeys.length === 0) return {};
      // Fetch kind 0 profiles in batches — nostr.query supports multiple
      // authors in a single filter. Split into chunks of 50 to avoid
      // exceeding relay filter limits.
      const result: Record<string, { name?: string; display_name?: string; picture?: string; nip05?: string; _ts: number }> = {};
      const BATCH = 50;
      for (let i = 0; i < localPubkeys.length; i += BATCH) {
        const batch = localPubkeys.slice(i, i + BATCH);
        try {
          const events = await nostr.query(
            [{ kinds: [0], authors: batch, limit: batch.length }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
          );
          for (const ev of events) {
            try {
              const meta = n.json().pipe(n.metadata()).parse(ev.content);
              // Keep the newest profile per pubkey
              const existing = result[ev.pubkey];
              if (!existing || ev.created_at > existing._ts) {
                result[ev.pubkey] = { name: meta.name, display_name: meta.display_name, picture: meta.picture, nip05: meta.nip05, _ts: ev.created_at };
              }
            } catch { /* skip unparseable */ }
          }
        } catch { /* batch failed — continue */ }
      }
      return result;
    },
    enabled: localPubkeys.length > 0 && !!nostr,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const localCandidates = useMemo<Candidate[]>(() => {
    if (!usersData?.users) return [];
    return dedupeUsersByPubkey(usersData.users).map((u) => {
      let npub = u.pubkey;
      try { npub = nip19.npubEncode(u.pubkey); } catch { /* keep hex */ }
      const meta = localMetadata?.[u.pubkey];
      return {
        pubkey: u.pubkey,
        npub,
        handle: u.name,
        displayName: meta?.display_name || meta?.name,
        picture: meta?.picture,
        nip05: meta?.nip05,
        external: false,
      };
    });
  }, [usersData, localMetadata]);

  // Debounce the relay search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (!open || trimmed.length < 1) {
      setDebouncedSearch('');
      return;
    }
    const id = setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => clearTimeout(id);
  }, [deferredQuery, open]);

  // Search relays for NIP-50 search - same as useMentionSearch
  const SEARCH_RELAYS = [
    'wss://search.nos.today',
    'wss://nostr.wine',
    'wss://relay.nostr.band',
  ];

  const { data: searchResults, isFetching: isSearching, error: searchError } = useQuery<Candidate[]>({
    queryKey: ['user-picker-search', debouncedSearch.toLowerCase()],
    queryFn: async ({ signal }): Promise<Candidate[]> => {
      if (!debouncedSearch || !nostr) return [];

      const abortSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(8000),
      ]);

      // Use the same strategy as useMentionSearch - query via nostr client
      const settled = await Promise.allSettled(
        SEARCH_RELAYS.map((url): Promise<NostrEvent[]> => {
          try {
            const relay = nostr.relay(url);
            return relay.query(
              [
                { kinds: [0], search: debouncedSearch, limit: 50 },
                { kinds: [1], search: debouncedSearch, limit: 20 },
              ],
              { signal: abortSignal },
            );
          } catch {
            return Promise.resolve([]);
          }
        }),
      );

      const events = settled
        .filter(
          (r): r is PromiseFulfilledResult<NostrEvent[]> =>
            r.status === 'fulfilled',
        )
        .flatMap((r) => r.value);

      // Collect kind 0 profiles and kind 1 author pubkeys
      const profileEvents = events.filter((e) => e.kind === 0);
      const noteAuthorPubkeys = new Set(events.filter((e) => e.kind === 1).map((e) => e.pubkey));

      // For authors discovered via kind 1 notes but without a kind 0 in the
      // search results, batch-fetch their profiles from the pool
      const knownPubkeys = new Set(profileEvents.map((e) => e.pubkey));
      const missingPubkeys = [...noteAuthorPubkeys].filter(
        (pk) => !knownPubkeys.has(pk),
      );

      let extraProfiles: NostrEvent[] = [];
      if (missingPubkeys.length > 0) {
        try {
          extraProfiles = await nostr.query(
            [{ kinds: [0], authors: missingPubkeys.slice(0, 10), limit: 10 }],
            { signal: abortSignal },
          );
        } catch {
          // pool query failed — proceed with what we have
        }
      }

      // Merge all kind 0 profiles, dedupe by pubkey (newest wins)
      const byPubkey = new Map<string, NostrEvent>();
      for (const event of [...profileEvents, ...extraProfiles]) {
        try {
          n.json().pipe(n.metadata()).parse(event.content); // validate parseable metadata
          const existing = byPubkey.get(event.pubkey);
          if (!existing || event.created_at > existing.created_at) {
            byPubkey.set(event.pubkey, event);
          }
        } catch {
          // skip unparseable kind 0
        }
      }

      const candidates: Candidate[] = [];
      for (const ev of byPubkey.values()) {
        try {
          const meta = n.json().pipe(n.metadata()).parse(ev.content);
          let npub = ev.pubkey;
          try { npub = nip19.npubEncode(ev.pubkey); } catch { /* keep hex */ }
          candidates.push({
            pubkey: ev.pubkey,
            npub,
            displayName: meta.display_name || meta.name,
            picture: meta.picture,
            nip05: meta.nip05,
            external: true,
          });
        } catch { /* skip unparseable */ }
      }

      return candidates;
    },
    enabled: debouncedSearch.length >= 1 && !!nostr,
    staleTime: 60_000,
    retry: 0,
  });

  // Merge local + external candidates, local first
  const filtered = useMemo<Candidate[]>(() => {
    if (!open) return [];
    const q = deferredQuery.trim().toLowerCase();
    const match = (c: Candidate) => {
      const handle = (c.handle || '').toLowerCase();
      const name = (c.displayName || '').toLowerCase();
      const nip05 = (c.nip05 || '').toLowerCase();
      return handle.includes(q) || name.includes(q) || nip05.includes(q) || c.npub.toLowerCase().includes(q);
    };

    if (!q) return localCandidates.slice(0, 20);

    const local = localCandidates.filter(match);

    // External results from relay search — already Candidate objects
    const seen = new Set(local.map((c) => c.pubkey));
    const external = (searchResults ?? []).filter((c) => !seen.has(c.pubkey));

    return [...local, ...external];
  }, [localCandidates, searchResults, deferredQuery, open]);

  // Keep active index in range
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  // Close dropdown when clicking outside the input container AND the dropdown.
  // The dropdown is rendered via createPortal to document.body, so it's not
  // a child of containerRef — we need to check both refs.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleFocus = () => {
    setOpen(true);
    if (inputRef.current) {
      const caret = inputRef.current.selectionStart ?? query.length;
      const c = getCaretCoordinates(inputRef.current as unknown as HTMLTextAreaElement, caret);
      setCoords({ top: c.top + c.lineHeight + 4, left: c.left });
    }
  };

  const handleSelect = (candidate: Candidate) => {
    onSelect({
      pubkey: candidate.pubkey,
      displayName: candidate.displayName || candidate.handle || candidate.npub.slice(0, 12),
      isLocal: !candidate.external,
    });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelect(filtered[activeIdx]);
        return;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  // Show selected user as a chip
  if (value) {
    return <SelectedUserChip pubkey={value} onClear={onClear} className={className} />;
  }

  const dropdownOpen = open && coords !== null;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (inputRef.current) {
              const caret = e.target.selectionStart ?? e.target.value.length;
              const c = getCaretCoordinates(inputRef.current as unknown as HTMLTextAreaElement, caret);
              setCoords({ top: c.top + c.lineHeight + 4, left: c.left });
            }
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      {dropdownOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[100] w-80 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95"
            style={{
              // Radix Dialog modal sets body{pointer-events:none} to block
              // interactions outside the dialog. The dropdown is portaled to
              // document.body, so it inherits pointer-events:none and clicks
              // never reach the buttons. Override with pointer-events:auto.
              pointerEvents: 'auto',
              top: inputRef.current
                ? inputRef.current.getBoundingClientRect().top + coords!.top
                : 0,
              left: inputRef.current
                ? inputRef.current.getBoundingClientRect().left + coords!.left
                : 0,
            }}
            role="listbox"
          >
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-sm text-muted-foreground">
                {isSearching
                  ? 'Searching relays…'
                  : searchError
                    ? `Search error: ${searchError.message}`
                    : deferredQuery.trim()
                      ? 'No matching users'
                      : 'Type a name to search…'}
              </div>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={c.pubkey}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(c)}
                  className={cn(
                    'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors',
                    i === activeIdx
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50',
                  )}
                >
                  <CandidateRow candidate={c} />
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Shows the selected user as a chip with avatar, name, and remove button. */
function SelectedUserChip({
  pubkey,
  onClear,
  className,
}: {
  pubkey: string;
  onClear: () => void;
  className?: string;
}) {
  const { data: author } = useAuthor(pubkey);
  const meta = author?.metadata;
  const displayName = meta?.name || meta?.display_name || genChipName(pubkey);

  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/30', className)}>
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarImage src={meta?.picture ? meta.picture.replace(/^http:\/\//, 'https://') : undefined} />
        <AvatarFallback className="text-[10px]">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="text-sm truncate flex-1 min-w-0">{displayName}</span>
      <button
        type="button"
        onClick={onClear}
        className="text-muted-foreground hover:text-foreground shrink-0"
        title="Remove author filter"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function genChipName(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey).slice(0, 16);
  } catch {
    return pubkey.slice(0, 12);
  }
}
