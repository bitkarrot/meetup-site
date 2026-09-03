import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Loader2,
  LayoutGrid,
  List,
  Columns3,
  RefreshCw,
  FileImage,
  FileVideo,
  Play,
  AlertCircle,
  Upload
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useRemoteNostrJson } from '@/hooks/useRemoteNostrJson';
import { useBlossomRelays } from '@/hooks/useBlossomRelays';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn, formatPubkey } from '@/lib/utils';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { useToast } from '@/hooks/useToast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { type BlossomBlob, urlWithExtension, getMediaPreviewKind } from '@/lib/blossom';
import { useMasonry } from '@/hooks/useMasonry';
import { streamUpload } from '@/lib/mediaProcessing';

const PAGE_SIZE = 60;
const MAX_EAGER_PREVIEWS = PAGE_SIZE;
const MASONRY_CONFIG = { columns: { base: 3, md: 4, lg: 5 }, gap: 12 };

interface MediaSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  title?: string;
}

export function MediaSelectorDialog({
  open,
  onOpenChange,
  onSelect,
  title = "Select Media"
}: MediaSelectorDialogProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: nostrJson } = useRemoteNostrJson();

  const [activeTab, setActiveTab] = useState<'browse' | 'upload'>('browse');
  const [viewMode, setViewMode] = useState<'masonry' | 'grid' | 'list'>('masonry');
  const [mediaType, setMediaType] = useState<'all' | 'image' | 'video'>('all');
  const [selectedRelay, setSelectedRelay] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [failedPreviewUrls, setFailedPreviewUrls] = useState<Set<string>>(new Set());

  const isPreviewFailed = (url: string) => failedPreviewUrls.has(url);
  const markPreviewFailed = (url: string) => {
    setFailedPreviewUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  // Build pubkey → name lookup from nostr.json
  const pubkeyToName = useMemo(() => {
    const map: Record<string, string> = {};
    if (nostrJson?.names) {
      for (const [name, pubkey] of Object.entries(nostrJson.names)) {
        map[pubkey.toLowerCase().trim()] = name;
      }
    }
    return map;
  }, [nostrJson]);

  const displayName = (pubkey: string) => {
    const name = pubkeyToName[pubkey.toLowerCase().trim()];
    if (name && name !== '_') return name;
    return formatPubkey(pubkey).slice(0, 12) + '…';
  };

  // Blossom relays — shared hook (same as AdminMedia)
  const blossomRelays = useBlossomRelays();

  useEffect(() => {
    if (!selectedRelay && blossomRelays.length > 0) {
      setSelectedRelay(blossomRelays[0]);
    }
  }, [blossomRelays, selectedRelay]);

  const { data: blobs, isLoading, isPending, error, refetch } = useQuery({
    queryKey: ['blossom-blobs', selectedRelay, user?.pubkey],
    queryFn: async () => {
      if (!selectedRelay || !user?.pubkey) return [];

      const headers: Record<string, string> = {};

      // Skip signing for the local relay — it doesn't require auth for /list/
      // and the signing prompt can take 15+ seconds with browser extensions.
      const isLocalRelay = selectedRelay.includes('localhost') || selectedRelay.includes('127.0.0.1');

      if (user.signer && !isLocalRelay) {
        try {
          const authEvent = await user.signer.signEvent({
            kind: 24242,
            content: 'List my blobs',
            tags: [['t', 'list']],
            created_at: Math.floor(Date.now() / 1000),
          });
          const authBase64 = btoa(JSON.stringify(authEvent));
          headers['Authorization'] = `Nostr ${authBase64}`;
        } catch (e) {
          if (!(e instanceof Error) || !/browser extension not available/i.test(e.message)) {
            console.warn('Failed to sign Blossom list event:', e);
          }
        }
      }

      const response = await fetch(`${selectedRelay}/list/${user.pubkey}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch blobs');
      return (await response.json()) as BlossomBlob[];
    },
    enabled: open && !!selectedRelay && !!user?.pubkey
  });

  // Build owner filter options from blobs
  const ownerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const blob of blobs || []) {
      if (blob.owner) {
        const pk = blob.owner.toLowerCase().trim();
        counts.set(pk, (counts.get(pk) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [blobs]);

  const filteredBlobs = useMemo(() => {
    const filtered = blobs?.filter(blob => {
      const isMedia = blob.type?.startsWith('image/') || blob.type?.startsWith('video/');
      if (!isMedia) return false;
      if (mediaType === 'all') return true;
      if (mediaType === 'image') return blob.type?.startsWith('image/');
      if (mediaType === 'video') return blob.type?.startsWith('video/');
      return true;
    }) || [];

    const ownerFiltered = ownerFilter === 'all'
      ? filtered
      : filtered.filter(blob => blob.owner && blob.owner.toLowerCase().trim() === ownerFilter);

    return [...ownerFiltered].sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0));
  }, [blobs, mediaType, ownerFilter]);

  // Reset page when filter or relay changes
  useEffect(() => { setPage(0); }, [mediaType, selectedRelay, ownerFilter]);

  const totalPages = Math.ceil(filteredBlobs.length / PAGE_SIZE);
  const pagedBlobs = filteredBlobs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Masonry layout
  const masonryRef = useRef<HTMLDivElement | null>(null);
  const { positions: masonryPositions, height: masonryHeight } = useMasonry(
    pagedBlobs,
    masonryRef,
    MASONRY_CONFIG,
    [page, viewMode, filteredBlobs.length, mediaType, selectedRelay, ownerFilter]
  );

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadRelays, setUploadRelays] = useState<string[]>(blossomRelays);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUploadRelays(blossomRelays);
  }, [blossomRelays]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    if (uploadRelays.length === 0) {
      toast({ title: "Error", description: "Please select at least one relay", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const totalFiles = files.length;
    let completedSteps = 0;

    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');

        // Use streamUpload for videos (avoids arrayBuffer() memory spike
        // that crashes iOS Safari on large files). Use BlossomUploader for
        // images since it supports multi-server upload via Promise.any.
        if (isVideo) {
          await streamUpload(file, uploadRelays, user.signer);
        } else {
          const uploader = new BlossomUploader({
            servers: uploadRelays,
            signer: user.signer,
          });
          await uploader.upload(file);
        }
        completedSteps++;
        setUploadProgress((completedSteps / totalFiles) * 100);
      }

      toast({ title: "Success", description: `Uploaded ${totalFiles} file(s)` });
      queryClient.invalidateQueries({ queryKey: ['blossom-blobs'] });
      setActiveTab('browse');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      // BlossomUploader uses Promise.any which throws AggregateError —
      // extract the real error message from the inner errors array.
      const msg = err instanceof AggregateError
        ? err.errors.map((e: unknown) => (e as Error)?.message || String(e)).join('; ')
        : (err as Error).message || 'Upload failed';
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Show loading state when query is pending or loading (covers initial fetch
  // and refetches). isPending is true on first load before data is available.
  const showLoading = isLoading || isPending || (!blobs && !error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full w-full sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'browse' | 'upload')} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="browse">
                <Search className="h-4 w-4 mr-2" />
                Browse
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="browse" className="flex-1 overflow-hidden flex flex-col mt-0">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Tabs value={mediaType} onValueChange={(v) => setMediaType(v as 'all' | 'image' | 'video')}>
                    <TabsList>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="image">Images</TabsTrigger>
                      <TabsTrigger value="video">Videos</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      // Clear failed-preview cache so thumbnails get retried;
                      // refetch() alone won't re-render the <img>/<video> tags
                      // because the blob list (and thus React keys) is unchanged.
                      setFailedPreviewUrls(new Set());
                      refetch();
                    }}
                    disabled={isLoading}
                  >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  </Button>
                  {ownerOptions.length > 0 && (
                    <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder="All users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All users</SelectItem>
                        {ownerOptions.map(([pubkey, count]) => (
                          <SelectItem key={pubkey} value={pubkey}>
                            {displayName(pubkey)} ({count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === 'masonry' ? 'default' : 'outline'}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setViewMode('masonry')}
                    title="Masonry view"
                  >
                    <Columns3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setViewMode('list')}
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {blossomRelays.map(relay => (
                  <Button
                    key={relay}
                    variant={selectedRelay === relay ? 'default' : 'outline'}
                    size="sm"
                    className="text-[10px] h-7"
                    onClick={() => setSelectedRelay(relay)}
                  >
                    {relay.replace('https://', '')}
                  </Button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[50vh] border rounded-lg bg-card/50 p-4">
                {showLoading ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground font-medium">Loading media...</p>
                  </div>
                ) : error ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-2 text-destructive">
                    <AlertCircle className="h-8 w-8" />
                    <p className="text-sm font-medium">Error: {(error as Error).message}</p>
                  </div>
                ) : filteredBlobs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground italic">
                    No {mediaType !== 'all' ? mediaType : ''} media found on this server.
                  </div>
                ) : viewMode === 'masonry' ? (
                  <div ref={masonryRef} className="relative" style={{ height: masonryHeight || undefined }}>
                    {pagedBlobs.map((blob, index) => {
                      const shouldTryPreview = index < MAX_EAGER_PREVIEWS && !isPreviewFailed(blob.url);
                      const kind = getMediaPreviewKind(blob);
                      const pos = masonryPositions[index];

                      return <button
                        key={blob.sha256}
                        data-masonry-item
                        onClick={() => onSelect(urlWithExtension(blob))}
                        className="group absolute rounded-lg border bg-muted overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left"
                        style={pos ? { left: pos.x, top: pos.y, width: pos.width } : { opacity: 0 }}
                      >
                        {kind === 'image' && shouldTryPreview ? (
                          <img src={blob.url} alt="" loading="lazy" className="block w-full h-auto" onError={() => markPreviewFailed(blob.url)} />
                        ) : kind === 'video' && shouldTryPreview ? (
                          <div className="relative w-full bg-black">
                            <Play className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-white/50 z-10" />
                            <video src={urlWithExtension(blob) + '#t=0.1'} preload="metadata" playsInline muted className="block w-full h-auto opacity-50" onError={() => markPreviewFailed(blob.url)} />
                          </div>
                        ) : (
                          <div className="w-full aspect-video flex items-center justify-center">
                            <FileImage className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-2">
                          <div className="text-[10px] text-white/90 font-mono text-center">
                            <div className="truncate px-1">{(blob.size / 1024).toFixed(0)} KB</div>
                            {blob.owner && <div className="truncate px-1 mt-1">{displayName(blob.owner)}</div>}
                          </div>
                        </div>
                      </button>;
                    })}
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {pagedBlobs.map((blob, index) => {
                      const shouldTryPreview = index < MAX_EAGER_PREVIEWS && !isPreviewFailed(blob.url);

                      return <button
                        key={blob.sha256}
                        onClick={() => onSelect(urlWithExtension(blob))}
                        className="group relative aspect-square rounded-md border bg-muted overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left"
                      >
                        {getMediaPreviewKind(blob) === 'image' && shouldTryPreview ? (
                          <img src={blob.url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => markPreviewFailed(blob.url)} />
                        ) : getMediaPreviewKind(blob) === 'video' && shouldTryPreview ? (
                          <div className="h-full w-full flex items-center justify-center bg-black">
                            <Play className="h-6 w-6 text-white/50" />
                            <video src={blob.url} className="absolute inset-0 h-full w-full object-cover opacity-30" onError={() => markPreviewFailed(blob.url)} />
                          </div>
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <FileImage className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="text-[8px] text-white truncate font-mono">
                            {(blob.size / 1024).toFixed(0)}KB
                          </div>
                        </div>
                      </button>;
                    })}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {pagedBlobs.map((blob, index) => {
                      const shouldTryPreview = index < MAX_EAGER_PREVIEWS && !isPreviewFailed(blob.url);

                      return <button
                        key={blob.sha256}
                        onClick={() => onSelect(urlWithExtension(blob))}
                        className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md transition-colors text-left group"
                      >
                        <div className="h-8 w-8 rounded border bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {getMediaPreviewKind(blob) === 'image' && shouldTryPreview ? (
                            <img src={blob.url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => markPreviewFailed(blob.url)} />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              {getMediaPreviewKind(blob) === 'video' && shouldTryPreview ? <FileVideo className="h-3 w-3" /> : <FileImage className="h-3 w-3" />}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="text-xs font-mono truncate">{urlWithExtension(blob)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {(blob.size / 1024).toFixed(1)} KB • {blob.type}
                          </div>
                        </div>
                      </button>;
                    })}
                  </div>
                )}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <p className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredBlobs.length)} of {filteredBlobs.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground font-mono">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="upload" className="flex-1 flex flex-col mt-0">
              <div
                className={cn(
                  "flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 text-center transition-colors mb-6",
                  isUploading ? "opacity-50 pointer-events-none" : "hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleUpload}
                  multiple
                  accept="image/*,video/*"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                    {isUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
                  </div>
                  <div className="text-lg font-medium">
                    {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : "Upload New Media"}
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Files will be added to your Blossom servers and available for selection.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Servers</Label>
                <div className="grid grid-cols-2 gap-2">
                  {blossomRelays.map((relay) => (
                    <div key={relay} className="flex items-center space-x-2 bg-muted/50 p-2 rounded-md border">
                      <Checkbox
                        id={`qs-upload-relay-${relay}`}
                        checked={uploadRelays.includes(relay)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setUploadRelays(prev => [...prev, relay]);
                          } else {
                            setUploadRelays(prev => prev.filter(r => r !== relay));
                          }
                        }}
                      />
                      <label
                        htmlFor={`qs-upload-relay-${relay}`}
                        className="text-[10px] font-mono truncate cursor-pointer flex-1"
                      >
                        {relay.replace('https://', '')}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
