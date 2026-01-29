import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { NostrEvent } from '@nostrify/nostrify';
import type {
  ZapReceipt,
  ParsedZap,
  AnalyticsData,
  TimeRange,
  CustomDateRange
} from '@/types/zaplytics';
import {
  isValidZapReceipt,
  parseZapReceipt,
  getDateRange,
  groupZapsByPeriod,
  groupZapsByContent,
  groupZapsByKind,
  getTopZappers,
  groupZapsByHour,
  groupZapsByDayOfWeek,
  analyzeZapperLoyalty,
  analyzeContentPerformance,
  analyzeHashtagPerformance
} from '@/lib/zaplytics/utils';

/**
 * Configuration for zap fetching - optimized for progressive loading
 */
const ZAP_FETCH_CONFIG = {
  INITIAL_BATCH_SIZE: 1000, // Start with larger batches to detect relay limits
  MIN_BATCH_SIZE: 250, // Minimum batch size when relay limits are hit
  MAX_BATCH_SIZE: 2000, // Maximum batch size to prevent timeouts
  TIMEOUT_MS: 8000, // Reduced from 15s for better responsiveness
  STALE_TIME: 60000, // 1 minute cache
  REFETCH_INTERVAL: 300000, // Refetch every 5 minutes
  BATCH_DELAY_MS: 300, // Delay between automatic batches (increased for rate limiting)
  AUTO_LOAD_DELAY_MS: 1000, // Delay before starting automatic loading
  MAX_CONSECUTIVE_FAILURES: 3, // Stop auto-loading after 3 consecutive failures
} as const;

/**
 * Global cache for zap receipts per user
 */
const userZapCache = new Map<string, ZapReceipt[]>();

/**
 * Global cache for user profiles
 */
const profileCache = new Map<string, Record<string, unknown>>();

/**
 * Progressive zap loading state
 */
interface ZapLoadingState {
  receipts: ZapReceipt[];
  isLoading: boolean;
  isComplete: boolean;
  currentBatch: number;
  totalFetched: number;
  relayLimit: number | null; // Detected relay limit
  error: string | null;
  autoLoadEnabled: boolean; // Whether automatic loading is enabled
  consecutiveFailures: number; // Track failures to stop auto-loading
  consecutiveZeroResults: number; // Track consecutive zero-result batches to stop infinite loops
  allReceiptsCache: ZapReceipt[]; // All receipts ever loaded for this user
}

/**
 * Custom hook for progressive zap receipt loading with smart caching
 */
function useProgressiveZapReceipts(timeRange: TimeRange = '7d', customRange?: CustomDateRange, targetPubkey?: string) {
  const { nostr } = useNostr();
  const { user: currentUser } = useCurrentUser();
  const pubkey = targetPubkey || currentUser?.pubkey;

  const [state, setState] = useState<ZapLoadingState>({
    receipts: [],
    isLoading: false,
    isComplete: false,
    currentBatch: 0,
    totalFetched: 0,
    relayLimit: null,
    error: null,
    autoLoadEnabled: true,
    consecutiveFailures: 0,
    consecutiveZeroResults: 0,
    allReceiptsCache: [],
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isLoadingRef = useRef(false);
  const autoLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef(state);

  // Keep state ref updated
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize from cache and filter by time range
  useEffect(() => {
    if (!pubkey) return;

    const userCache = userZapCache.get(pubkey) || [];
    const { since, until } = getDateRange(timeRange, customRange);

    // Filter cached receipts by time range - check for custom ranges specifically
    const isCustomRange = timeRange === 'custom';
    const filteredReceipts = userCache.filter(receipt => {
      if (isCustomRange && until) {
        // For custom ranges, filter both ends
        return receipt.created_at >= since && receipt.created_at <= until;
      } else {
        // For preset ranges, filter only since
        return receipt.created_at >= since;
      }
    });

    // Check if we have complete coverage for this time range
    const oldestCachedTimestamp = userCache.length > 0
      ? Math.min(...userCache.map(r => r.created_at))
      : 0;

    // For preset ranges, we need to be more strict about completeness
    // Only consider it complete if we actually have data going back to the time range boundary
    let hasCompleteCoverage: boolean;
    let needsMoreData: boolean;

    if (isCustomRange && until) {
      // For custom ranges, we have complete coverage if our oldest cached data 
      // is older than or equal to the custom range start (cache covers the time period)
      const cacheCoversCustomRange = userCache.length > 0 && oldestCachedTimestamp <= since;
      hasCompleteCoverage = cacheCoversCustomRange;
      needsMoreData = !cacheCoversCustomRange;
    } else {
      // For preset ranges, only consider complete if we have data AND it goes back far enough
      // This fixes the issue where 30d data was considered "complete" for 90d
      hasCompleteCoverage = userCache.length > 0 && oldestCachedTimestamp <= since;
      needsMoreData = userCache.length === 0 || oldestCachedTimestamp > since;
    }

    console.log(`Time range changed to ${timeRange} for ${pubkey}:`, {
      totalCached: userCache.length,
      filteredForTimeRange: filteredReceipts.length,
      oldestCached: userCache.length > 0 ? new Date(Math.min(...userCache.map(r => r.created_at)) * 1000).toISOString() : 'none',
      timeRangeSince: new Date(since * 1000).toISOString(),
      timeRangeUntil: until ? new Date(until * 1000).toISOString() : 'none',
      hasCompleteCoverage,
      needsMoreData,
      isCustomRange
    });

    setState(prev => ({
      ...prev,
      receipts: filteredReceipts,
      allReceiptsCache: userCache,
      totalFetched: filteredReceipts.length,
      isComplete: hasCompleteCoverage,
      // CRITICAL FIX: Don't reset currentBatch when switching time ranges
      // This preserves the pagination state and prevents false completion detection
      error: null,
    }));
  }, [pubkey, timeRange, customRange]);

  // Reset state when user changes (but not time range)
  useEffect(() => {
    abortControllerRef.current?.abort();
    if (autoLoadTimeoutRef.current) {
      clearTimeout(autoLoadTimeoutRef.current);
    }
    isLoadingRef.current = false;

    // Only reset when user changes, not time range
    setState({
      receipts: [],
      isLoading: false,
      isComplete: false,
      currentBatch: 0,
      totalFetched: 0,
      relayLimit: null,
      error: null,
      autoLoadEnabled: true,
      consecutiveFailures: 0,
      consecutiveZeroResults: 0,
      allReceiptsCache: [],
    });
  }, [pubkey]);

  // Progressive loading function
  const loadMoreZaps = useCallback(async (isAutomatic = false) => {
    // Get the current state fresh to avoid closure issues
    const currentState = stateRef.current;

    if (!pubkey || isLoadingRef.current || currentState.isComplete) {
      console.log('Skipping loadMoreZaps:', {
        noPubkey: !pubkey,
        isLoading: isLoadingRef.current,
        isComplete: currentState.isComplete
      });
      return;
    }

    // Stop automatic loading if disabled, too many failures, or too many consecutive zero results
    const maxConsecutiveZeroResults = 3; // Stop after 3 consecutive zero-result batches
    if (isAutomatic && (
      !currentState.autoLoadEnabled ||
      currentState.consecutiveFailures >= ZAP_FETCH_CONFIG.MAX_CONSECUTIVE_FAILURES ||
      currentState.consecutiveZeroResults >= maxConsecutiveZeroResults
    )) {
      console.log('Skipping automatic load:', {
        autoLoadEnabled: currentState.autoLoadEnabled,
        consecutiveFailures: currentState.consecutiveFailures,
        consecutiveZeroResults: currentState.consecutiveZeroResults,
        maxConsecutiveZeroResults
      });
      return;
    }

    console.log('Starting loadMoreZaps:', {
      isAutomatic,
      receiptsCount: currentState.receipts.length,
      currentBatch: currentState.currentBatch,
      isComplete: currentState.isComplete
    });

    isLoadingRef.current = true;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    // Cancel any existing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const { since, until } = getDateRange(timeRange, customRange);

      // Calculate the correct until timestamp for pagination
      let currentUntil = until;
      if (currentState.allReceiptsCache.length > 0) {
        // Get the oldest timestamp from cached receipts and subtract 1 second for pagination
        const oldestTimestamp = Math.min(...currentState.allReceiptsCache.map(r => r.created_at));
        const paginationUntil = oldestTimestamp - 1;

        // For custom ranges, respect the custom range's until boundary
        if (timeRange === 'custom' && until) {
          currentUntil = Math.min(paginationUntil, until);
        } else {
          currentUntil = paginationUntil;
        }
        console.log('Using pagination cursor from cache:', oldestTimestamp, '-> until:', currentUntil, 'custom range until:', until);
      }

      // Determine batch size based on detected relay limit
      let batchSize = currentState.relayLimit || ZAP_FETCH_CONFIG.INITIAL_BATCH_SIZE;

      // Cap the batch size to prevent timeouts
      batchSize = Math.min(batchSize, ZAP_FETCH_CONFIG.MAX_BATCH_SIZE);

      // For automatic loading, use smaller batches to be more conservative with rate limits
      if (isAutomatic && currentState.currentBatch > 0) {
        batchSize = Math.min(batchSize, currentState.relayLimit || ZAP_FETCH_CONFIG.MIN_BATCH_SIZE);
      }

      const filter: {
        kinds: number[];
        '#p': string[];
        limit: number;
        since?: number;
        until?: number;
      } = {
        kinds: [9735],
        '#p': [pubkey],
        limit: batchSize,
      };

      if (currentUntil) {
        filter.until = currentUntil;
      }
      if (since > 0) {
        filter.since = since;
      }

      console.log(`Fetching batch ${currentState.currentBatch + 1} for ${pubkey} with limit ${batchSize} (${isAutomatic ? 'auto' : 'manual'}):`, filter);

      const batchSignal = AbortSignal.any([
        abortControllerRef.current.signal,
        AbortSignal.timeout(ZAP_FETCH_CONFIG.TIMEOUT_MS)
      ]);

      const events = await nostr.query([filter], { signal: batchSignal });

      // Filter and validate zap receipts
      const validReceipts = events.filter((event): event is ZapReceipt =>
        isValidZapReceipt(event as NostrEvent)
      ).sort((a, b) => b.created_at - a.created_at);

      console.log(`Batch ${currentState.currentBatch + 1} complete for ${pubkey}: ${validReceipts.length} receipts (${isAutomatic ? 'auto' : 'manual'})`);

      // Update state synchronously
      setState(prev => {
        // Update the complete cache with new receipts
        const allReceipts = [...prev.allReceiptsCache, ...validReceipts].sort((a, b) => b.created_at - a.created_at);

        // Update the global cache for this user
        if (pubkey) {
          userZapCache.set(pubkey, allReceipts);
        }

        // Filter for current time range
        const { since, until } = getDateRange(timeRange, customRange);
        const isCustomRange = timeRange === 'custom';
        const filteredReceipts = allReceipts.filter(receipt => {
          if (isCustomRange && until) {
            // For custom ranges, filter both ends
            return receipt.created_at >= since && receipt.created_at <= until;
          } else {
            // For preset ranges, filter only since
            return receipt.created_at >= since;
          }
        });

        // Detect relay limit based on batch results
        const detectedLimit = validReceipts.length < batchSize && validReceipts.length > 0
          ? Math.max(validReceipts.length, ZAP_FETCH_CONFIG.MIN_BATCH_SIZE)
          : prev.relayLimit;

        // Determine if loading is complete
        const expectedBatchSize = detectedLimit || batchSize;
        let isComplete = false;

        if (validReceipts.length === 0) {
          // If we got 0 results and we have a 'since' filter, there's nothing in this window
          isComplete = !!since;
        } else {
          // If we got results, but fewer than the limit, we've exhausted the relay's data for this window
          isComplete = validReceipts.length < expectedBatchSize;

          // Also check time boundary for safety with preset ranges
          if (!isComplete && timeRange !== 'custom') {
            const oldestNewReceipt = Math.min(...validReceipts.map(r => r.created_at));
            const BOUNDARY_TOLERANCE_SECONDS = 3600; // 1 hour tolerance
            if (oldestNewReceipt <= (since + BOUNDARY_TOLERANCE_SECONDS)) {
              isComplete = true;
            }
          }
        }

        console.log('Updating state:', {
          newReceiptsCount: validReceipts.length,
          totalReceiptsInCache: allReceipts.length,
          filteredForTimeRange: filteredReceipts.length,
          detectedLimit,
          expectedBatchSize,
          isComplete,
          nextBatch: prev.currentBatch + 1,
          isAutomatic
        });

        return {
          ...prev,
          receipts: filteredReceipts,
          allReceiptsCache: allReceipts,
          isLoading: false,
          isComplete,
          currentBatch: prev.currentBatch + 1,
          totalFetched: filteredReceipts.length,
          relayLimit: detectedLimit,
          consecutiveFailures: 0, // Reset failures on success
          consecutiveZeroResults: validReceipts.length === 0 ? prev.consecutiveZeroResults + 1 : 0, // Track zero results
        };
      });

      // Schedule next automatic batch if appropriate
      if (isAutomatic) {
        // If we're doing automatic loading and got a substantial amount of data, continue
        const shouldContinueAutoLoad = validReceipts.length > 0 &&
          (
            // Continue if we got a "full" batch (same as requested batch size)
            validReceipts.length >= batchSize * 0.9 ||
            // Or continue if we got at least a reasonable amount
            validReceipts.length >= 100
          );

        console.log('Auto-load decision:', {
          isAutomatic,
          validReceiptsLength: validReceipts.length,
          batchSize,
          shouldContinueAutoLoad,
          fullBatchThreshold: batchSize * 0.9,
          minReasonableAmount: 100
        });

        if (shouldContinueAutoLoad) {
          console.log('Scheduling next auto-load batch in', ZAP_FETCH_CONFIG.BATCH_DELAY_MS, 'ms');
          autoLoadTimeoutRef.current = setTimeout(() => {
            console.log('Auto-load timeout triggered, checking conditions...');

            // Check if we should still auto-load (conditions might have changed)
            if (isLoadingRef.current) {
              console.log('Already loading, skipping auto-load');
              return;
            }

            console.log('Calling loadMoreZaps(true) from timeout');
            // Call loadMoreZaps directly as an automatic load
            loadMoreZaps(true).catch((error) => {
              console.error('Auto-load failed:', error);
            });
          }, ZAP_FETCH_CONFIG.BATCH_DELAY_MS);
        } else {
          console.log('Auto-loading stopped:', {
            validReceiptsLength: validReceipts.length,
            batchSize,
            reason: validReceipts.length < 100 ? 'too few results' : 'other condition not met'
          });

          // Ensure isLoadingRef is set to false when auto-loading stops
          isLoadingRef.current = false;
        }
      }

    } catch (error) {
      console.warn('Zap batch failed:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: prev.consecutiveFailures + 1,
        // Disable auto-loading if we hit too many failures
        autoLoadEnabled: prev.consecutiveFailures + 1 < ZAP_FETCH_CONFIG.MAX_CONSECUTIVE_FAILURES,
      }));
    } finally {
      // Always ensure loading state is cleared
      isLoadingRef.current = false;
    }
  }, [nostr, pubkey, timeRange, customRange]);

  // Auto-start loading when switching to a time range that needs more data
  useEffect(() => {
    if (!pubkey) return;

    // Get fresh state to avoid closures
    const currentState = stateRef.current;
    const { since, until } = getDateRange(timeRange, customRange);
    const isCustomRange = timeRange === 'custom';

    // Calculate cache coverage fresh (don't rely on potentially stale state)
    const userCache = userZapCache.get(pubkey) || [];
    const oldestCachedTimestamp = userCache.length > 0
      ? Math.min(...userCache.map(r => r.created_at))
      : 0;

    // For custom ranges, check if we need to load data based on cache coverage
    if (isCustomRange) {
      const cacheCoversCustomRange = userCache.length > 0 && oldestCachedTimestamp <= since;
      if (cacheCoversCustomRange) {
        console.log('Cache covers custom time range, skipping auto-load');
        return;
      }
      console.log('Cache does not cover custom time range, checking if we should load');
    }

    // Calculate the correct data for the current time range
    let hasDataForTimeRange: boolean;
    let isCompleteForThisRange: boolean;

    if (isCustomRange) {
      // For custom ranges, calculate based on the filtered data within the custom range
      const filteredForCustomRange = userCache.filter(receipt =>
        receipt.created_at >= since && receipt.created_at <= (until || Date.now() / 1000)
      );
      hasDataForTimeRange = filteredForCustomRange.length > 0;
      // For custom ranges, we're complete if cache covers the range
      isCompleteForThisRange = userCache.length > 0 && oldestCachedTimestamp <= since;
    } else {
      // For preset ranges, use the existing logic
      hasDataForTimeRange = currentState.receipts.length > 0;
      isCompleteForThisRange = currentState.isComplete;
    }

    // Need to load more data if:
    // 1. No data for current time range, OR
    // 2. Have data but oldest cached data is newer than time range start
    const needsMoreData = !hasDataForTimeRange ||
      (hasDataForTimeRange && oldestCachedTimestamp > since);

    const shouldStartLoading = needsMoreData &&
      !currentState.isLoading &&
      !isCompleteForThisRange &&
      currentState.autoLoadEnabled;

    console.log('Auto-loading decision breakdown:', {
      needsMoreData,
      isLoading: currentState.isLoading,
      isCompleteForThisRange,
      autoLoadEnabled: currentState.autoLoadEnabled,
      finalDecision: shouldStartLoading
    });

    console.log('Auto-loading check for time range:', timeRange, {
      isCustomRange,
      hasDataForTimeRange,
      relevantOldestTimestamp: oldestCachedTimestamp > 0 ? new Date(oldestCachedTimestamp * 1000).toISOString() : 'none',
      timeRangeSince: new Date(since * 1000).toISOString(),
      timeRangeUntil: until ? new Date(until * 1000).toISOString() : 'none',
      needsMoreData,
      shouldStartLoading,
      receiptsLength: currentState.receipts.length,
      cacheLength: currentState.allReceiptsCache.length,
      isComplete: currentState.isComplete,
      isCompleteForThisRange,
      isLoading: currentState.isLoading,
      autoLoadEnabled: currentState.autoLoadEnabled,
      consecutiveFailures: currentState.consecutiveFailures
    });

    if (shouldStartLoading) {
      if (!hasDataForTimeRange) {
        console.log('Auto-starting initial zap loading for time range:', timeRange);
      } else {
        console.log('Auto-starting zap loading for extended time range:', timeRange);
      }

      // For custom ranges, trigger immediately to avoid cleanup race conditions
      if (isCustomRange) {
        console.log('Triggering immediate auto-load for custom range:', timeRange);
        // Use setTimeout with minimal delay to avoid blocking the UI
        setTimeout(() => {
          console.log('Immediate timeout firing for custom range:', timeRange);
          loadMoreZaps(true).catch(error => {
            console.error('Auto-load failed for custom range:', error);
          });
        }, 100);
      } else {
        // Use normal delay for preset ranges
        const delay = hasDataForTimeRange ? ZAP_FETCH_CONFIG.AUTO_LOAD_DELAY_MS * 2 : ZAP_FETCH_CONFIG.AUTO_LOAD_DELAY_MS;
        console.log(`Setting timeout for auto-load in ${delay}ms for ${timeRange}`);
        autoLoadTimeoutRef.current = setTimeout(() => {
          console.log('Timeout firing! Triggering auto-load for time range:', timeRange);
          try {
            loadMoreZaps(true);
          } catch (error) {
            console.error('Error in auto-load timeout:', error);
          }
        }, delay);
      }
    } else if (hasDataForTimeRange && !needsMoreData) {
      console.log('Already have complete data for time range:', timeRange);
    } else {
      console.log('Not starting auto-load. Conditions not met.');
    }

    // Cleanup timeout only if we're not setting a new one in this run
    return () => {
      if (autoLoadTimeoutRef.current && !isCustomRange) {
        console.log('Cleaning up timeout for', timeRange);
        clearTimeout(autoLoadTimeoutRef.current);
        autoLoadTimeoutRef.current = null;
      }
    };
  }, [pubkey, timeRange, customRange, loadMoreZaps]);

  // Additional effect to handle time range changes that need extended data
  useEffect(() => {
    if (!pubkey) return;

    // Get fresh state
    const currentState = stateRef.current;
    const { since } = getDateRange(timeRange, customRange);
    const isCustomRange = timeRange === 'custom';

    // For custom ranges, only load if cache doesn't cover the time range
    if (isCustomRange) {
      const oldestCachedTimestamp = currentState.allReceiptsCache.length > 0
        ? Math.min(...currentState.allReceiptsCache.map(r => r.created_at))
        : 0;

      const cacheCoversCustomRange = currentState.allReceiptsCache.length > 0 && oldestCachedTimestamp <= since;
      if (cacheCoversCustomRange) {
        console.log('Cache covers custom time range, skipping extended auto-load');
        return;
      }
    }

    const oldestCachedTimestamp = currentState.allReceiptsCache.length > 0
      ? Math.min(...currentState.allReceiptsCache.map(r => r.created_at))
      : 0;

    // CRITICAL FIX: Add tolerance check here too to prevent infinite loops
    const BOUNDARY_TOLERANCE_SECONDS = 14400; // 4 hours tolerance (increased from 3600)
    const withinBoundaryTolerance = oldestCachedTimestamp <= (since + BOUNDARY_TOLERANCE_SECONDS);

    // Specifically handle extending time ranges (when we have data but need older data)
    // ENHANCED: Also check consecutive zero results to prevent infinite loops
    const maxConsecutiveZeroResults = 3; // Stop after 3 consecutive zero-result batches
    const needsExtendedData = currentState.receipts.length > 0 &&
      oldestCachedTimestamp > since &&
      !withinBoundaryTolerance && // NEW: Don't trigger if within tolerance
      !currentState.isLoading &&
      !currentState.isComplete &&
      currentState.autoLoadEnabled &&
      currentState.consecutiveZeroResults < maxConsecutiveZeroResults; // NEW: Stop if too many zero results

    if (needsExtendedData) {
      console.log('Time range extension detected - scheduling auto-load for:', timeRange, {
        oldestCached: new Date(oldestCachedTimestamp * 1000).toISOString(),
        timeRangeSince: new Date(since * 1000).toISOString(),
        gapMinutes: Math.round((oldestCachedTimestamp - since) / 60),
        withinTolerance: withinBoundaryTolerance,
        consecutiveZeroResults: currentState.consecutiveZeroResults
      });
      autoLoadTimeoutRef.current = setTimeout(() => {
        console.log('Auto-loading triggered by time range extension:', timeRange);
        loadMoreZaps(true);
      }, ZAP_FETCH_CONFIG.AUTO_LOAD_DELAY_MS * 2);
    } else if (withinBoundaryTolerance) {
      console.log('Skipping extension auto-load - within boundary tolerance:', {
        oldestCached: new Date(oldestCachedTimestamp * 1000).toISOString(),
        timeRangeSince: new Date(since * 1000).toISOString(),
        gapMinutes: Math.round((oldestCachedTimestamp - since) / 60)
      });
    } else if (currentState.consecutiveZeroResults >= maxConsecutiveZeroResults) {
      console.log('Skipping extension auto-load - too many consecutive zero results:', {
        consecutiveZeroResults: currentState.consecutiveZeroResults,
        maxConsecutiveZeroResults
      });
    }

    return () => {
      if (autoLoadTimeoutRef.current) {
        clearTimeout(autoLoadTimeoutRef.current);
      }
    };
  }, [pubkey, timeRange, customRange, state.receipts.length, state.allReceiptsCache.length, state.isLoading, state.isComplete, state.autoLoadEnabled, state.consecutiveZeroResults, loadMoreZaps]);

  // Function to manually trigger loading (for load more button)
  const manualLoadMore = useCallback(() => {
    loadMoreZaps(false);
  }, [loadMoreZaps]);

  // Function to toggle automatic loading
  const toggleAutoLoad = useCallback(() => {
    setState(prev => ({ ...prev, autoLoadEnabled: !prev.autoLoadEnabled }));
  }, []);

  // Function to restart auto loading (reset failures and enable)
  const restartAutoLoad = useCallback(() => {
    setState(prev => ({
      ...prev,
      autoLoadEnabled: true,
      consecutiveFailures: 0,
      consecutiveZeroResults: 0 // Reset zero results counter too
    }));

    // If we're not loading and not complete, start loading
    const currentState = stateRef.current;
    if (!currentState.isLoading && !currentState.isComplete) {
      autoLoadTimeoutRef.current = setTimeout(() => {
        loadMoreZaps(true);
      }, ZAP_FETCH_CONFIG.AUTO_LOAD_DELAY_MS);
    }
  }, [loadMoreZaps]);

  return {
    ...state,
    loadMoreZaps: manualLoadMore,
    toggleAutoLoad,
    restartAutoLoad,
  };
}

/**
 * Global cache for content events
 */
const contentEventCache = new Map<string, NostrEvent>();

/**
 * Fetch content events that were zapped
 */
export function useZappedContent(zapReceipts: ZapReceipt[]) {
  const { nostr } = useNostr();

  const eventIds = zapReceipts
    .map(receipt => receipt.tags.find(tag => tag[0] === 'e')?.[1])
    .filter((id): id is string => !!id);

  return useQuery({
    queryKey: ['zapped-content', eventIds.sort()],
    queryFn: async (c) => {
      if (eventIds.length === 0) return new Map<string, NostrEvent>();

      // Start with cached events
      const eventMap = new Map<string, NostrEvent>();
      const uncachedEventIds: string[] = [];

      // Check which events we already have cached
      eventIds.forEach(eventId => {
        if (contentEventCache.has(eventId)) {
          eventMap.set(eventId, contentEventCache.get(eventId)!);
        } else {
          uncachedEventIds.push(eventId);
        }
      });

      console.log(`Content cache status: ${eventMap.size} cached, ${uncachedEventIds.length} need fetching out of ${eventIds.length} total`);

      if (uncachedEventIds.length === 0) {
        console.log('All content events found in cache, skipping network request');
        return eventMap;
      }

      console.log(`Starting content fetch for ${uncachedEventIds.length} uncached events`);

      const signal = AbortSignal.any([
        c.signal,
        AbortSignal.timeout(12000)]); // Reduced timeout for faster failure detection

      // Use larger chunks and parallel processing for much faster loading
      const chunkSize = 150; // Increased chunk size significantly
      const maxConcurrent = 3; // Limit concurrent requests to avoid overwhelming relay
      const chunks: string[][] = [];
      for (let i = 0; i < uncachedEventIds.length; i += chunkSize) {
        chunks.push(uncachedEventIds.slice(i, i + chunkSize));
      }

      console.log(`Fetching ${chunks.length} content chunks with max ${maxConcurrent} concurrent requests`);

      // Helper function to process a single chunk
      const processChunk = async (chunk: string[], chunkIndex: number): Promise<NostrEvent[]> => {
        try {
          console.log(`Fetching content chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} events)`);
          const events = await nostr.query([{ ids: chunk }], { signal });
          console.log(`Content chunk ${chunkIndex + 1} complete: ${events.length} events fetched`);
          return events;
        } catch (error) {
          console.warn(`Content chunk ${chunkIndex + 1} failed:`, error);
          return [];
        }
      };

      const allEvents: NostrEvent[] = [];

      // Process chunks in batches with limited concurrency
      for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, i + maxConcurrent);
        const batchPromises = batch.map((chunk, batchIndex) =>
          processChunk(chunk, i + batchIndex)
        );

        try {
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(events => allEvents.push(...events));

          // Very small delay between batches to be nice to the relay
          if (i + maxConcurrent < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          console.warn(`Content batch ${Math.floor(i / maxConcurrent) + 1} failed:`, error);
          // Continue with next batch
        }
      }

      // Update both local map and global cache
      allEvents.forEach(event => {
        eventMap.set(event.id, event);
        contentEventCache.set(event.id, event);
      });

      console.log(`Content fetch complete: ${allEvents.length} new events fetched, ${eventMap.size} total events available`);
      return eventMap;
    },
    enabled: eventIds.length > 0,
    staleTime: 1800000, // 30 minutes - content doesn't change often, especially old content
    retry: 1, // Add query retry
    retryDelay: 1000, // Reduced retry delay
  });
}

/**
 * Fetch author profiles for zappers and content creators
 */
export function useZapperProfiles(pubkeys: string[]) {
  const { nostr } = useNostr();

  const uniquePubkeys = Array.from(new Set(pubkeys));

  return useQuery({
    queryKey: ['zapper-profiles', uniquePubkeys.sort()],
    queryFn: async (c) => {
      if (uniquePubkeys.length === 0) return new Map<string, Record<string, unknown>>();

      // Start with cached profiles
      const profileMap = new Map<string, Record<string, unknown>>();
      const uncachedPubkeys: string[] = [];

      // Check which profiles we already have cached
      uniquePubkeys.forEach(pubkey => {
        if (profileCache.has(pubkey)) {
          profileMap.set(pubkey, profileCache.get(pubkey)!);
        } else {
          uncachedPubkeys.push(pubkey);
        }
      });

      console.log(`Profile cache status: ${profileMap.size} cached, ${uncachedPubkeys.length} need fetching out of ${uniquePubkeys.length} total`);

      if (uncachedPubkeys.length === 0) {
        console.log('All profiles found in cache, skipping network request');
        return profileMap;
      }

      console.log(`Starting profile fetch for ${uncachedPubkeys.length} uncached pubkeys`);

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(15000)]); // Reduced timeout for faster failure detection

      // Use larger chunks and parallel processing for much faster loading
      const chunkSize = 100; // Increased chunk size significantly
      const maxConcurrent = 3; // Limit concurrent requests to avoid overwhelming relay
      const chunks: string[][] = [];
      for (let i = 0; i < uncachedPubkeys.length; i += chunkSize) {
        chunks.push(uncachedPubkeys.slice(i, i + chunkSize));
      }

      console.log(`Fetching ${chunks.length} profile chunks with max ${maxConcurrent} concurrent requests`);

      // Process chunks with limited concurrency
      const allProfiles: NostrEvent[] = [];

      // Helper function to process a single chunk
      const processChunk = async (chunk: string[], chunkIndex: number): Promise<NostrEvent[]> => {
        try {
          console.log(`Fetching profile chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} pubkeys)`);
          const profiles = await nostr.query([{ kinds: [0], authors: chunk }], { signal });
          console.log(`Profile chunk ${chunkIndex + 1} complete: ${profiles.length} profiles fetched`);
          return profiles;
        } catch (error) {
          console.warn(`Failed to fetch profile chunk ${chunkIndex + 1}:`, error);
          return [];
        }
      };

      // Process chunks in batches with limited concurrency
      for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, i + maxConcurrent);
        const batchPromises = batch.map((chunk, batchIndex) =>
          processChunk(chunk, i + batchIndex)
        );

        try {
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(profiles => allProfiles.push(...profiles));

          // Small delay between batches to be nice to the relay, but much shorter
          if (i + maxConcurrent < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          console.warn(`Batch ${Math.floor(i / maxConcurrent) + 1} failed:`, error);
          // Continue with next batch
        }
      }

      // Process fetched profiles and update both local map and global cache
      allProfiles.forEach(profile => {
        try {
          const metadata = JSON.parse(profile.content);
          profileMap.set(profile.pubkey, metadata);
          profileCache.set(profile.pubkey, metadata); // Update global cache
        } catch (error) {
          console.warn('Failed to parse profile metadata:', error);
        }
      });

      console.log(`Profile fetch complete: ${allProfiles.length} new profiles fetched, ${profileMap.size} total profiles available`);
      return profileMap;
    },
    enabled: uniquePubkeys.length > 0,
    staleTime: 600000, // 10 minutes since profiles don't change often
  });
}

/**
 * Main hook that combines all zap data and provides analytics with progressive loading
 */
export function useZapAnalytics(timeRange: TimeRange = '7d', customRange?: CustomDateRange, targetPubkey?: string) {
  // Don't start loading data for custom range until both dates are selected
  const shouldQueryData = timeRange !== 'custom' || (customRange?.from && customRange?.to);

  const progressiveData = useProgressiveZapReceipts(
    shouldQueryData ? timeRange : '7d', // fallback to 7d when custom is incomplete
    shouldQueryData ? customRange : undefined,
    targetPubkey
  );

  const {
    data: contentMap = new Map(),
    isLoading: _contentLoading
  } = useZappedContent(progressiveData.receipts);

  // Get all unique pubkeys for profile fetching
  const zapperPubkeys = progressiveData.receipts
    .map(receipt => {
      // Try to get pubkey from zap request description first
      const desc = receipt.tags.find(tag => tag[0] === 'description')?.[1];
      if (desc) {
        try {
          const zapRequest = JSON.parse(desc);
          return zapRequest.pubkey;
        } catch {
          // Ignore parsing errors
        }
      }
      return receipt.pubkey;
    })
    .filter((pubkey): pubkey is string => !!pubkey);

  const contentAuthorPubkeys = Array.from(contentMap.values())
    .map(event => event.pubkey);

  const allPubkeys = [...zapperPubkeys, ...contentAuthorPubkeys];

  const {
    data: profileMap = new Map(),
    isLoading: _profilesLoading
  } = useZapperProfiles(allPubkeys);

  return useQuery({
    queryKey: ['zap-analytics', timeRange, customRange, progressiveData.totalFetched, progressiveData.isLoading, progressiveData.isComplete, contentMap.size, profileMap.size, shouldQueryData],
    queryFn: async (): Promise<AnalyticsData & {
      loadingState: {
        isLoading: boolean;
        isComplete: boolean;
        totalFetched: number;
        relayLimit: number | null;
        canLoadMore: boolean;
        loadMoreZaps: () => void;
        autoLoadEnabled: boolean;
        consecutiveFailures: number;
        toggleAutoLoad: () => void;
        restartAutoLoad: () => void;
      }
    }> => {
      // If custom range is incomplete, return empty analytics
      if (timeRange === 'custom' && (!customRange?.from || !customRange?.to)) {
        return {
          totalEarnings: 0,
          totalZaps: 0,
          uniqueZappers: 0,
          period: timeRange,
          earningsByPeriod: [],
          topContent: [],
          earningsByKind: [],
          topZappers: [],
          allZaps: [],
          temporalPatterns: {
            earningsByHour: [],
            earningsByDayOfWeek: [],
          },
          zapperLoyalty: {
            newZappers: 0,
            returningZappers: 0,
            regularSupporters: 0,
            averageLifetimeValue: 0,
            topLoyalZappers: [],
          },
          contentPerformance: [],
          hashtagPerformance: [],
          loadingState: {
            isLoading: false,
            isComplete: true,
            totalFetched: 0,
            relayLimit: null,
            canLoadMore: false,
            loadMoreZaps: progressiveData.loadMoreZaps,
            autoLoadEnabled: progressiveData.autoLoadEnabled,
            consecutiveFailures: progressiveData.consecutiveFailures,
            toggleAutoLoad: progressiveData.toggleAutoLoad,
            restartAutoLoad: progressiveData.restartAutoLoad,
          },
        };
      }

      // Parse all zap receipts
      const parsedZaps: ParsedZap[] = progressiveData.receipts
        .map(parseZapReceipt)
        .filter((zap): zap is ParsedZap => zap !== null);

      // Enrich with content and profile data
      parsedZaps.forEach(zap => {
        // Add content event details
        if (zap.zappedEvent && contentMap.has(zap.zappedEvent.id)) {
          const event = contentMap.get(zap.zappedEvent.id)!;
          zap.zappedEvent = {
            ...zap.zappedEvent,
            kind: event.kind,
            author: event.pubkey,
            content: event.content,
            created_at: event.created_at,
          };
        }

        // Add zapper profile data
        if (profileMap.has(zap.zapper.pubkey)) {
          const profile = profileMap.get(zap.zapper.pubkey);
          if (profile) {
            zap.zapper = {
              ...zap.zapper,
              name: (profile.name as string) || (profile.display_name as string),
              nip05: profile.nip05 as string,
              picture: profile.picture as string,
            };
          }
        }
      });

      // Calculate analytics
      const totalEarnings = parsedZaps.reduce((sum, zap) => sum + zap.amount, 0);
      const totalZaps = parsedZaps.length;

      // Calculate unique zappers count by getting all unique pubkeys
      const uniqueZapperPubkeys = new Set(parsedZaps.map(zap => zap.zapper.pubkey));
      const uniqueZappers = uniqueZapperPubkeys.size;

      const earningsByPeriod = groupZapsByPeriod(parsedZaps, timeRange, customRange);
      const topContent = groupZapsByContent(parsedZaps).slice(0, 5);
      const earningsByKind = groupZapsByKind(parsedZaps);
      const topZappers = getTopZappers(parsedZaps).slice(0, 5);

      // Calculate new analytics
      const temporalPatterns = {
        earningsByHour: groupZapsByHour(parsedZaps),
        earningsByDayOfWeek: groupZapsByDayOfWeek(parsedZaps),
      };

      const zapperLoyalty = analyzeZapperLoyalty(parsedZaps);
      const contentPerformance = analyzeContentPerformance(parsedZaps).slice(0, 10); // Top 10 performing content

      // Content creator analytics
      const hashtagPerformance = analyzeHashtagPerformance(parsedZaps);

      return {
        totalEarnings,
        totalZaps,
        uniqueZappers,
        period: timeRange,
        earningsByPeriod,
        topContent,
        earningsByKind,
        topZappers,
        allZaps: parsedZaps,
        temporalPatterns,
        zapperLoyalty,
        contentPerformance,
        hashtagPerformance,
        loadingState: {
          isLoading: progressiveData.isLoading || _contentLoading || _profilesLoading,
          isComplete: progressiveData.isComplete && !_contentLoading && !_profilesLoading,
          totalFetched: progressiveData.totalFetched,
          relayLimit: progressiveData.relayLimit,
          canLoadMore: !progressiveData.isComplete && !progressiveData.isLoading,
          loadMoreZaps: progressiveData.loadMoreZaps,
          autoLoadEnabled: progressiveData.autoLoadEnabled,
          consecutiveFailures: progressiveData.consecutiveFailures,
          toggleAutoLoad: progressiveData.toggleAutoLoad,
          restartAutoLoad: progressiveData.restartAutoLoad,
        },
      };
    },
    enabled: Boolean(shouldQueryData),
    staleTime: ZAP_FETCH_CONFIG.STALE_TIME,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}