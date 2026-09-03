/**
 * EventPickerDialog — lets the user find a Nostr event and insert a
 * `nostr:<nip19-id>` reference into a note or blog post.
 *
 * Two modes:
 *  1. **Paste ID** — paste a `nostr:naddr1…`, raw nip19 string, hex event id,
 *     or a gateway URL (e.g. `https://nostr.at/naddr1…`). The input is
 *     auto-decoded and a live preview of the referenced event is shown.
 *  2. **Search** — query relays by kind (Notes / Articles / Highlights / All)
 *     and optional author, then filter results client-side by text. Pick a
 *     result to insert.
 *
 * On selection, `onSelect` is called with the `nostr:<encoded-id>` string
 * (e.g. `nostr:naddr1qvzqqqr4gu…`), ready to insert at the cursor.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { queryWithNip65Fanout, getNip65ReadRelays, FALLBACK_DISCOVERY_RELAYS } from '@/lib/queryRelays';
import { decodeEventFilter, encodeEventRef, eventDisplayTitle } from '@/lib/nip19';
import { kindLabel } from '@/lib/kinds';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { UserPicker, type UserPickerResult } from '@/components/admin/UserPicker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Link2,
  AlertCircle,
  FileText,
  Newspaper,
  Highlighter,
  MessageSquare,
  Check,
} from 'lucide-react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

interface EventPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with `nostr:<encoded-id>` when the user picks an event. */
  onSelect: (nostrRef: string) => void;
  title?: string;
}

// --- Kind filter options ---

type KindFilter = 'all' | 'notes' | 'articles' | 'highlights';

const KIND_OPTIONS: { value: KindFilter; label: string; kinds: number[]; icon: typeof MessageSquare }[] = [
  { value: 'notes', label: 'Notes', kinds: [1], icon: MessageSquare },
  { value: 'articles', label: 'Articles', kinds: [30023], icon: Newspaper },
  { value: 'highlights', label: 'Highlights', kinds: [9802], icon: Highlighter },
  { value: 'all', label: 'All', kinds: [1, 30023, 9802], icon: FileText },
];

/**
 * Search result with a flag indicating whether the event was found on the
 * local (default) relay. Local events are sorted first in the results.
 */
interface SearchResult extends NostrEvent {
  isLocal: boolean;
}

// --- Helpers ---

// Bech32 charset and nip19 prefix list, shared across the three extraction
// regexes below to avoid drift if a new nip19 type is added.
const NIP19_PREFIXES = '(npub1|note1|nprofile1|nevent1|naddr1|nrelay1)';
const BECH32_CHARS = '([023456789acdefghjklmnpqrstuvwxyz]+)';

/**
 * Try to extract a nip19 identifier from arbitrary user input.
 * Accepts:
 *  - `nostr:naddr1…` / `nostr:note1…` etc.
 *  - bare `naddr1…` / `note1…` etc.
 *  - hex event id (64 hex chars) → encoded as `note1…`
 *  - gateway URLs like `https://nostr.at/naddr1…` or `…/note1…`
 * Returns the bare nip19 string (without `nostr:` prefix) or null.
 */
function extractNip19(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct nostr: prefix (anywhere in the string)
  const nostrMatch = trimmed.match(new RegExp(`nostr:${NIP19_PREFIXES}${BECH32_CHARS}`, 'i'));
  if (nostrMatch) return `${nostrMatch[1]}${nostrMatch[2]}`;

  // Bare nip19 (entire string is the identifier)
  const bareMatch = trimmed.match(new RegExp(`^${NIP19_PREFIXES}${BECH32_CHARS}$`, 'i'));
  if (bareMatch) return `${bareMatch[1]}${bareMatch[2]}`;

  // Hex event id (64 chars)
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    try {
      return nip19.noteEncode(trimmed.toLowerCase());
    } catch {
      return null;
    }
  }

  // Gateway URL: extract the nip19 path segment
  try {
    const url = new URL(trimmed);
    const path = url.pathname.split('/').pop() ?? '';
    const pathMatch = path.match(new RegExp(`^${NIP19_PREFIXES}${BECH32_CHARS}$`, 'i'));
    if (pathMatch) return `${pathMatch[1]}${pathMatch[2]}`;
  } catch {
    // not a URL
  }

  return null;
}

// --- Result row ---

function EventResultRow({
  event,
  selected,
  onSelect,
  isLocal = false,
}: {
  event: NostrEvent;
  selected: boolean;
  onSelect: () => void;
  /** Whether the event was found on the local (default) relay. */
  isLocal?: boolean;
}) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const title = eventDisplayTitle(event);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-muted hover:border-primary/30 hover:bg-muted/30',
      )}
    >
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-xs">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium truncate">{displayName}</span>
          {isLocal && (
            <span className="text-[10px] font-medium text-primary shrink-0 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
              Local
            </span>
          )}
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true })}
          </span>
          <span className="text-xs text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-muted">
            {kindLabel(event.kind)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{title}</p>
      </div>
      {selected && <Check className="h-4 w-4 text-primary shrink-0 mt-1" />}
    </button>
  );
}

// --- Main component ---

export function EventPickerDialog({
  open,
  onOpenChange,
  onSelect,
  title = 'Insert Event',
}: EventPickerDialogProps) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const nip65ReadRelays = getNip65ReadRelays(config.relayMetadata);
  const defaultRelay = config.siteConfig?.defaultRelay;

  const [activeTab, setActiveTab] = useState<'paste' | 'search'>('paste');
  const [pasteInput, setPasteInput] = useState('');
  const [searchKind, setSearchKind] = useState<KindFilter>('notes');
  const [selectedAuthor, setSelectedAuthor] = useState<UserPickerResult | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<NostrEvent | null>(null);
  const [selectedRef, setSelectedRef] = useState<string>('');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPasteInput('');
      setSelectedAuthor(null);
      setSearchText('');
      setSelectedEvent(null);
      setSelectedRef('');
      setActiveTab('paste');
    }
  }, [open]);

  // --- Paste tab: decode + fetch preview ---

  const decodedNip19 = useMemo(() => {
    if (!pasteInput.trim()) return null;
    return extractNip19(pasteInput);
  }, [pasteInput]);

  // Decode the pasted nip19 identifier once and derive both the relay filter
  // and relay hints from the single decoded value.
  const { pasteFilter, pasteRelayHints } = useMemo(() => {
    if (!decodedNip19) return { pasteFilter: null, pasteRelayHints: [] as string[] };
    const { filter, relayHints } = decodeEventFilter(decodedNip19);
    return { pasteFilter: filter, pasteRelayHints: relayHints };
  }, [decodedNip19]);

  const { data: pasteEvent, isLoading: pasteLoading } = useQuery<NostrEvent | null>({
    queryKey: ['event-picker-paste', decodedNip19],
    queryFn: async () => {
      if (!nostr || !pasteFilter) return null;
      const signal = AbortSignal.timeout(12000);
      const relays = new Set<string>(nip65ReadRelays);
      pasteRelayHints.forEach((u) => relays.add(u));
      FALLBACK_DISCOVERY_RELAYS.forEach((u) => relays.add(u));
      const events = await queryWithNip65Fanout(nostr, [pasteFilter], [...relays], signal);
      if (events.length === 0) return null;
      if (events.length === 1) return events[0];
      return events.sort((a, b) => b.created_at - a.created_at)[0];
    },
    enabled: !!pasteFilter && !!nostr && open,
    staleTime: 60000,
    retry: false,
  });

  // Auto-select the pasted event when found. Clear the selection when the
  // input changes to something that doesn't decode (so a stale reference
  // from a previous paste or search result can't be inserted by mistake).
  useEffect(() => {
    if (pasteEvent && decodedNip19) {
      setSelectedEvent(pasteEvent);
      setSelectedRef(`nostr:${decodedNip19}`);
    } else if (!decodedNip19 && activeTab === 'paste') {
      setSelectedEvent(null);
      setSelectedRef('');
    }
  }, [pasteEvent, decodedNip19, activeTab]);

  // --- Search tab: query relays by kind + optional author ---

  const authorPubkey = selectedAuthor?.pubkey ?? null;

  // searchKind is typed as KindFilter, which is the union of all KIND_OPTIONS
  // values, so this lookup always succeeds. Fallback to 'all' is a safety net.
  const kindOption = KIND_OPTIONS.find((o) => o.value === searchKind) ?? KIND_OPTIONS[3];

  const PAGE_SIZE = 25;

  // Phase 1: Query the local (default) relay only. The NPool's reqRouter
  // routes nostr.query to the default relay, so this is fast and gives
  // us events from users who have access to our relay. Results show immediately.
  //
  // When no author is selected, this is the ONLY query — we don't fan out
  // to external relays. This keeps the search scoped to our relay's
  // whitelisted users, as requested.
  //
  // Uses useInfiniteQuery for pagination: each page fetches PAGE_SIZE events
  // older than the previous page's oldest event (via the `until` filter).
  const {
    data: localData,
    isLoading: localLoading,
    fetchNextPage: fetchNextLocal,
    hasNextPage: hasNextLocal,
    isFetchingNextPage: fetchingNextLocal,
  } = useInfiniteQuery<SearchResult[], Error, InfiniteData<SearchResult[]>, unknown[], number | undefined>({
    queryKey: ['event-picker-search-local', searchKind, authorPubkey],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      if (!nostr) return [];
      const filter: NostrFilter = { kinds: kindOption.kinds, limit: PAGE_SIZE };
      if (authorPubkey) filter.authors = [authorPubkey];
      if (pageParam !== undefined) filter.until = pageParam;

      let localEvents: NostrEvent[] = [];
      try {
        localEvents = await nostr.query([filter], {
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Local relay might be slow or offline
      }

      return localEvents
        .sort((a, b) => b.created_at - a.created_at)
        .map((e) => ({ ...e, isLocal: true }));
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    enabled: open && activeTab === 'search' && !!nostr,
    staleTime: 30000,
    retry: false,
  });

  // Phase 2: Only when an author is selected, query that author's NIP-65
  // write relays (outbox model) to find their latest events on other relays.
  // This is NOT run when no author is selected — without a specific author,
  // querying external relays would flood the results with unrelated events.
  //
  // We fetch the author's kind 10002 relay list first, then query their write
  // relays. We also include fallback discovery relays as a safety net in case
  // the author doesn't have a NIP-65 list.
  //
  // Uses useInfiniteQuery for pagination via the `until` filter.
  const {
    data: remoteData,
    isLoading: remoteLoading,
    fetchNextPage: fetchNextRemote,
    hasNextPage: hasNextRemote,
    isFetchingNextPage: fetchingNextRemote,
  } = useInfiniteQuery<SearchResult[], Error, InfiniteData<SearchResult[]>, unknown[], number | undefined>({
    queryKey: ['event-picker-search-remote', searchKind, authorPubkey],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      if (!nostr || !authorPubkey) return [];
      const filter: NostrFilter = { kinds: kindOption.kinds, limit: PAGE_SIZE, authors: [authorPubkey] };
      if (pageParam !== undefined) filter.until = pageParam;

      // Discover the author's write relays via NIP-65 (kind 10002).
      // Only on the first page — relay list doesn't change between pages.
      if (pageParam === undefined) {
        const discoveryRelays = new Set<string>(nip65ReadRelays);
        FALLBACK_DISCOVERY_RELAYS.forEach((u) => discoveryRelays.add(u));

        try {
          const relayListEvents = await queryWithNip65Fanout(
            nostr,
            [{ kinds: [10002], authors: [authorPubkey] }],
            [...discoveryRelays],
            AbortSignal.timeout(8000),
          );
          for (const ev of relayListEvents) {
            for (const tag of ev.tags) {
              if (tag[0] === 'r' && tag[1]) {
                const mode = tag[2];
                if (mode === 'write' || mode === undefined) {
                  authorWriteRelaysRef.current.add(tag[1]);
                }
              }
            }
          }
        } catch {
          // If we can't fetch the author's relay list, use fallbacks
        }
      }

      // Query the author's write relays + fallback relays for their events
      const queryRelays = new Set<string>(authorWriteRelaysRef.current);
      FALLBACK_DISCOVERY_RELAYS.forEach((u) => queryRelays.add(u));

      let remoteEvents: NostrEvent[] = [];
      try {
        const allRemote = await queryWithNip65Fanout(
          nostr,
          [filter],
          [...queryRelays],
          AbortSignal.timeout(10000),
        );
        // Exclude events already found on the local relay (all pages)
        const localIds = new Set(localEventsFlat.map((e) => e.id));
        remoteEvents = allRemote.filter((e) => !localIds.has(e.id));
      } catch {
        // If remote query fails, return empty
      }

      return remoteEvents
        .sort((a, b) => b.created_at - a.created_at)
        .map((e) => ({ ...e, isLocal: false }));
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    // Only run the remote query when an author is explicitly selected.
    enabled: open && activeTab === 'search' && !!nostr && !!authorPubkey,
    staleTime: 30000,
    retry: false,
  });

  // Ref to cache the author's write relays between pages (avoids re-fetching
  // kind 10002 on every page — only fetched on the first page).
  const authorWriteRelaysRef = useRef(new Set<string>());

  // Reset the cached write relays when the author changes
  useEffect(() => {
    authorWriteRelaysRef.current = new Set<string>();
  }, [authorPubkey]);

  // Flatten pages into single arrays
  const localEventsFlat = useMemo(() => localData?.pages.flat() ?? [], [localData]);
  const remoteEventsFlat = useMemo(() => remoteData?.pages.flat() ?? [], [remoteData]);

  // Merge results: sort by newest first overall, but give local events a
  // priority boost so they appear above remote events of similar age.
  // This surfaces events from whitelisted users on our relay as "first
  // options" while still showing the latest events at the top.
  //
  // The boost is 1 hour (3600s) — a local event from 2:00 will appear above
  // a remote event from 2:30, but a remote event from 1:55 still appears
  // below a local event from 2:00. This keeps the list roughly chronological
  // while giving local content a visible edge.
  const LOCAL_BOOST_SECONDS = 3600;

  const searchResults = useMemo(() => {
    return [...localEventsFlat, ...remoteEventsFlat].sort((a, b) => {
      const aScore = a.created_at + (a.isLocal ? LOCAL_BOOST_SECONDS : 0);
      const bScore = b.created_at + (b.isLocal ? LOCAL_BOOST_SECONDS : 0);
      return bScore - aScore;
    });
  }, [localEventsFlat, remoteEventsFlat]);

  // Loading is true while local is loading. Remote loading only matters
  // when an author is selected (otherwise the remote query doesn't run).
  const searchLoading = localLoading || (!!authorPubkey && remoteLoading);

  // Infinite scroll: load more when the sentinel enters the viewport.
  // Try both local and remote — whichever has more pages will fetch.
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: '100px' });

  const hasNextPage = hasNextLocal || (!!authorPubkey && hasNextRemote);
  const isFetchingNextPage = fetchingNextLocal || fetchingNextRemote;

  useEffect(() => {
    if (!inView || isFetchingNextPage) return;
    if (hasNextLocal) fetchNextLocal();
    else if (!!authorPubkey && hasNextRemote) fetchNextRemote();
  }, [inView, isFetchingNextPage, hasNextLocal, hasNextRemote, fetchNextLocal, fetchNextRemote, authorPubkey]);

  // Client-side text filter
  const filteredResults = useMemo(() => {
    if (!searchResults) return [];
    if (!searchText.trim()) return searchResults;
    const q = searchText.toLowerCase();
    return searchResults.filter((e) => {
      const title = e.tags.find(([t]) => t === 'title')?.[1] ?? '';
      return title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q);
    });
  }, [searchResults, searchText]);

  const handleSelectSearchResult = useCallback((event: NostrEvent) => {
    setSelectedEvent(event);
    const encoded = encodeEventRef(event, defaultRelay);
    setSelectedRef(`nostr:${encoded}`);
  }, [defaultRelay]);

  const handleInsert = useCallback(() => {
    if (!selectedRef) return;
    onSelect(selectedRef);
    onOpenChange(false);
  }, [selectedRef, onSelect, onOpenChange]);

  const canInsert = !!selectedRef;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onInteractOutside={(e) => {
          // Prevent the dialog from closing when the user clicks inside a
          // portaled dropdown (e.g. the UserPicker author search dropdown).
          // These dropdowns are rendered to document.body via createPortal,
          // so Radix Dialog sees them as "outside" and tries to close.
          const target = e.target as HTMLElement | null;
          // Check for listbox role OR any element with pointer-events:auto (our dropdowns override this)
          if (target?.closest('[role="listbox"]') || target?.closest('[style*="pointer-events:auto"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Insert a Nostr event reference (note, article, or highlight) that will render as an
            inline preview card.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'paste' | 'search')} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-fit grid-cols-2">
            <TabsTrigger value="paste">Paste ID</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
          </TabsList>

          {/* --- Paste tab --- */}
          <TabsContent value="paste" className="flex-1 overflow-y-auto mt-3 space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nostr identifier or URL</label>
              <Input
                placeholder="nostr:naddr1…  /  naddr1…  /  hex event id  /  https://nostr.at/…"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Paste any Nostr reference — a <code>nostr:</code> link, bare nip19 ID, hex event id,
                or a gateway URL.
              </p>
            </div>

            {pasteInput.trim() && !decodedNip19 && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Couldn't decode that input. Check the format and try again.
              </div>
            )}

            {decodedNip19 && pasteLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
                Fetching event from relays…
              </div>
            )}

            {decodedNip19 && !pasteLoading && !pasteEvent && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-lg">
                <AlertCircle className="h-4 w-4" />
                Event not found on any reachable relay.
              </div>
            )}

            {pasteEvent && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Preview</label>
                <EventResultRow
                  event={pasteEvent}
                  selected
                  onSelect={() => {}}
                />
              </div>
            )}
          </TabsContent>

          {/* --- Search tab --- */}
          <TabsContent value="search" className="flex-1 overflow-hidden flex flex-col mt-3 space-y-3">
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={searchKind} onValueChange={(v) => setSearchKind(v as KindFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <opt.icon className="h-4 w-4" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <UserPicker
                value={selectedAuthor?.pubkey ?? null}
                onSelect={(result) => setSelectedAuthor(result)}
                onClear={() => setSelectedAuthor(null)}
                placeholder="Search author by @name…"
                className="flex-1 min-w-[160px]"
              />
            </div>

            <Input
              placeholder="Filter results by text…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />

            {/* Results */}
            <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
              {/* Local relay loading — show spinner only if no local results yet */}
              {localLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching local relay…
                </div>
              )}

              {/* Remote relay loading — show inline indicator if local results already visible */}
              {!localLoading && remoteLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Searching other relays for more results…
                </div>
              )}

              {!searchLoading && filteredResults.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  {searchResults && searchResults.length > 0
                    ? 'No results match your text filter.'
                    : authorPubkey
                      ? 'No events found for this author. Try a different kind.'
                      : 'No events found on this relay. Select an author to search other relays.'}
                </div>
              )}

              {filteredResults.map((event) => (
                <EventResultRow
                  key={event.id}
                  event={event}
                  selected={selectedEvent?.id === event.id}
                  onSelect={() => handleSelectSearchResult(event)}
                  isLocal={event.isLocal}
                />
              ))}

              {/* Load more sentinel + loading indicator for infinite scroll */}
              {hasNextPage && !searchLoading && (
                <div ref={loadMoreRef} className="py-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more…
                    </>
                  ) : (
                    <span className="text-xs">Scroll to load more</span>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t pt-4 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
            {selectedRef || 'No event selected'}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleInsert} disabled={!canInsert}>
              <Link2 className="h-4 w-4 mr-1" />
              Insert
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
