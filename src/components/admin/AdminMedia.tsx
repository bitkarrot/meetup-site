import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { 
  Server, 
  Search, 
  Upload, 
  Plus, 
  Trash2, 
  Copy, 
  ExternalLink, 
  FileImage, 
  FileVideo, 
  ArrowUp, 
  ArrowDown, 
  AlertCircle,
  Loader2,
  Play,
  List,
  LayoutGrid
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

// --- Types ---

interface BlossomBlob {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  uploaded?: number;
}

// --- Components ---

/**
 * Section 1: Manage Servers
 */
function ManageServersSection() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [newServer, setNewServer] = useState('');
  
  // Stored relays from config
  const storedBlossomRelays = useMemo(() => config.siteConfig?.blossomRelays || [], [config.siteConfig?.blossomRelays]);
  
  // Effective relays including derived default relay
  const blossomRelays = useMemo(() => {
    const relays = [...storedBlossomRelays];
    const defaultRelay = config.siteConfig?.defaultRelay;
    
    if (defaultRelay) {
      let normalizedDefault = defaultRelay.replace(/\/$/, '');
      if (normalizedDefault.startsWith('wss://')) {
        normalizedDefault = normalizedDefault.replace('wss://', 'https://');
      } else if (normalizedDefault.startsWith('ws://')) {
        normalizedDefault = normalizedDefault.replace('ws://', 'http://');
      }
      
      if ((normalizedDefault.startsWith('http://') || normalizedDefault.startsWith('https://')) && !relays.includes(normalizedDefault)) {
        relays.unshift(normalizedDefault);
      }
    }
    
    return relays;
  }, [storedBlossomRelays, config.siteConfig?.defaultRelay]);

  const handleAddServer = () => {
    if (!newServer) return;
    let url = newServer.trim();
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    // Remove trailing slash
    url = url.replace(/\/$/, '');

    if (blossomRelays.includes(url)) {
      toast({ title: "Error", description: "Server already exists", variant: "destructive" });
      return;
    }

    updateConfig((prev) => ({
      ...prev,
      siteConfig: {
        ...prev.siteConfig,
        blossomRelays: [...storedBlossomRelays, url]
      }
    }));
    setNewServer('');
    toast({ title: "Success", description: "Server added" });
  };

  const handleRemoveServer = (url: string) => {
    updateConfig((prev) => ({
      ...prev,
      siteConfig: {
        ...prev.siteConfig,
        blossomRelays: storedBlossomRelays.filter(r => r !== url)
      }
    }));
    toast({ title: "Success", description: "Server removed" });
  };

  const moveServer = (index: number, direction: 'up' | 'down') => {
    const newRelays = [...storedBlossomRelays];
    // This is tricky because the UI shows blossomRelays (derived), but we update storedBlossomRelays
    // If the item being moved is the derived one, we might need to handle it differently or just disable moving for derived items
    const relayToMove = blossomRelays[index];
    const isStored = storedBlossomRelays.includes(relayToMove);
    
    if (!isStored) {
      toast({ title: "Info", description: "Default relay position cannot be changed manually" });
      return;
    }

    const storedIndex = storedBlossomRelays.indexOf(relayToMove);
    const targetStoredIndex = direction === 'up' ? storedIndex - 1 : storedIndex + 1;
    
    if (targetStoredIndex < 0 || targetStoredIndex >= newRelays.length) return;
    
    [newRelays[storedIndex], newRelays[targetStoredIndex]] = [newRelays[targetStoredIndex], newRelays[storedIndex]];
    
    updateConfig((prev) => ({
      ...prev,
      siteConfig: {
        ...prev.siteConfig,
        blossomRelays: newRelays
      }
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Servers</CardTitle>
        <CardDescription>Configure Blossom servers for media storage and delivery.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {blossomRelays.map((url, index) => (
            <div key={url} className="flex items-center justify-between p-3 border rounded-lg bg-card">
              <div className="flex items-center gap-3 overflow-hidden">
                <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium truncate">{url}</span>
                <Badge variant="secondary" className="text-[10px] uppercase">blossom</Badge>
                {!storedBlossomRelays.includes(url) && <Badge variant="outline" className="text-[10px] uppercase">default</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveServer(index, 'up')} disabled={index === 0 || !storedBlossomRelays.includes(url)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveServer(index, 'down')} disabled={index === blossomRelays.length - 1 || !storedBlossomRelays.includes(url)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveServer(url)} disabled={!storedBlossomRelays.includes(url)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {blossomRelays.length === 0 && (
            <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
              No Blossom servers configured.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input 
            placeholder="https://blossom.example.com" 
            value={newServer}
            onChange={(e) => setNewServer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
          />
          <Button onClick={handleAddServer}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Section 2: Browse Media
 */
function BrowseMediaSection() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const blossomRelays = useMemo(() => config.siteConfig?.blossomRelays || [], [config.siteConfig?.blossomRelays]);
  const [selectedRelay, setSelectedRelay] = useState<string>('');

  useEffect(() => {
    if (!selectedRelay && blossomRelays.length > 0) {
      setSelectedRelay(blossomRelays[0]);
    }
  }, [blossomRelays, selectedRelay]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [mediaType, setMediaType] = useState<'all' | 'image' | 'video'>('all');

  const { data: blobs, isLoading, error } = useQuery({
    queryKey: ['blossom-blobs', selectedRelay, user?.pubkey],
    queryFn: async () => {
      if (!selectedRelay || !user?.pubkey) return [];
      
      const headers: Record<string, string> = {};
      
      // Some Blossom servers require authentication for listing blobs
      if (user.signer) {
        try {
          const authEvent = await user.signer.signEvent({
            kind: 24242, // Blossom List
            content: 'List my blobs',
            tags: [
              ['t', 'list'],
            ],
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
    enabled: !!selectedRelay && !!user?.pubkey
  });

  const filteredBlobs = useMemo(() => blobs?.filter(blob => {
    if (mediaType === 'all') return true;
    if (mediaType === 'image') return blob.type?.startsWith('image/');
    if (mediaType === 'video') return blob.type?.startsWith('video/');
    return true;
  }) || [], [blobs, mediaType]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Link copied to clipboard" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Browse Media</CardTitle>
            <div className="flex items-center gap-2">
              <Button 
                variant={viewMode === 'list' ? 'default' : 'outline'} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button 
                variant={viewMode === 'grid' ? 'default' : 'outline'} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {blossomRelays.map(relay => (
              <Button 
                key={relay}
                variant={selectedRelay === relay ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedRelay(relay)}
              >
                {relay.replace('https://', '')}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" onValueChange={(v) => setMediaType(v as 'all' | 'image' | 'video')}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="image">Images</TabsTrigger>
              <TabsTrigger value="video">Videos</TabsTrigger>
            </TabsList>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading media from {selectedRelay}...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4 text-destructive">
                <AlertCircle className="h-8 w-8" />
                <p className="text-sm font-medium">Error loading media: {(error as Error).message}</p>
              </div>
            ) : filteredBlobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                No {mediaType !== 'all' ? mediaType : ''} media found on this server.
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredBlobs.map(blob => (
                  <div key={blob.sha256} className="group relative aspect-square rounded-lg border bg-muted overflow-hidden">
                    {blob.type?.startsWith('image/') ? (
                      <img src={blob.url} alt="" className="h-full w-full object-cover" />
                    ) : blob.type?.startsWith('video/') ? (
                      <div className="h-full w-full flex items-center justify-center bg-black">
                        <Play className="h-8 w-8 text-white/50" />
                        <video src={blob.url} className="absolute inset-0 h-full w-full object-cover opacity-30" />
                      </div>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <FileImage className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                      <Button variant="secondary" size="sm" className="w-full" onClick={() => copyToClipboard(blob.url)}>
                        <Copy className="h-3 w-3 mr-2" />
                        Copy Link
                      </Button>
                      <Button variant="secondary" size="sm" className="w-full" asChild>
                        <a href={blob.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-2" />
                          Open
                        </a>
                      </Button>
                      <div className="text-[10px] text-white/70 font-mono truncate w-full text-center">
                        {(blob.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredBlobs.map(blob => (
                  <div key={blob.sha256} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 overflow-hidden">
                         {blob.type?.startsWith('image/') ? (
                          <img src={blob.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            {blob.type?.startsWith('video/') ? <FileVideo className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}
                          </div>
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-sm font-mono truncate">{blob.sha256}</div>
                        <div className="text-xs text-muted-foreground">
                          {blob.type} • {(blob.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(blob.url)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={blob.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Section 3: Upload Media
 */
function UploadMediaSection() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const blossomRelays = useMemo(() => config.siteConfig?.blossomRelays || [], [config.siteConfig?.blossomRelays]);
  
  const [selectedRelays, setSelectedRelays] = useState<string[]>(blossomRelays);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedRelays(blossomRelays);
  }, [blossomRelays]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    if (selectedRelays.length === 0) {
      toast({ title: "Error", description: "Please select at least one relay", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const totalFiles = files.length;
    const totalSteps = totalFiles * selectedRelays.length;
    let completedSteps = 0;

    try {
      for (const file of Array.from(files)) {
        const uploader = new BlossomUploader({
          servers: selectedRelays,
          signer: user.signer,
        });

        // The BlossomUploader from nostrify handles multiple servers
        // but we want to show some progress if possible
        await uploader.upload(file);
        
        completedSteps += selectedRelays.length;
        setUploadProgress((completedSteps / totalSteps) * 100);
      }

      toast({ title: "Success", description: `Uploaded ${totalFiles} file(s) to ${selectedRelays.length} relay(s)` });
      queryClient.invalidateQueries({ queryKey: ['blossom-blobs'] });
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
    <Card>
      <CardHeader>
        <CardTitle>Upload Media</CardTitle>
        <CardDescription>Upload images or videos to one or multiple Blossom servers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div 
          className={cn(
            "group relative border-2 border-dashed rounded-xl p-12 text-center transition-colors",
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
          <div className="flex flex-col items-center gap-2">
            <div className="p-4 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              {isUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
            </div>
            <div className="font-medium">
              {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : "Browse or drag & drop"}
            </div>
            <div className="text-xs text-muted-foreground">
              Images and videos supported
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Target Servers</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {blossomRelays.map((relay) => (
              <div key={relay} className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md border">
                <Checkbox 
                  id={`upload-relay-${relay}`} 
                  checked={selectedRelays.includes(relay)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedRelays(prev => [...prev, relay]);
                    } else {
                      setSelectedRelays(prev => prev.filter(r => r !== relay));
                    }
                  }}
                />
                <label
                  htmlFor={`upload-relay-${relay}`}
                  className="text-xs font-mono truncate cursor-pointer flex-1"
                >
                  {relay.replace('https://', '')}
                </label>
              </div>
            ))}
          </div>
          {blossomRelays.length > 1 && (
            <div className="flex items-center gap-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-3 w-3" />
              It's recommended to upload to multiple servers to ensure availability and censorship resistance.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Main AdminMedia Component
 */
export default function AdminMedia() {
  const [activeTab, setActiveTab] = useState('browse');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Media Management</h2>
        <p className="text-muted-foreground">
          Manage Blossom servers, browse stored media, and upload new content.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="servers">
            <Server className="h-4 w-4 mr-2" />
            Servers
          </TabsTrigger>
          <TabsTrigger value="browse">
            <Search className="h-4 w-4 mr-2" />
            Browse
          </TabsTrigger>
          <TabsTrigger value="upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className="space-y-6">
          <ManageServersSection />
        </TabsContent>

        <TabsContent value="browse" className="space-y-6">
          <BrowseMediaSection />
        </TabsContent>

        <TabsContent value="upload" className="space-y-6">
          <UploadMediaSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
