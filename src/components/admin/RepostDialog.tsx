/**
 * RepostDialog - Dialog for scheduling or immediately publishing NIP-18 reposts.
 *
 * Shows a preview of the content being reposted, embeds the SchedulePicker,
 * and supports optional repeating reposts (multiple reposts at regular intervals
 * with an optional end date).
 */

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Repeat, Loader2, Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { SchedulePicker, type ScheduleConfig } from './SchedulePicker';
import { useCreateRepost, type ScheduleFailure } from '@/hooks/useCreateRepost';
import { useToast } from '@/hooks/useToast';
import { getRepostKind, type RepostTarget } from '@/lib/repost';
import { kindLabel } from '@/lib/kinds';

interface RepostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RepostTarget;
  relayUrl: string;
  publishRelays: string[];
  /** Optional thumbnail URL to show in the preview */
  thumbnailUrl?: string;
  /** Optional title/summary to show in the preview */
  previewTitle?: string;
}

const INTERVAL_OPTIONS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '2 weeks', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '1 month', ms: 30 * 24 * 60 * 60 * 1000 },
];

const MAX_REPEATS = 10;

export function RepostDialog({
  open,
  onOpenChange,
  target,
  relayUrl,
  publishRelays,
  thumbnailUrl,
  previewTitle,
}: RepostDialogProps) {
  const { toast } = useToast();
  const createRepost = useCreateRepost();

  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    enabled: false,
    scheduledFor: null,
  });
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [intervalMs, setIntervalMs] = useState(7 * 24 * 60 * 60 * 1000); // default: 1 week
  const [endDate, setEndDate] = useState(''); // empty = no end date, cap at MAX_REPEATS
  const [failedReposts, setFailedReposts] = useState<ScheduleFailure[]>([]);

  const repostKind = getRepostKind(target.kind);

  // Compute the effective repeat count from the end date, or cap at MAX_REPEATS
  const repeatCount = useMemo(() => {
    if (!repeatEnabled || !scheduleConfig.scheduledFor) return 1;

    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      const start = scheduleConfig.scheduledFor;
      if (end <= start) return 0; // invalid — will disable the button
      const count = Math.floor((end.getTime() - start.getTime()) / intervalMs) + 1;
      return Math.max(1, Math.min(MAX_REPEATS, count));
    }

    // No end date → cap at MAX_REPEATS
    return MAX_REPEATS;
  }, [repeatEnabled, scheduleConfig.scheduledFor, endDate, intervalMs]);

  // Calculate all scheduled dates for the preview
  const scheduledDates = useMemo(() => {
    if (!scheduleConfig.enabled || !scheduleConfig.scheduledFor || !repeatEnabled) return [];
    if (repeatCount <= 0) return [];
    const dates: Date[] = [];
    for (let i = 0; i < repeatCount; i++) {
      dates.push(new Date(scheduleConfig.scheduledFor.getTime() + i * intervalMs));
    }
    return dates;
  }, [scheduleConfig, repeatEnabled, repeatCount, intervalMs]);

  const isPending = createRepost.isPending;

  const handleRepostNow = async () => {
    try {
      await createRepost.mutateAsync({
        target,
        relayUrl,
        scheduleFor: null,
        publishRelays,
      });
      toast({ title: 'Reposted', description: 'Repost published immediately.' });
      handleClose();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to repost.',
        variant: 'destructive',
      });
    }
  };

  const handleScheduleRepost = async () => {
    if (!scheduleConfig.enabled || !scheduleConfig.scheduledFor) return;

    try {
      const repeat = repeatEnabled && repeatCount > 1
        ? { count: repeatCount, intervalMs }
        : null;
      const result = await createRepost.mutateAsync({
        target,
        relayUrl,
        scheduleFor: scheduleConfig.scheduledFor,
        publishRelays,
        repeat,
      });

      if (result.failed.length > 0) {
        // Partial failure: some reposts were scheduled, some were not.
        // Keep the dialog open and show which ones failed so the user can retry.
        setFailedReposts(result.failed);
        const succeeded = result.scheduledPostIds.length;
        const failed = result.failed.length;
        toast({
          title: 'Partial failure',
          description: `${succeeded} repost${succeeded !== 1 ? 's' : ''} scheduled, ${failed} failed. You can retry the failed ones.`,
          variant: 'destructive',
        });
        return;
      }

      const count = repeat ? repeatCount : 1;
      const displayDate = repeat && scheduledDates.length > 0
        ? scheduledDates[0]
        : scheduleConfig.scheduledFor;
      toast({
        title: count > 1 ? `Scheduled ${count} reposts` : 'Repost scheduled',
        description: count > 1
          ? `${count} reposts scheduled starting ${format(displayDate!, 'MMM d, yyyy')}.`
          : `Repost scheduled for ${format(displayDate!, 'MMM d, yyyy · h:mm a')}.`,
      });
      handleClose();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to schedule repost.',
        variant: 'destructive',
      });
    }
  };

  const handleRetryFailed = async () => {
    if (failedReposts.length === 0) return;

    try {
      const result = await createRepost.mutateAsync({
        target,
        relayUrl,
        scheduleFor: null, // not used when preSignedEvents is provided
        publishRelays,
        preSignedEvents: failedReposts.map(f => ({
          signedEvent: f.signedEvent,
          scheduledDate: f.scheduledDate,
        })),
      });

      if (result.failed.length > 0) {
        // Still some failures — update the list to only the remaining failures
        setFailedReposts(result.failed);
        const succeeded = result.scheduledPostIds.length;
        toast({
          title: 'Retry partial',
          description: `${succeeded} retried successfully, ${result.failed.length} still failing.`,
          variant: 'destructive',
        });
      } else {
        // All retries succeeded
        setFailedReposts([]);
        toast({
          title: 'Retry successful',
          description: `All ${result.scheduledPostIds.length} repost${result.scheduledPostIds.length !== 1 ? 's' : ''} scheduled.`,
        });
        handleClose();
      }
    } catch (error: unknown) {
      toast({
        title: 'Retry failed',
        description: error instanceof Error ? error.message : 'Failed to retry reposts.',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setScheduleConfig({ enabled: false, scheduledFor: null });
    setRepeatEnabled(false);
    setIntervalMs(7 * 24 * 60 * 60 * 1000);
    setEndDate('');
    setFailedReposts([]);
    onOpenChange(false);
  };

  const canSchedule = scheduleConfig.enabled
    && !!scheduleConfig.scheduledFor
    && !isPending
    && repeatCount > 0;

  // Whether the end date produced a count that hit the MAX_REPEATS cap
  const cappedAtMax = endDate && repeatCount === MAX_REPEATS
    && scheduleConfig.scheduledFor
    && (() => {
      const end = new Date(endDate + 'T23:59:59');
      const uncapped = Math.floor((end.getTime() - scheduleConfig.scheduledFor!.getTime()) / intervalMs) + 1;
      return uncapped > MAX_REPEATS;
    })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 shrink-0" />
            Schedule Repost
          </DialogTitle>
          <DialogDescription>
            Resurface this {kindLabel(target.kind).toLowerCase()} to your followers.
          </DialogDescription>
        </DialogHeader>

        {/* Content preview */}
        <div className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30 overflow-hidden">
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt={previewTitle || ''}
              className="h-16 w-16 rounded object-cover shrink-0"
            />
          )}
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">
              {previewTitle || target.content.slice(0, 80).replace(/[*#>`]/g, '') || 'Untitled'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {kindLabel(target.kind)} · Repost as Kind {repostKind}
            </p>
          </div>
        </div>

        {/* Schedule picker */}
        <SchedulePicker
          value={scheduleConfig}
          onChange={setScheduleConfig}
          disabled={isPending}
        />

        {/* Repeat section — optional toggle, only when scheduling is enabled */}
        {scheduleConfig.enabled && (
          <div className="space-y-3 p-3 border rounded-md bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Repeat className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium">Auto-repeat</span>
              </div>
              <Switch
                checked={repeatEnabled}
                onCheckedChange={setRepeatEnabled}
                disabled={isPending}
              />
            </div>

            {repeatEnabled && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">Every</span>
                  <Select
                    value={String(intervalMs)}
                    onValueChange={(v) => setIntervalMs(Number(v))}
                    disabled={isPending}
                  >
                    <SelectTrigger className="flex-1 min-w-0 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.ms} value={String(opt.ms)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">End date</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 min-w-0 h-9"
                    disabled={isPending}
                  />
                </div>

                {!endDate && (
                  <p className="text-xs text-muted-foreground">
                    No end date set — will repeat up to {MAX_REPEATS} times.
                  </p>
                )}
                {cappedAtMax && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    End date exceeds {MAX_REPEATS} reposts. Capped at {MAX_REPEATS}.
                  </p>
                )}
                {endDate && repeatCount === 0 && (
                  <p className="text-xs text-destructive">
                    End date must be after the scheduled date.
                  </p>
                )}

                {/* Date preview */}
                {scheduledDates.length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1 overflow-hidden">
                    <div className="flex items-center gap-1 font-medium text-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {repeatCount} repost{repeatCount > 1 ? 's' : ''} on:
                    </div>
                    <div className="pl-4 space-y-0.5">
                      {scheduledDates.map((date, i) => (
                        <div key={i} className="break-words">
                          {format(date, 'MMM d, yyyy · h:mm a')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Partial-failure panel — shown when some reposts failed to schedule */}
        {failedReposts.length > 0 && (
          <div className="space-y-3 p-3 border border-destructive/30 rounded-md bg-destructive/5">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">
                  {failedReposts.length} repost{failedReposts.length !== 1 ? 's' : ''} failed to schedule
                </p>
                <p className="text-muted-foreground mt-0.5">
                  The successfully scheduled reposts are active. You can retry just the failed ones below.
                </p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 pl-6">
              {failedReposts.map((f, i) => (
                <div key={i} className="break-words">
                  {format(f.scheduledDate, 'MMM d, yyyy · h:mm a')} — {f.error}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pl-6">
              <Button
                size="sm"
                onClick={handleRetryFailed}
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Retry Failed
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          {!scheduleConfig.enabled ? (
            <Button
              onClick={handleRepostNow}
              disabled={isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Repost Now
            </Button>
          ) : (
            <Button
              onClick={handleScheduleRepost}
              disabled={!canSchedule}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {repeatEnabled && repeatCount > 1
                ? `Schedule ${repeatCount} Reposts`
                : 'Schedule Repost'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
