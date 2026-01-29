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
  Search,
  Loader2,
  LayoutGrid,
  List,
  RefreshCw,
  FileImage,
  FileVideo,
  Play,
  AlertCircle,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { useToast } from '@/hooks/useToast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface BlossomBlob {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  uploaded?: number;
}

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
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'browse' | 'upload'>('browse');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [mediaType, setMediaType] = useState<'all' | 'image' | 'video'>('all');
  const [selectedRelay, setSelectedRelay] = useState<string>('');

  // Blossom relays logic (same as AdminMedia)
  const blossomRelays = useMemo(() => {
    const stored = config.siteConfig?.blossomRelays || [];
    const excluded = config.siteConfig?.excludedBlossomRelays || [];
    const defaultRelay = config.siteConfig?.defaultRelay;

    const relays = [...stored];
    if (defaultRelay) {
      let normalizedDefault = defaultRelay.replace(/\/$/, '');
      if (normalizedDefault.startsWith('wss://')) {
        normalizedDefault = normalizedDefault.replace('wss://', 'https://');
      } else if (normalizedDefault.startsWith('ws://')) {
        normalizedDefault = normalizedDefault.replace('ws://', 'http://');
      }

      const isExcluded = excluded.includes(normalizedDefault);

      if ((normalizedDefault.startsWith('http://') || normalizedDefault.startsWith('https://')) && !relays.includes(normalizedDefault) && !isExcluded) {
        relays.unshift(normalizedDefault);
      }
    }
    return relays;
  }, [config.siteConfig?.blossomRelays, config.siteConfig?.defaultRelay, config.siteConfig?.excludedBlossomRelays]);

  useEffect(() => {
    if (!selectedRelay && blossomRelays.length > 0) {
      setSelectedRelay(blossomRelays[0]);
    }
  }, [blossomRelays, selectedRelay]);

  const { data: blobs, isLoading, error, refetch } = useQuery({
    queryKey: ['blossom-blobs', selectedRelay, user?.pubkey],
    queryFn: async () => {
      if (!selectedRelay || !user?.pubkey) return [];

      const headers: Record<string, string> = {};

      if (user.signer) {
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
          console.error('Failed to sign Blossom list event:', e);
        }
      }

      const response = await fetch(`${selectedRelay}/list/${user.pubkey}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch blobs');
      return (await response.json()) as BlossomBlob[];
    },
    enabled: open && !!selectedRelay && !!user?.pubkey
  });

  const filteredBlobs = useMemo(() => {
    const filtered = blobs?.filter(blob => {
      if (mediaType === 'all') return true;
      if (mediaType === 'image') return blob.type?.startsWith('image/');
      if (mediaType === 'video') return blob.type?.startsWith('video/');
      return true;
    }) || [];

    return [...filtered].sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0));
  }, [blobs, mediaType]);

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
    const totalSteps = totalFiles * uploadRelays.length;
    let completedSteps = 0;

    try {
      for (const file of Array.from(files)) {
        const uploader = new BlossomUploader({
          servers: uploadRelays,
          signer: user.signer,
        });

        await uploader.upload(file);
        completedSteps += uploadRelays.length;
        setUploadProgress((completedSteps / totalSteps) * 100);
      }

      toast({ title: "Success", description: `Uploaded ${totalFiles} file(s)` });
      queryClient.invalidateQueries({ queryKey: ['blossom-blobs'] });
      setActiveTab('browse');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
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
                  <Tabs value={mediaType} onValueChange={(v) => setMediaType(v as any)}>
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
                    onClick={() => refetch()}
                    disabled={isLoading}
                  >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="h-4 w-4" />
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

              <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-lg bg-card/50 p-4">
                {isLoading ? (
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
                    No media found on this server.
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {filteredBlobs.map(blob => (
                      <button
                        key={blob.sha256}
                        onClick={() => onSelect(blob.url)}
                        className="group relative aspect-square rounded-md border bg-muted overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left"
                      >
                        {blob.type?.startsWith('image/') ? (
                          <img src={blob.url} alt="" className="h-full w-full object-cover" />
                        ) : blob.type?.startsWith('video/') ? (
                          <div className="h-full w-full flex items-center justify-center bg-black">
                            <Play className="h-6 w-6 text-white/50" />
                            <video src={blob.url} className="absolute inset-0 h-full w-full object-cover opacity-30" />
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
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredBlobs.map(blob => (
                      <button
                        key={blob.sha256}
                        onClick={() => onSelect(blob.url)}
                        className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md transition-colors text-left group"
                      >
                        <div className="h-8 w-8 rounded border bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {blob.type?.startsWith('image/') ? (
                            <img src={blob.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              {blob.type?.startsWith('video/') ? <FileVideo className="h-3 w-3" /> : <FileImage className="h-3 w-3" />}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="text-xs font-mono truncate">{blob.url}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {(blob.size / 1024).toFixed(1)} KB • {blob.type}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
