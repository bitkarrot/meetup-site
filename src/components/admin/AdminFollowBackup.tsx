import { useState, useRef, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users,
  Download,
  Upload,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Lock,
  FileJson,
  Clock,
  Globe,
  RefreshCw,
  Archive,
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import {
  useCurrentFollowList,
  useFollowBackups,
  useEncryptionProbe,
  useCreateBackup,
  useRestoreBackup,
  useDeleteBackup,
  useExportFollows,
  useParseImportFile,
  usePublishImport,
  useRemoteKind3,
  useSyncKind3,
  useArchivedKind3,
  computeDiff,
  decryptBackup,
  formatPubkeyShort,
  type FollowBackup,
  type PTag,
  type RemoteKind3,
} from '@/hooks/useFollowBackup';

export default function AdminFollowBackup() {
  const { user } = useCurrentUser();
  const { data: probe, isLoading: probeLoading } = useEncryptionProbe();
  // Encryption is usable if any method (nip44 or nip04) passed the probe
  const encryptionUsable = probe?.preferred != null;
  const probeDone = !probeLoading && probe != null;

  const { data: currentList, isLoading: currentLoading, refetch: refetchCurrent } = useCurrentFollowList();
  const { data: backups, isLoading: backupsLoading, refetch: refetchBackups } = useFollowBackups();

  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const deleteBackup = useDeleteBackup();
  const exportFollows = useExportFollows();
  const parseImportFile = useParseImportFile();
  const publishImport = usePublishImport();
  const remoteKind3 = useRemoteKind3();
  const syncKind3 = useSyncKind3();
  const archivedKind3 = useArchivedKind3();

  const [restoreTarget, setRestoreTarget] = useState<FollowBackup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FollowBackup | null>(null);
  const [diffData, setDiffData] = useState<{ added: PTag[]; removed: PTag[] } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(false);
  const [importPtags, setImportPtags] = useState<PTag[] | null>(null);
  const [importDiff, setImportDiff] = useState<{ added: PTag[]; removed: PTag[] } | null>(null);
  const [importSource, setImportSource] = useState<'file' | 'relay'>('file');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    await createBackup.mutateAsync();
  };

  const handleRestoreClick = async (backup: FollowBackup) => {
    if (!user?.signer) return;
    setRestoreTarget(backup);
    setDiffData(null);
    setDiffError(false);
    setDiffLoading(true);
    try {
      const backupPtags = await decryptBackup(backup, user.pubkey, user.signer);
      const currentPtags = currentList?.ptags ?? [];
      const diff = computeDiff(currentPtags, backupPtags);
      setDiffData({ added: diff.added, removed: diff.removed });
    } catch (e) {
      console.error('Failed to compute diff:', e);
      setDiffError(true);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    setRestoreTarget(null);
    await restoreBackup.mutateAsync(target);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await deleteBackup.mutateAsync(target);
  };

  const handleExport = async () => {
    await exportFollows.mutateAsync();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset so the same file can be selected again

    try {
      const ptags = await parseImportFile.mutateAsync(file);
      const currentPtags = currentList?.ptags ?? [];
      const diff = computeDiff(currentPtags, ptags);
      setImportPtags(ptags);
      setImportDiff({ added: diff.added, removed: diff.removed });
      setImportSource('file');
    } catch {
      // Error toast handled by the mutation's onError
    }
  };

  const handleImportConfirm = async () => {
    if (!importPtags) return;
    const ptags = importPtags;
    setImportPtags(null);
    setImportDiff(null);
    await publishImport.mutateAsync(ptags);
  };

  const handleRecoverFromRelays = (entry: RemoteKind3) => {
    // Defensive guard: never restore a 0-follow kind 3 (a nuked version)
    if (entry.ptags.length === 0) return;
    setRecoveryOpen(false);
    const currentPtags = currentList?.ptags ?? [];
    const diff = computeDiff(currentPtags, entry.ptags);
    setImportPtags(entry.ptags);
    setImportDiff({ added: diff.added, removed: diff.removed });
    setImportSource('relay');
  };

  const handleRefresh = () => {
    refetchCurrent();
    refetchBackups();
    remoteKind3.refetch();
    archivedKind3.refetch();
  };

  if (!user) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Not logged in</AlertTitle>
          <AlertDescription>
            Log in with your Nostr account to manage your follow list backups.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const currentFollowCount = currentList?.followCount ?? 0;
  const currentEventDate = currentList?.event?.created_at;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          Follow List Backup & Restore
        </h2>
        <p className="text-muted-foreground">
          Back up your Nostr follow list (kind 3) to an encrypted event on this relay.
          Restore from a backup if a client accidentally nukes your follows.
        </p>
      </div>

      {/* Encryption unavailable warning — only show when probe is done and nothing works */}
      {probeDone && !encryptionUsable && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Encrypted backups unavailable</AlertTitle>
          <AlertDescription>
            Your signer does not support any encryption method (NIP-44 or NIP-04). Encrypted
            relay backups are disabled. You can still use Export and Import below to manage your
            follow list via a local JSON file.
          </AlertDescription>
        </Alert>
      )}

      {/* Section 1: Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Current Follow List
          </CardTitle>
          <CardDescription>
            Your latest kind 3 event on this relay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !currentList ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No follow list found</AlertTitle>
              <AlertDescription>
                No kind 3 event was found on this relay for your pubkey. You can still import a
                follow list from a JSON file below.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">{currentFollowCount}</span>
                  <span className="text-muted-foreground">follows</span>
                </div>
                {currentEventDate && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Last modified: {format(new Date(currentEventDate * 1000), 'MMM d, yyyy HH:mm')}
                  </div>
                )}
              </div>

              {currentFollowCount === 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Your follow list is empty</AlertTitle>
                  <AlertDescription>
                    This may indicate that a client nuked your follow list. If you have a backup
                    below, restore it now. If not, import from a JSON file if you have one.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleBackup}
                  disabled={!encryptionUsable || createBackup.isPending || probeLoading}
                >
                  {createBackup.isPending || probeLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  Backup Now
                </Button>
                <Button
                  onClick={handleExport}
                  variant="outline"
                  disabled={exportFollows.isPending}
                >
                  {exportFollows.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Export to File
                </Button>
                <Button
                  onClick={handleRefresh}
                  variant="ghost"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Your Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Your Backups on This Relay
          </CardTitle>
          <CardDescription>
            Encrypted kind 30078 events. Only you can read them with your private key.
            {!encryptionUsable && ' Encryption is required to view and restore backups.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backupsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading backups…
            </div>
          ) : !backups || backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Lock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No backups yet. Click "Backup Now" above to create your first encrypted backup.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <BackupRow
                  key={backup.id}
                  backup={backup}
                  onRestore={() => handleRestoreClick(backup)}
                  onDelete={() => setDeleteTarget(backup)}
                  disabled={!encryptionUsable || restoreBackup.isPending || deleteBackup.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Recover from Other Relays */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Recover from Other Relays
          </CardTitle>
          <CardDescription>
            Your relay archives previous kind 3 events before replacing them, and your
            Nostr client publishes to multiple relays. If a client nuked your follows,
            search here to recover — no encryption required, kind 3 is public.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                remoteKind3.refetch();
                archivedKind3.refetch();
                setRecoveryOpen(true);
              }}
              disabled={remoteKind3.isFetching || archivedKind3.isFetching}
            >
              {remoteKind3.isFetching || archivedKind3.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              Search Relays
            </Button>
            <Button
              onClick={() => syncKind3.mutate()}
              disabled={syncKind3.isPending || currentFollowCount === 0}
              variant="outline"
            >
              {syncKind3.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync to Relays
            </Button>
          </div>
          {currentFollowCount === 0 && (
            <p className="text-xs text-muted-foreground">
              Sync is disabled because your follow list on this relay is empty. Restore a
              backup or recover from another relay first, then sync.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Import from File
          </CardTitle>
          <CardDescription>
            Restore your follow list from a previously exported JSON file. This publishes a new
            kind 3 event — it does not require encryption.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Before importing</AlertTitle>
            <AlertDescription>
              Close any Nostr client that may have nuked your follow list. If it republishes
              after the import, it will overwrite your restored follows.
            </AlertDescription>
          </Alert>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button
            onClick={handleImportClick}
            disabled={parseImportFile.isPending || publishImport.isPending}
          >
            {parseImportFile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Choose JSON File
          </Button>
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Follow List?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will replace your current follow list with the backup from{' '}
                  <strong>{restoreTarget ? format(new Date(restoreTarget.createdAt * 1000), 'MMM d, yyyy HH:mm') : ''}</strong>{' '}
                  ({restoreTarget?.followCount ?? 0} follows).
                </p>

                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warning</AlertTitle>
                  <AlertDescription>
                    Close any Nostr client that may have nuked your follow list before restoring.
                    If it republishes after the restore, it will overwrite your restored follows.
                  </AlertDescription>
                </Alert>

                {diffLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Computing diff…
                  </div>
                )}

                {diffError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Could not compute diff</AlertTitle>
                    <AlertDescription>
                      Failed to decrypt the backup for comparison. The backup may be corrupted
                      or your signer may be locked. You can still restore, but the changes
                      preview is unavailable.
                    </AlertDescription>
                  </Alert>
                )}

                {diffData && (
                  <DiffDisplay
                    added={diffData.added}
                    removed={diffData.removed}
                    addedLabel="in backup, not in current"
                    removedLabel="in current, not in backup"
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  A safety backup of your current follow list will be created automatically
                  before the restore. If the restore is wrong, you can recover from that
                  auto-backup.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreConfirm}
              disabled={diffLoading}
            >
              {restoreBackup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the backup from{' '}
              {deleteTarget ? format(new Date(deleteTarget.createdAt * 1000), 'MMM d, yyyy HH:mm') : ''}{' '}
              ({deleteTarget?.followCount ?? 0} follows). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {deleteBackup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Confirmation Dialog */}
      <AlertDialog open={!!importPtags} onOpenChange={(open) => { if (!open) { setImportPtags(null); setImportDiff(null); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{importSource === 'relay' ? 'Restore from Relay?' : 'Import Follow List?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will replace your current follow list with{' '}
                  <strong>{importPtags?.length ?? 0} follows</strong>{' '}
                  {importSource === 'relay' ? 'recovered from another relay.' : 'from the imported file.'}
                </p>

                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warning</AlertTitle>
                  <AlertDescription>
                    Close any Nostr client that may have nuked your follow list before importing.
                    If it republishes after the import, it will overwrite your restored follows.
                  </AlertDescription>
                </Alert>

                {importDiff && (
                  <DiffDisplay
                    added={importDiff.added}
                    removed={importDiff.removed}
                    addedLabel={importSource === 'relay' ? 'on relay, not in current' : 'in import, not in current'}
                    removedLabel={importSource === 'relay' ? 'in current, not on relay' : 'in current, not in import'}
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  {encryptionUsable
                    ? 'A safety backup of your current follow list will be created automatically before the import. If the import is wrong, you can recover from that auto-backup.'
                    : 'Your signer does not support encryption, so no automatic safety backup can be created. Make sure you have exported your current follow list first.'}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirm}>
              {publishImport.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recovery from Other Relays Dialog */}
      <AlertDialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Recover Follow List</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Search your relay's archive and other relays for your kind 3 follow list.
                  Pick the version with the most follows to restore.
                </p>

                {/* Section 1: Relay Archive (most reliable — guaranteed to have pre-nuke versions) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Archive className="h-4 w-4" />
                    Relay Archive
                  </div>

                  {archivedKind3.isFetching && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching archive…
                    </div>
                  )}

                  {archivedKind3.error && (
                    <p className="text-xs text-muted-foreground">
                      Archive unavailable: {archivedKind3.error.message}
                    </p>
                  )}

                  {!archivedKind3.isFetching && archivedKind3.data && archivedKind3.data.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No archived versions. The archive stores previous kind 3 events when they are replaced.
                    </p>
                  )}

                  {!archivedKind3.isFetching && archivedKind3.data && archivedKind3.data.length > 0 && (
                    <div className="space-y-2">
                      {archivedKind3.data.map((entry) => (
                        <RemoteKind3Row
                          key={entry.id}
                          entry={entry}
                          currentFollowCount={currentFollowCount}
                          onPick={() => handleRecoverFromRelays(entry)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 2: Other Relays (may have versions from before a nuke) */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="h-4 w-4" />
                    Other Relays
                  </div>

                  {remoteKind3.isFetching && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching relays…
                    </div>
                  )}

                  {remoteKind3.error && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Relay search failed</AlertTitle>
                      <AlertDescription>
                        Could not query other relays. Check your connection and try again.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!remoteKind3.isFetching && remoteKind3.data && remoteKind3.data.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No kind 3 events found on other relays.
                    </p>
                  )}

                  {!remoteKind3.isFetching && remoteKind3.data && remoteKind3.data.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {remoteKind3.data.map((entry) => (
                        <RemoteKind3Row
                          key={entry.id}
                          entry={entry}
                          currentFollowCount={currentFollowCount}
                          onPick={() => handleRecoverFromRelays(entry)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Backup Row ───────────────────────────────────────────────────────────

function BackupRow({
  backup,
  onRestore,
  onDelete,
  disabled,
}: {
  backup: FollowBackup;
  onRestore: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {backup.followCount} follows
            </span>
            {backup.isAuto && (
              <Badge variant="secondary" className="text-xs">
                Auto (pre-restore)
              </Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {format(new Date(backup.createdAt * 1000), 'MMM d, yyyy HH:mm')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={onRestore}
          disabled={disabled}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Restore
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Remote Kind 3 Row ────────────────────────────────────────────────────

function RemoteKind3Row({
  entry,
  currentFollowCount,
  onPick,
}: {
  entry: RemoteKind3;
  currentFollowCount: number;
  onPick: () => void;
}) {
  const isCurrent = entry.followCount === currentFollowCount;
  const isArchive = entry.relayUrl === 'archive';
  const relayHost = isArchive ? 'Relay Archive' : entry.relayUrl.replace(/^wss?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {entry.followCount} follows
            </span>
            {isCurrent && (
              <Badge variant="outline" className="text-xs">
                Current
              </Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {format(new Date(entry.createdAt * 1000), 'MMM d, yyyy HH:mm')}
            {' · '}
            <span className="font-mono text-xs">{relayHost}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={onPick}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Restore
        </Button>
      </div>
    </div>
  );
}

// ─── Diff Display ─────────────────────────────────────────────────────────

function DiffDisplay({
  added,
  removed,
  addedLabel,
  removedLabel,
}: {
  added: PTag[];
  removed: PTag[];
  addedLabel: string;
  removedLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Changes:</div>
      <div className="flex gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-green-600 font-semibold">+{added.length}</span>
          <span className="text-muted-foreground">will be added</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-600 font-semibold">-{removed.length}</span>
          <span className="text-muted-foreground">will be removed</span>
        </div>
      </div>

      {added.length > 0 && (
        <DiffList title={`Added follows (${addedLabel})`} ptags={added} color="green" />
      )}

      {removed.length > 0 && (
        <DiffList title={`Removed follows (${removedLabel})`} ptags={removed} color="red" />
      )}
    </div>
  );
}

// ─── Diff List ────────────────────────────────────────────────────────────

function DiffList({
  title,
  ptags,
  color,
}: {
  title: string;
  ptags: PTag[];
  color: 'green' | 'red';
}) {
  // Show up to 5 example pubkeys
  const examples = ptags.slice(0, 5);
  const remaining = ptags.length - examples.length;

  return (
    <div className="rounded-md border p-2 space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-0.5">
        {examples.map(([pk]) => (
          <PubkeyLabel key={pk} pubkey={pk} color={color} />
        ))}
        {remaining > 0 && (
          <div className="text-xs text-muted-foreground pl-1">
            and {remaining} more…
          </div>
        )}
      </div>
    </div>
  );
}

function PubkeyLabel({ pubkey, color }: { pubkey: string; color: 'green' | 'red' }) {
  const { data } = useAuthor(pubkey);
  const name = data?.metadata?.name || data?.metadata?.display_name;
  const npub = useMemo(() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return formatPubkeyShort(pubkey);
    }
  }, [pubkey]);

  return (
    <div className={`text-xs font-mono ${color === 'green' ? 'text-green-600' : 'text-red-600'}`}>
      {name ? (
        <span>
          <span className="font-sans font-medium">{name}</span>{' '}
          <span className="text-muted-foreground">({npub.slice(0, 16)}…)</span>
        </span>
      ) : (
        <span>{npub}</span>
      )}
    </div>
  );
}
