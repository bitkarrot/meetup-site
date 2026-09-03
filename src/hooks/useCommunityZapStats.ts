import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getApiBaseUrl } from '@/lib/relay';
import type {
  AnalyticsData,
  EarningsByPeriod,
  EarningsByContent,
  EarningsByKind,
  ZapperStats,
  EarningsByHour,
  EarningsByDayOfWeek,
  LoyaltyStats,
  ZapperLoyalty,
} from '@/types/zaplytics';

// ---------------------------------------------------------------------------
// Server response types — mirror the Go structs in zap_stats.go
// ---------------------------------------------------------------------------

interface ServerEarningsByPeriod {
  period: string;
  totalSats: number;
  zapCount: number;
  date: string;
}

interface ServerEarningsByContent {
  eventId: string;
  eventKind: number;
  content: string;
  author: string;
  totalSats: number;
  zapCount: number;
  created_at: number;
}

interface ServerEarningsByKind {
  kind: number;
  kindName: string;
  totalSats: number;
  zapCount: number;
  percentage: number;
}

interface ServerZapperStats {
  pubkey: string;
  name?: string;
  picture?: string;
  totalSats: number;
  zapCount: number;
}

interface ServerEarningsByHour {
  hour: number;
  totalSats: number;
  zapCount: number;
  avgZapAmount: number;
}

interface ServerEarningsByDayOfWeek {
  dayOfWeek: number;
  dayName: string;
  totalSats: number;
  zapCount: number;
  avgZapAmount: number;
}

interface ServerLoyaltyStats {
  newZappers: number;
  returningZappers: number;
  regularSupporters: number;
  averageLifetimeValue: number;
  topLoyalZappers: ServerZapperStats[];
}

interface ServerAggregateStats {
  totalEarnings: number;
  totalZaps: number;
  uniqueZappers: number;
  earningsByPeriod: ServerEarningsByPeriod[];
  topContent: ServerEarningsByContent[];
  earningsByKind: ServerEarningsByKind[];
  topZappers: ServerZapperStats[];
  temporalPatterns: {
    earningsByHour: ServerEarningsByHour[];
    earningsByDayOfWeek: ServerEarningsByDayOfWeek[];
  };
  zapperLoyalty: ServerLoyaltyStats;
}

export interface MemberStats {
  pubkey: string;
  name: string;
  totalEarnings: number;
  totalZaps: number;
  uniqueZappers: number;
  topContentSats: number;
  topContentPreview: string;
  earningsByPeriod?: EarningsByPeriod[];
  topZappers?: ZapperStats[];
}

interface ServerMemberStats {
  pubkey: string;
  name: string;
  totalEarnings: number;
  totalZaps: number;
  uniqueZappers: number;
  topContentSats: number;
  topContentPreview: string;
  earningsByPeriod?: ServerEarningsByPeriod[];
  topZappers?: ServerZapperStats[];
}

interface ZapStatsSnapshot {
  lastUpdated: number;
  range: string;
  aggregate: ServerAggregateStats;
  members: ServerMemberStats[];
}

// ---------------------------------------------------------------------------
// Mapping: server response → frontend AnalyticsData
// ---------------------------------------------------------------------------

function deriveCategory(zapCount: number, totalSats: number): ZapperLoyalty['category'] {
  if (zapCount === 1) return 'one-time';
  if (totalSats >= 10000) return 'whale';
  if (zapCount >= 5) return 'regular';
  return 'occasional';
}

function mapToAnalyticsData(agg: ServerAggregateStats): AnalyticsData {
  const earningsByPeriod: EarningsByPeriod[] = agg.earningsByPeriod.map(p => ({
    period: p.period,
    totalSats: p.totalSats,
    zapCount: p.zapCount,
    date: new Date(p.date),
  }));

  const topContent: EarningsByContent[] = agg.topContent.map(c => ({
    eventId: c.eventId,
    eventKind: c.eventKind,
    content: c.content,
    author: c.author,
    totalSats: c.totalSats,
    zapCount: c.zapCount,
    created_at: c.created_at,
  }));

  const earningsByKind: EarningsByKind[] = agg.earningsByKind;

  const topZappers: ZapperStats[] = agg.topZappers.map(z => ({
    pubkey: z.pubkey,
    name: z.name,
    picture: z.picture,
    totalSats: z.totalSats,
    zapCount: z.zapCount,
  }));

  const earningsByHour: EarningsByHour[] = agg.temporalPatterns.earningsByHour;
  const earningsByDayOfWeek: EarningsByDayOfWeek[] = agg.temporalPatterns.earningsByDayOfWeek;

  // Map topLoyalZappers (basic stats) to full ZapperLoyalty objects with
  // derived categories. Name and picture come from the server (kind 0 profiles).
  // Fields not available from the server (firstZapDate, lastZapDate,
  // averageDaysBetweenZaps) get safe defaults.
  const topLoyalZappers: ZapperLoyalty[] = agg.zapperLoyalty.topLoyalZappers.map(z => ({
    pubkey: z.pubkey,
    name: z.name,
    picture: z.picture,
    zapCount: z.zapCount,
    totalSats: z.totalSats,
    category: deriveCategory(z.zapCount, z.totalSats),
    isRegular: z.zapCount >= 5,
    firstZapDate: new Date(0),
    lastZapDate: new Date(0),
    daysBetweenFirstAndLast: 0,
    averageDaysBetweenZaps: 0,
  }));

  const zapperLoyalty: LoyaltyStats = {
    newZappers: agg.zapperLoyalty.newZappers,
    returningZappers: agg.zapperLoyalty.returningZappers,
    regularSupporters: agg.zapperLoyalty.regularSupporters,
    averageLifetimeValue: agg.zapperLoyalty.averageLifetimeValue,
    topLoyalZappers,
  };

  return {
    totalEarnings: agg.totalEarnings,
    totalZaps: agg.totalZaps,
    uniqueZappers: agg.uniqueZappers,
    period: 'community',
    earningsByPeriod,
    topContent,
    earningsByKind,
    topZappers,
    allZaps: [], // server-side aggregate doesn't expose individual zaps
    temporalPatterns: {
      earningsByHour,
      earningsByDayOfWeek,
    },
    zapperLoyalty,
    contentPerformance: [], // not computed server-side for v1
    hashtagPerformance: [], // not computed server-side for v1
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface CommunityZapStats {
  aggregate: AnalyticsData;
  members: MemberStats[];
  lastUpdated: number;
}

export type CommunityTimeRange = '24h' | '7d' | '30d' | 'all';

export function useCommunityZapStats(timeRange: CommunityTimeRange = 'all') {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['community-zap-stats', user?.pubkey, timeRange],
    queryFn: async (): Promise<CommunityZapStats> => {
      const apiBase = getApiBaseUrl();

      // Ensure we have a dashboard session cookie by logging in first.
      // Same pattern as MyActivityCard — the /login endpoint accepts any
      // pubkey listed in nostr.json.
      const loginResponse = await fetch(`${apiBase}/dashboard/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey: user!.pubkey.toLowerCase().trim() }),
      });
      if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.status}`);
      }

      const res = await fetch(`${apiBase}/dashboard/zap-stats?range=${timeRange}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 503) {
          throw new Error('Computing community zap stats — please try again in a moment.');
        }
        throw new Error(`Failed to fetch zap stats: ${res.status}`);
      }

      const snapshot: ZapStatsSnapshot = await res.json();
      return {
        aggregate: mapToAnalyticsData(snapshot.aggregate),
        members: snapshot.members.map(m => ({
          pubkey: m.pubkey,
          name: m.name,
          totalEarnings: m.totalEarnings,
          totalZaps: m.totalZaps,
          uniqueZappers: m.uniqueZappers,
          topContentSats: m.topContentSats,
          topContentPreview: m.topContentPreview,
          earningsByPeriod: m.earningsByPeriod?.map(p => ({
            period: p.period,
            totalSats: p.totalSats,
            zapCount: p.zapCount,
            date: new Date(p.date),
          })),
          topZappers: m.topZappers?.map(z => ({
            pubkey: z.pubkey,
            name: z.name,
            picture: z.picture,
            totalSats: z.totalSats,
            zapCount: z.zapCount,
          })),
        })),
        lastUpdated: snapshot.lastUpdated,
      };
    },
    enabled: !!user?.pubkey,
    staleTime: 60 * 1000, // 1 minute — the background job refreshes every 10 min
    retry: 1,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['community-zap-stats'] });
  }, [queryClient]);

  return { data, isLoading, error, refetch: refresh };
}
