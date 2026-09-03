/**
 * Hook for backing up and restoring Nostr follow lists (kind 3 events).
 *
 * Backups are stored as encrypted kind 30078 (application-specific data) events
 * on our relay. The follow list p-tags are encrypted with NIP-44 (preferred)
 * or NIP-04 (fallback) to the user's own pubkey, so only the user can read them.
 *
 * For large follow lists (>1000 follows), the encrypted payload exceeds the
 * relay's 64KB event content limit (badger DB binary codec: MaxContentSize =
 * math.MaxUint16). In that case, the encrypted payload is uploaded as a Blossom
 * blob and the kind 30078 event stores a JSON pointer to the blob instead.
 *
 * Safety guarantees:
 * - Never auto-publish. Every action is explicit user action with confirmation.
 * - Never restore or import without showing a diff.
 * - Never use the backup's created_at for restore. Always use max(now, current+1).
 * - Never publish plaintext follows to the relay.
 * - Never exceed the relay's 64KB event content limit — use Blossom for large payloads.
 * - Auto-backup current follow list before restore or import (safety net, requires encryption).
 * - Verify restore/import success by re-fetching after publish.
 * - Delete Blossom blobs when deleting backups to avoid orphaned encrypted data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { useDefaultRelay } from '@/hooks/useDefaultRelay';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlossomRelays } from '@/hooks/useBlossomRelays';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { withTimeout } from '@/lib/promiseTimeout';
import { formatPubkey } from '@/lib/utils';
import { isBlockedRelay } from '@/lib/blockedRelays';
import { getApiBaseUrl } from '@/lib/relay';
import { format } from 'date-fns';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

/** d-tag prefix for follow backups. */
const D_TAG_PREFIX = 'nostr-cms:follow-backup:';
/** d-tag prefix for auto-backups created before a restore. */
const AUTO_D_TAG_PREFIX = 'nostr-cms:follow-backup:auto-pre-restore:';
/** Maximum number of backups to retain (manual + auto combined). */
const MAX_BACKUPS = 10;
/** Maximum encrypted payload size for inline storage (relay's badger DB limit is 65535). */
const MAX_INLINE_SIZE = 60_000;
/** Encryption timeout — matches existing draft encryption patterns. */
const ENCRYPT_TIMEOUT_MS = 60_000;
/** Delay before verifying restore (lets the relay index the event). */
const VERIFY_DELAY_MS = 500;
/** Timeout for fetching encrypted content from Blossom. */
const FETCH_TIMEOUT_MS = 30_000;

/** A p-tag from a kind 3 event: [pubkey, relayUrl?, petname?]. */
export type PTag = [string, string?, string?];

/** The decrypted content of a follow backup event. */
export interface FollowBackupContent {
  ptags: PTag[];
}

/** JSON pointer stored in the kind 30078 event content when storage is Blossom. */
interface BlossomPointer {
  type: 'blossom';
  url: string;
  sha256: string;
}

/** Where the encrypted payload is stored. */
export type StorageType = 'inline' | 'blossom';

/** A backup entry parsed from a kind 30078 event. */
export interface FollowBackup {
  id: string;
  dTag: string;
  createdAt: number;
  followCount: number;
  content: string; // encrypted (inline) or JSON pointer (blossom)
  isAuto: boolean;
  encryption: EncryptionMethod;
  storage: StorageType;
  blossomUrl?: string;
  blossomSha256?: string;
}

/** The user's current kind 3 follow list. */
export interface CurrentFollowList {
  event: NostrEvent;
  ptags: PTag[];
  followCount: number;
}

/** Result of a restore verification. */
export interface RestoreVerification {
  verified: boolean;
  publishedCount: number;
  relayCount: number;
  message: string;
}

/** Diff between current follow list and a backup. */
export interface FollowDiff {
  added: PTag[];
  removed: PTag[];
}

/** A kind 3 event found on a remote relay during recovery. */
export interface RemoteKind3 {
  id: string;
  createdAt: number;
  followCount: number;
  ptags: PTag[];
  /** Relay URL where this version was found. */
  relayUrl: string;
}

/**
 * Well-known public relays to query when recovering a follow list.
 * These are high-availability relays that most Nostr clients publish to by default.
 */
const RECOVERY_RELAYS: string[] = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://relay.nostr.net',
];

/** Query for the user's current kind 3 follow list. */
export function useCurrentFollowList() {
  const { nostr } = useDefaultRelay();
  const { user } = useCurrentUser();

  return useQuery<CurrentFollowList | null>({
    queryKey: ['follow-backup-current', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!nostr || !user) return null;

      const events = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      if (events.length === 0) return null;

      const event = events[0];
      const ptags = extractPTags(event);
      return { event, ptags, followCount: ptags.length };
    },
    enabled: !!nostr && !!user,
    staleTime: 30_000,
  });
}

/** Query for the user's follow backup events (kind 30078). */
export function useFollowBackups() {
  const { nostr } = useDefaultRelay();
  const { user } = useCurrentUser();

  return useQuery<FollowBackup[]>({
    queryKey: ['follow-backups', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!nostr || !user) return [];

      const events = await nostr.query(
        [{ kinds: [30078], authors: [user.pubkey], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Filter client-side by d-tag prefix — #d filter is exact match only
      return parseBackupEvents(events);
    },
    enabled: !!nostr && !!user,
    staleTime: 30_000,
  });
}

/**
 * Query multiple relays for the user's kind 3 follow list, including our relay,
 * the user's NIP-65 relay list, and well-known public relays.
 *
 * Returns all distinct versions found, sorted newest first. This lets the user
 * recover a follow list that was nuked on our relay but still exists on other
 * relays where their Nostr client published it.
 */
export function useRemoteKind3() {
  const { user } = useCurrentUser();
  const { defaultRelayUrl, poolNostr } = useDefaultRelay();
  const { config } = useAppContext();

  return useQuery<RemoteKind3[]>({
    queryKey: ['remote-kind3', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !poolNostr) return [];

      const relays = buildRecoveryRelayList(defaultRelayUrl, config.relayMetadata?.relays);

      // Query all relays in parallel, each with its own timeout.
      // We want the newest kind 3 from each relay, not just the newest overall —
      // different relays may have different versions if the user's client published
      // to some but not others.
      const results = await Promise.allSettled(
        relays.map(async (relayUrl) => {
          const relay = poolNostr.relay(relayUrl);
          const events = await relay.query(
            [{ kinds: [3], authors: [user.pubkey], limit: 3 }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
          );
          return { relayUrl, events };
        }),
      );

      // Collect all events, deduplicate by event ID, keep the relay that responded
      const byId = new Map<string, RemoteKind3>();

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const { relayUrl, events } = result.value;
        for (const event of events) {
          // Skip if we already have this event from another relay
          if (byId.has(event.id)) continue;
          const ptags = extractPTags(event);
          // Skip 0-follow kind 3s — these are nuked versions, not recovery candidates
          if (ptags.length === 0) continue;
          byId.set(event.id, {
            id: event.id,
            createdAt: event.created_at,
            followCount: ptags.length,
            ptags,
            relayUrl,
          });
        }
      }

      // Sort newest first — the most recent kind 3 is the most likely candidate
      return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: !!user?.pubkey && !!poolNostr,
    staleTime: 60_000, // Cache for 1 minute — relay queries are expensive
    retry: false,
  });
}

/**
 * Publish the user's current kind 3 follow list to all recovery relays.
 * This pushes the correct version to relays that may still have a stale or nuked
 * version. The p-tags and created_at are preserved from the current event, so
 * relays with an older version replace it, and relays with the same version
 * ignore it.
 */
export function useSyncKind3() {
  const { user } = useCurrentUser();
  const { nostr, defaultRelayUrl } = useDefaultRelay();
  const { config } = useAppContext();
  const publishEvent = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (): Promise<{ followCount: number; relayCount: number }> => {
      if (!user || !nostr) throw new Error('User not logged in or relay not connected');

      const event = await fetchCurrentKind3(nostr, user.pubkey);
      if (!event) {
        throw new Error('No follow list found on this relay. Nothing to sync.');
      }

      const ptags = extractPTags(event);
      if (ptags.length === 0) {
        throw new Error('Your follow list on this relay is empty (possibly nuked). Sync would push the empty list to other relays. Restore a backup first, then sync.');
      }

      const relays = buildRecoveryRelayList(defaultRelayUrl, config.relayMetadata?.relays);

      // Republish the current kind 3 to all recovery relays.
      // We pass the existing content, tags, and created_at so the follow list is
      // identical. useNostrPublish may add a `client` tag, which changes the event
      // ID — but the p-tags and created_at are the same, so relays with an older
      // version will replace it, and relays with the same version will ignore it.
      await publishEvent.mutateAsync({
        event: {
          kind: event.kind,
          content: event.content,
          tags: event.tags,
          created_at: event.created_at,
        },
        relays,
      });

      return { followCount: ptags.length, relayCount: relays.length };
    },
    onSuccess: (data) => {
      toast({
        title: 'Sync Complete',
        description: `Pushed ${data.followCount} follows to ${data.relayCount} relays. Stale versions will be replaced.`,
      });
      queryClient.invalidateQueries({ queryKey: ['remote-kind3'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Could not sync follow list to other relays.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Query our relay's kind 3 archive for the user's follow list history.
 * The archive stores pre-replacement kind 3 events — when a new kind 3 replaces
 * an old one with follows, the old one is archived before deletion.
 *
 * Returns all archived versions, sorted newest first. These are raw kind 3 events
 * (public, no encryption needed) that can be restored via the same import flow.
 */
export function useArchivedKind3() {
  const { user } = useCurrentUser();

  return useQuery<RemoteKind3[]>({
    queryKey: ['archived-kind3', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];

      const url = `${getApiBaseUrl()}/follows-archive/${user.pubkey}`;
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });
      if (!response.ok) {
        throw new Error(`Archive query failed (HTTP ${response.status})`);
      }
      const events = await response.json() as NostrEvent[];

      // Parse into RemoteKind3 format (same shape as relay recovery results)
      return events
        .map((event) => {
          const ptags = extractPTags(event);
          return {
            id: event.id,
            createdAt: event.created_at,
            followCount: ptags.length,
            ptags,
            relayUrl: 'archive', // marker — these are from our relay's archive, not a remote relay
          } as RemoteKind3;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: !!user?.pubkey,
    staleTime: 30_000,
    retry: false,
  });
}

/** Which encryption method a backup uses. */
export type EncryptionMethod = 'nip44' | 'nip04';

/** Result of probing which encryption methods actually work on the signer. */
export interface EncryptionProbeResult {
  /** NIP-44 is advertised AND a test encryption succeeds. */
  nip44: boolean;
  /** NIP-04 is advertised AND a test encryption succeeds. */
  nip04: boolean;
  /** The best available method, or null if neither works. */
  preferred: EncryptionMethod | null;
}

/**
 * Probe which encryption methods actually work (not just advertised).
 * Some browser extensions have a `nip44` property but a broken `encrypt` that
 * returns undefined. This does a tiny test encryption for each method.
 */
export function useEncryptionProbe() {
  const { user } = useCurrentUser();

  return useQuery<EncryptionProbeResult>({
    queryKey: ['encryption-probe', user?.pubkey],
    queryFn: async () => {
      if (!user?.signer) return { nip44: false, nip04: false, preferred: null };

      let nip44Works = false;
      let nip04Works = false;

      if (user.signer.nip44) {
        try {
          const result = await user.signer.nip44.encrypt(user.pubkey, 'probe');
          nip44Works = typeof result === 'string' && result.length > 0;
        } catch {
          nip44Works = false;
        }
      }

      if (user.signer.nip04) {
        try {
          const result = await user.signer.nip04.encrypt(user.pubkey, 'probe');
          nip04Works = typeof result === 'string' && result.length > 0;
        } catch {
          nip04Works = false;
        }
      }

      const preferred: EncryptionMethod | null = nip44Works ? 'nip44' : nip04Works ? 'nip04' : null;

      return { nip44: nip44Works, nip04: nip04Works, preferred };
    },
    enabled: !!user?.signer,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes — don't re-probe on every render
    retry: false,
  });
}

/** Create a backup of the current follow list. */
export function useCreateBackup() {
  const { user } = useCurrentUser();
  const { nostr, defaultRelayUrl } = useDefaultRelay();
  const blossomServers = useBlossomRelays();
  const publishEvent = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: probe } = useEncryptionProbe();

  return useMutation({
    mutationFn: async () => {
      if (!user || !nostr) throw new Error('User not logged in or relay not connected');
      if (!defaultRelayUrl) throw new Error('Default relay URL not configured');
      const method = probe?.preferred ?? null;
      if (!method) throw new Error('No encryption method available on your signer. Use "Export to File" instead.');

      const event = await fetchCurrentKind3(nostr, user.pubkey);
      if (!event) {
        throw new Error('No follow list found on the relay. Nothing to back up.');
      }

      const ptags = extractPTags(event);
      const followCount = await createBackupEvent(
        publishEvent, user.signer, user.pubkey, ptags, D_TAG_PREFIX, defaultRelayUrl, method, blossomServers,
      );

      // Prune old backups beyond MAX_BACKUPS
      await pruneOldBackups(nostr, user.pubkey, publishEvent, defaultRelayUrl, user.signer, blossomServers);

      return { followCount, method };
    },
    onSuccess: (data) => {
      toast({
        title: 'Backup Created',
        description: `Backed up ${data.followCount} follows to an encrypted event on this relay.`,
      });
      queryClient.invalidateQueries({ queryKey: ['follow-backups'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Backup Failed',
        description: error.message || 'Could not create backup.',
        variant: 'destructive',
      });
    },
  });
}

/** Restore a backup — replaces the current follow list. */
export function useRestoreBackup() {
  const { user } = useCurrentUser();
  const { nostr, publishRelays, defaultRelayUrl } = useDefaultRelay();
  const blossomServers = useBlossomRelays();
  const publishEvent = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: probe } = useEncryptionProbe();

  return useMutation({
    mutationFn: async (backup: FollowBackup): Promise<RestoreVerification> => {
      if (!user || !nostr) throw new Error('User not logged in or relay not connected');
      if (!defaultRelayUrl) throw new Error('Default relay URL not configured');

      // Decrypt the backup (handles both inline and Blossom storage)
      const ptags = await decryptBackup(backup, user.pubkey, user.signer);

      // Fetch current kind 3
      const currentEvent = await fetchCurrentKind3(nostr, user.pubkey);

      // Auto-backup current follow list before restore (safety net)
      await autoBackupBeforeDestructiveOp(
        publishEvent, user.signer, user.pubkey, currentEvent, defaultRelayUrl, probe?.preferred ?? null, blossomServers,
      );

      // Publish the restored kind 3
      await publishKind3(publishEvent, publishRelays, ptags, currentEvent);

      // Verify: wait 500ms then fetch and compare.
      // Non-fatal: if verification fails, the restore still succeeded.
      try {
        return await verifyKind3Publish(nostr, user.pubkey, ptags);
      } catch (e) {
        console.warn('Restore verification failed:', e);
        return {
          verified: false,
          publishedCount: ptags.length,
          relayCount: 0,
          message: 'Restore published, but verification failed (relay query error or timeout). Check your follow list in your Nostr client to confirm.',
        };
      }
    },
    onSuccess: (result) => {
      toast({
        title: result.verified ? 'Restore Verified' : 'Restore Warning',
        description: result.message,
        variant: result.verified ? 'default' : 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['follow-backup-current'] });
      queryClient.invalidateQueries({ queryKey: ['follow-backups'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Restore Failed',
        description: error.message || 'Could not restore backup.',
        variant: 'destructive',
      });
    },
  });
}

/** Delete a backup event via kind 5 deletion. Also deletes the Blossom blob if applicable. */
export function useDeleteBackup() {
  const { user } = useCurrentUser();
  const { defaultRelayUrl } = useDefaultRelay();
  const blossomServers = useBlossomRelays();
  const publishEvent = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (backup: FollowBackup) => {
      if (!user) throw new Error('User not logged in');
      if (!defaultRelayUrl) throw new Error('Default relay URL not configured');

      // Publish kind 5 deletion to our relay first (where the backup event is stored).
      // If this fails, the Blossom blob is still intact and the backup remains restorable.
      await publishEvent.mutateAsync({
        event: {
          kind: 5,
          content: '',
          tags: [
            ['e', backup.id],
          ],
        },
        relays: [defaultRelayUrl],
      });

      // Now safe to delete the Blossom blob — the relay reference is gone.
      // Non-fatal if this fails (orphaned storage, not data loss).
      if (backup.storage === 'blossom' && backup.blossomSha256) {
        await deleteBlossomBlob(user.signer, backup.blossomSha256, blossomServers);
      }

      return backup;
    },
    onSuccess: () => {
      toast({ title: 'Backup Deleted', description: 'The backup has been removed from the relay.' });
      queryClient.invalidateQueries({ queryKey: ['follow-backups'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Could not delete backup.',
        variant: 'destructive',
      });
    },
  });
}

/** Export the current follow list as a downloadable JSON file. */
export function useExportFollows() {
  const { nostr } = useDefaultRelay();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!nostr || !user) throw new Error('User not logged in or relay not connected');

      const event = await fetchCurrentKind3(nostr, user.pubkey);
      if (!event) {
        throw new Error('No follow list found on the relay. Nothing to export.');
      }

      const ptags = extractPTags(event);

      const exportData = {
        type: 'nostr-follow-list-export',
        version: 1,
        exportedAt: Math.floor(Date.now() / 1000),
        sourceEventId: event.id,
        sourceCreatedAt: event.created_at,
        followCount: ptags.length,
        ptags,
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `follows-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { followCount: ptags.length };
    },
    onSuccess: (data) => {
      toast({
        title: 'Export Complete',
        description: `Exported ${data.followCount} follows to a JSON file. Store it safely.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Export Failed',
        description: error.message || 'Could not export follow list.',
        variant: 'destructive',
      });
    },
  });
}

/** Parse a follow list JSON file. Does NOT publish — caller must confirm via usePublishImport. */
export function useParseImportFile() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (file: File): Promise<PTag[]> => {
      const text = await file.text();
      let data: { ptags?: PTag[] };

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Could not parse the JSON file. Make sure it is a valid follow list export.');
      }

      if (!data.ptags || !Array.isArray(data.ptags) || data.ptags.length === 0) {
        throw new Error('The file does not contain any follow list p-tags.');
      }

      // Validate p-tags: each must have at least a pubkey, optional relay/petname must be strings
      const ptags: PTag[] = [];
      for (const tag of data.ptags) {
        if (!Array.isArray(tag) || tag.length < 1 || typeof tag[0] !== 'string') continue;
        const ptag: PTag = [tag[0]];
        if (tag.length >= 2 && typeof tag[1] === 'string') ptag[1] = tag[1];
        if (tag.length >= 3 && typeof tag[2] === 'string') ptag[2] = tag[2];
        ptags.push(ptag);
      }
      if (ptags.length === 0) {
        throw new Error('No valid p-tags found in the file.');
      }

      return ptags;
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Could not read follow list file.',
        variant: 'destructive',
      });
    },
  });
}

/** Publish imported p-tags as a new kind 3. Called after user confirms the diff. */
export function usePublishImport() {
  const { user } = useCurrentUser();
  const { nostr, publishRelays, defaultRelayUrl } = useDefaultRelay();
  const blossomServers = useBlossomRelays();
  const publishEvent = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: probe } = useEncryptionProbe();

  return useMutation({
    mutationFn: async (ptags: PTag[]): Promise<{ followCount: number; verification: RestoreVerification }> => {
      if (!user || !nostr) throw new Error('User not logged in or relay not connected');

      const currentEvent = await fetchCurrentKind3(nostr, user.pubkey);

      // Auto-backup current follow list before import (safety net — same as restore).
      // Only possible if an encryption method is available; import itself does not require it.
      await autoBackupBeforeDestructiveOp(
        publishEvent, user.signer, user.pubkey, currentEvent, defaultRelayUrl, probe?.preferred ?? null, blossomServers,
      );

      await publishKind3(publishEvent, publishRelays, ptags, currentEvent);

      // Verify: non-fatal — if verification fails, the import still succeeded.
      let verification: RestoreVerification;
      try {
        verification = await verifyKind3Publish(nostr, user.pubkey, ptags);
      } catch (e) {
        console.warn('Import verification failed:', e);
        verification = {
          verified: false,
          publishedCount: ptags.length,
          relayCount: 0,
          message: 'Import published, but verification failed (relay query error or timeout). Check your follow list in your Nostr client to confirm.',
        };
      }
      return { followCount: ptags.length, verification };
    },
    onSuccess: (data) => {
      toast({
        title: data.verification.verified ? 'Import Verified' : 'Import Warning',
        description: data.verification.message,
        variant: data.verification.verified ? 'default' : 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['follow-backup-current'] });
      queryClient.invalidateQueries({ queryKey: ['follow-backups'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Could not import follow list.',
        variant: 'destructive',
      });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Relay type for helpers (matches the subset of NRelay1 we use). */
type RelayLike = {
  query: (filters: NostrFilterLike[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
};
type NostrFilterLike = {
  kinds: number[];
  authors: string[];
  limit?: number;
};

/** Build the list of relays to query/publish to for recovery: our relay + NIP-65 + well-known public relays. */
function buildRecoveryRelayList(
  defaultRelayUrl: string | undefined,
  nip65Relays: { url: string; read: boolean; write: boolean }[] | undefined,
): string[] {
  const relaySet = new Set<string>();

  if (defaultRelayUrl) relaySet.add(defaultRelayUrl);

  for (const r of nip65Relays ?? []) {
    if (r.read && !isBlockedRelay(r.url)) relaySet.add(r.url);
  }

  for (const r of RECOVERY_RELAYS) {
    if (!isBlockedRelay(r)) relaySet.add(r);
  }

  return [...relaySet];
}

/** Fetch the user's current kind 3 event from the relay. Returns null if none. */
async function fetchCurrentKind3(nostr: RelayLike, pubkey: string): Promise<NostrEvent | null> {
  const events = await nostr.query(
    [{ kinds: [3], authors: [pubkey], limit: 1 }],
    { signal: AbortSignal.timeout(5000) },
  );
  return events[0] ?? null;
}

/** Encrypt p-tags and publish a kind 30078 backup event to our relay. Returns the follow count. */
async function createBackupEvent(
  publishEvent: ReturnType<typeof useNostrPublish>,
  signer: NostrSigner,
  pubkey: string,
  ptags: PTag[],
  dTagPrefix: string,
  relayUrl: string,
  preferredMethod: EncryptionMethod,
  blossomServers: string[],
): Promise<number> {
  const payload: FollowBackupContent = { ptags };
  const plaintext = JSON.stringify(payload);

  // Try preferred method first, then fall back to the other method.
  // The probe may pass for small payloads but the extension may fail for large ones.
  const methodsToTry: EncryptionMethod[] = [preferredMethod];
  const fallback: EncryptionMethod = preferredMethod === 'nip44' ? 'nip04' : 'nip44';
  if (getEncryptFn(signer, fallback)) methodsToTry.push(fallback);

  let encrypted: string | null = null;
  let usedMethod: EncryptionMethod = preferredMethod;
  let lastError: Error | null = null;

  for (const method of methodsToTry) {
    const encryptFn = getEncryptFn(signer, method);
    if (!encryptFn) continue;
    try {
      encrypted = await withTimeout(
        encryptFn(pubkey, plaintext),
        ENCRYPT_TIMEOUT_MS,
        'Encryption timed out. Check that your signer is unlocked and authorized.',
      );
      usedMethod = method;
      break;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Try the next method
    }
  }

  if (encrypted === null) {
    const msg = lastError?.message ?? 'Unknown error';
    if (msg.includes('expected string result')) {
      throw new Error(
        'Your browser extension reports encryption support but it does not work. ' +
        'This is a known issue with some extensions. Use "Export to File" instead to back up your follow list.',
      );
    }
    throw lastError ?? new Error('Encryption failed for unknown reasons.');
  }

  // Determine storage: inline for small payloads, Blossom for large ones.
  // The relay's badger DB binary codec limits event content to 65535 bytes.
  const now = Math.floor(Date.now() / 1000);
  const baseTags: string[][] = [
    ['d', `${dTagPrefix}${now}`],
    ['follow_count', String(ptags.length)],
    ['encryption', usedMethod],
  ];

  if (encrypted.length <= MAX_INLINE_SIZE) {
    // Inline storage — encrypted content goes directly in the event
    await publishEvent.mutateAsync({
      event: {
        kind: 30078,
        content: encrypted,
        tags: [...baseTags, ['storage', 'inline']],
      },
      relays: [relayUrl],
    });
  } else {
    // Blossom storage — upload encrypted content as a blob, store JSON pointer in event
    if (blossomServers.length === 0) {
      throw new Error(
        `Encrypted backup is too large for inline storage (${Math.round(encrypted.length / 1024)}KB, ` +
        `limit is ${Math.round(MAX_INLINE_SIZE / 1024)}KB) and no Blossom servers are configured. ` +
        `Use "Export to File" instead.`,
      );
    }

    const file = new File([encrypted], 'follow-backup.encrypted', { type: 'application/octet-stream' });
    const uploader = new BlossomUploader({ servers: blossomServers, signer });
    const uploadTags = await uploader.upload(file, { signal: AbortSignal.timeout(120_000) });
    const blobUrl = uploadTags.find(([name]) => name === 'url')?.[1];
    const blobSha256 = uploadTags.find(([name]) => name === 'x')?.[1];

    if (!blobUrl || !blobSha256) {
      throw new Error('Blossom upload succeeded but did not return a URL or sha256.');
    }

    const pointer: BlossomPointer = { type: 'blossom', url: blobUrl, sha256: blobSha256 };
    try {
      await publishEvent.mutateAsync({
        event: {
          kind: 30078,
          content: JSON.stringify(pointer),
          tags: [...baseTags, ['storage', 'blossom'], ['x', blobSha256]],
        },
        relays: [relayUrl],
      });
    } catch (publishError) {
      // Event publish failed — clean up the orphaned blob to avoid wasted storage
      await deleteBlossomBlob(signer, blobSha256, blossomServers);
      throw publishError;
    }
  }

  return ptags.length;
}

/** Verify a kind 3 publish by re-fetching and comparing pubkey sets. */
async function verifyKind3Publish(
  nostr: RelayLike,
  pubkey: string,
  publishedPtags: PTag[],
): Promise<RestoreVerification> {
  await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));

  const verifyEvents = await nostr.query(
    [{ kinds: [3], authors: [pubkey], limit: 1 }],
    { signal: AbortSignal.timeout(5000) },
  );

  const publishedCount = publishedPtags.length;

  if (verifyEvents.length === 0) {
    return {
      verified: false,
      publishedCount,
      relayCount: 0,
      message: 'Published but the relay has no kind 3 event for you. The publish may have been rejected.',
    };
  }

  const relayPtags = extractPTags(verifyEvents[0]);
  const relayCount = relayPtags.length;

  const publishedSet = new Set(publishedPtags.map(([pk]) => pk));
  const relaySet = new Set(relayPtags.map(([pk]) => pk));

  const matches = publishedSet.size === relaySet.size &&
    [...publishedSet].every((pk) => relaySet.has(pk));

  if (matches) {
    return {
      verified: true,
      publishedCount,
      relayCount,
      message: `Verified: ${relayCount} follows on the relay.`,
    };
  }

  return {
    verified: false,
    publishedCount,
    relayCount,
    message: `Another client may have updated your follow list. ` +
      `Published ${publishedCount} follows, but the relay now shows ${relayCount}. ` +
      `Check your follow list in your Nostr client.`,
  };
}

/** Parse kind 30078 events into FollowBackup entries, filtering by d-tag prefix. */
function parseBackupEvents(events: NostrEvent[]): FollowBackup[] {
  const backups: FollowBackup[] = [];
  for (const event of events) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    if (!dTag || !dTag.startsWith(D_TAG_PREFIX)) continue;

    const isAuto = dTag.startsWith(AUTO_D_TAG_PREFIX);
    const followCountStr = event.tags.find(([name]) => name === 'follow_count')?.[1];
    const followCount = followCountStr ? parseInt(followCountStr, 10) : 0;
    const encryptionStr = event.tags.find(([name]) => name === 'encryption')?.[1] as EncryptionMethod | undefined;
    // Default to nip44 for backwards compat with old backups that have no encryption tag
    const encryption: EncryptionMethod = encryptionStr === 'nip04' ? 'nip04' : 'nip44';
    const storageStr = event.tags.find(([name]) => name === 'storage')?.[1] as StorageType | undefined;
    const storage: StorageType = storageStr === 'blossom' ? 'blossom' : 'inline';
    const blossomSha256 = event.tags.find(([name]) => name === 'x')?.[1];

    // For blossom storage, parse the JSON pointer from content to get the URL
    let blossomUrl: string | undefined;
    if (storage === 'blossom') {
      try {
        const pointer = JSON.parse(event.content) as BlossomPointer;
        if (pointer.type === 'blossom' && pointer.url) {
          blossomUrl = pointer.url;
        }
      } catch {
        // Malformed pointer — backup is unrecoverable
      }
    }

    backups.push({
      id: event.id,
      dTag,
      createdAt: event.created_at,
      followCount,
      content: event.content,
      isAuto,
      encryption,
      storage,
      blossomUrl,
      blossomSha256,
    });
  }
  backups.sort((a, b) => b.createdAt - a.createdAt);
  return backups;
}

/** Compute created_at for a new kind 3: always newer than whatever is on the relay. */
function computeRestoreTimestamp(currentEvent: NostrEvent | null): number {
  const nowSec = Math.floor(Date.now() / 1000);
  return currentEvent ? Math.max(nowSec, currentEvent.created_at + 1) : nowSec;
}

/** Publish a new kind 3 event with the given p-tags, using a safe created_at. */
async function publishKind3(
  publishEvent: ReturnType<typeof useNostrPublish>,
  publishRelays: string[],
  ptags: PTag[],
  currentEvent: NostrEvent | null,
): Promise<void> {
  const relaysToUse = publishRelays.length > 0 ? publishRelays : undefined;
  await publishEvent.mutateAsync({
    event: {
      kind: 3,
      content: currentEvent?.content ?? '',
      tags: ptagsToStringTags(ptags),
      created_at: computeRestoreTimestamp(currentEvent),
    },
    relays: relaysToUse,
  });
}

/**
 * Auto-backup the current follow list before a destructive operation (restore or import).
 * Non-fatal: logs and continues if encryption or publish fails.
 * Skipped silently if no encryption method is available or the current list is empty.
 */
async function autoBackupBeforeDestructiveOp(
  publishEvent: ReturnType<typeof useNostrPublish>,
  signer: NostrSigner | undefined,
  pubkey: string,
  currentEvent: NostrEvent | null,
  relayUrl: string | undefined,
  method: EncryptionMethod | null,
  blossomServers: string[],
): Promise<void> {
  if (!currentEvent || !signer || !relayUrl || !method) return;
  const currentPtags = extractPTags(currentEvent);
  if (currentPtags.length === 0) return;
  try {
    await createBackupEvent(
      publishEvent, signer, pubkey, currentPtags, AUTO_D_TAG_PREFIX, relayUrl, method, blossomServers,
    );
  } catch (e) {
    console.warn('Auto-backup before destructive operation failed:', e);
  }
}

/** Delete a Blossom blob via BUD-04 delete auth. Non-fatal: logs and continues if it fails. */
async function deleteBlossomBlob(signer: NostrSigner, sha256: string, servers: string[]): Promise<void> {
  if (servers.length === 0) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    const authEvent = await signer.signEvent({
      kind: 24242,
      content: 'Delete follow-list backup blob',
      created_at: now,
      tags: [
        ['t', 'delete'],
        ['x', sha256],
        ['expiration', (now + 60).toString()],
      ],
    });
    const authorization = `Nostr ${btoa(JSON.stringify(authEvent))}`;
    // Try each server — the blob is on one of them. Timeout prevents hanging
    // if all servers are unreachable.
    await Promise.any(servers.map(async (server) => {
      const res = await fetch(`${server}/${sha256}`, {
        method: 'DELETE',
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`DELETE failed on ${server}: HTTP ${res.status}`);
    }));
  } catch (e) {
    // Non-fatal: the blob may already be deleted, or the server may be down.
    // The kind 5 deletion still removes the backup event.
    console.warn('Failed to delete Blossom blob:', e);
  }
}

/** Get the encrypt function for a given method, or null if the signer doesn't support it. */
function getEncryptFn(signer: NostrSigner, method: EncryptionMethod): ((pubkey: string, content: string) => Promise<string>) | null {
  return method === 'nip44' ? signer.nip44?.encrypt ?? null : signer.nip04?.encrypt ?? null;
}

/** Get the decrypt function for a given method, or null if the signer doesn't support it. */
function getDecryptFn(signer: NostrSigner, method: EncryptionMethod): ((pubkey: string, content: string) => Promise<string>) | null {
  return method === 'nip44' ? signer.nip44?.decrypt ?? null : signer.nip04?.decrypt ?? null;
}

/** Extract p-tags from a kind 3 event. */
function extractPTags(event: NostrEvent): PTag[] {
  return event.tags
    .filter(([name]) => name === 'p')
    .map((tag) => {
      const result: PTag = [tag[1]];
      if (tag[2]) result[1] = tag[2];
      if (tag[3]) result[2] = tag[3];
      return result;
    });
}

/** Compute the diff between current follows and a backup. */
export function computeDiff(current: PTag[], backup: PTag[]): FollowDiff {
  const currentSet = new Map(current.map(([pk, relay, petname]) => [pk, { relay, petname }]));
  const backupSet = new Map(backup.map(([pk, relay, petname]) => [pk, { relay, petname }]));

  const added: PTag[] = [];
  const removed: PTag[] = [];

  for (const [pk, info] of backupSet) {
    if (!currentSet.has(pk)) {
      const tag: PTag = [pk];
      if (info.relay) tag[1] = info.relay;
      if (info.petname) tag[2] = info.petname;
      added.push(tag);
    }
  }

  for (const [pk, info] of currentSet) {
    if (!backupSet.has(pk)) {
      const tag: PTag = [pk];
      if (info.relay) tag[1] = info.relay;
      if (info.petname) tag[2] = info.petname;
      removed.push(tag);
    }
  }

  return { added, removed };
}

/** Fetch the encrypted content from a backup (inline or Blossom). */
async function fetchEncryptedContent(backup: FollowBackup): Promise<string> {
  if (backup.storage === 'blossom') {
    if (!backup.blossomUrl) {
      throw new Error('Backup uses Blossom storage but the blob URL is missing. The backup may be corrupted.');
    }
    const response = await fetch(backup.blossomUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch backup blob from Blossom (HTTP ${response.status}). The blob may have been deleted.`);
    }
    return await response.text();
  }
  return backup.content;
}

/** Decrypt a backup for diff display. Returns the p-tags. */
export async function decryptBackup(
  backup: FollowBackup,
  pubkey: string,
  signer: NostrSigner,
): Promise<PTag[]> {
  const decryptFn = getDecryptFn(signer, backup.encryption);
  if (!decryptFn) {
    throw new Error(`Your signer does not support ${backup.encryption.toUpperCase()} decryption, which is required for this backup.`);
  }
  const encrypted = await fetchEncryptedContent(backup);
  const decrypted = await withTimeout(
    decryptFn(pubkey, encrypted),
    ENCRYPT_TIMEOUT_MS,
    'Decryption timed out. Check that your signer is unlocked and authorized.',
  );
  let payload: FollowBackupContent;
  try {
    payload = JSON.parse(decrypted) as FollowBackupContent;
  } catch {
    throw new Error('The backup could not be parsed after decryption. It may be corrupted or created with a different account.');
  }
  if (!payload.ptags || !Array.isArray(payload.ptags)) {
    throw new Error('The backup is missing a valid follow list. It may be corrupted.');
  }
  return payload.ptags;
}

/** Prune old backups beyond MAX_BACKUPS total (deletes oldest via kind 5 + Blossom blob delete). */
async function pruneOldBackups(
  nostr: RelayLike,
  pubkey: string,
  publishEvent: ReturnType<typeof useNostrPublish>,
  relayUrl: string,
  signer: NostrSigner,
  blossomServers: string[],
): Promise<void> {
  const events = await nostr.query(
    [{ kinds: [30078], authors: [pubkey], limit: 50 }],
    { signal: AbortSignal.timeout(5000) },
  );

  const backups = parseBackupEvents(events);

  // Keep the MAX_BACKUPS newest (both manual and auto count toward the limit)
  const toDelete = backups.slice(MAX_BACKUPS);

  for (const backup of toDelete) {
    // Publish kind 5 deletion to the relay first. If this fails, the
    // Blossom blob is still intact and the backup remains restorable.
    try {
      await publishEvent.mutateAsync({
        event: {
          kind: 5,
          content: '',
          tags: [['e', backup.id]],
        },
        relays: [relayUrl],
      });
    } catch (e) {
      console.warn(`Failed to prune old backup ${backup.id}:`, e);
      continue; // Don't delete the blob if relay deletion failed
    }

    // Now safe to delete the Blossom blob — the relay reference is gone.
    // Non-fatal if this fails (orphaned storage, not data loss).
    if (backup.storage === 'blossom' && backup.blossomSha256) {
      await deleteBlossomBlob(signer, backup.blossomSha256, blossomServers);
    }
  }
}

/** Convert PTag[] to string[][] for publishing (filters out undefined entries). */
function ptagsToStringTags(ptags: PTag[]): string[][] {
  return ptags.map((tag) => {
    const result: string[] = ['p', tag[0]];
    if (tag[1]) result.push(tag[1]);
    if (tag[2]) result.push(tag[2]);
    return result;
  });
}

/** Format a pubkey for display as npub (truncated). */
export function formatPubkeyShort(pubkey: string): string {
  const npub = formatPubkey(pubkey);
  if (npub.length <= 16) return npub;
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}
