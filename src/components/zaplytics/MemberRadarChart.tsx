import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  Tooltip,
} from 'recharts';
import type { MemberStats } from '@/hooks/useCommunityZapStats';
import type { EarningsByPeriod } from '@/types/zaplytics';

interface MemberRadarChartProps {
  members: MemberStats[];
  isLoading: boolean;
  aggregatePeriods?: EarningsByPeriod[];
}

// Distinct colors for member radars
const MEMBER_COLORS = [
  'hsl(222, 47%, 11%)',
  'hsl(142, 71%, 45%)',
  'hsl(25, 95%, 53%)',
  'hsl(280, 65%, 60%)',
  'hsl(0, 84%, 60%)',
  'hsl(199, 89%, 48%)',
  'hsl(43, 96%, 56%)',
  'hsl(173, 80%, 40%)',
];

// Dimensions for the radar chart — chosen for community comparison value
const DIMENSIONS = [
  { key: 'totalEarnings', label: 'Earnings' },
  { key: 'totalZaps', label: 'Zap Count' },
  { key: 'uniqueZappers', label: 'Supporter Base' },
  { key: 'supporterDiversity', label: 'Diversity' },     // unique zappers / total zaps (breadth of support)
  { key: 'consistency', label: 'Consistency' },           // days with zaps / total days in range
] as const;

interface RadarTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: Record<string, number | string>;
    name: string;
    value: number;
    color: string;
  }>;
}

export function MemberRadarChart({ members, isLoading, aggregatePeriods }: MemberRadarChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Member Activity Radar</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const membersWithZaps = members.filter(m => m.totalZaps > 0);

  if (membersWithZaps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Member Activity Radar</CardTitle>
        </CardHeader>
        <CardContent className="h-[400px] flex items-center justify-center">
          <p className="text-muted-foreground">No member data available</p>
        </CardContent>
      </Card>
    );
  }

  // Compute derived metrics per member
  // - supporterDiversity: unique zappers / total zaps (0-1, higher = broader support base)
  // - consistency: days with zaps / total days in the data range (0-1, higher = more regular)
  const allDates = aggregatePeriods && aggregatePeriods.length > 0 ? aggregatePeriods.map(p => p.period) : [];
  const totalDaysInRange = allDates.length > 0 ? allDates.length : 1;

  const memberData = membersWithZaps.map(m => ({
    ...m,
    supporterDiversity: m.totalZaps > 0 ? m.uniqueZappers / m.totalZaps : 0,
    consistency: m.earningsByPeriod && m.earningsByPeriod.length > 0
      ? m.earningsByPeriod.length / totalDaysInRange
      : 0,
  }));

  // Find max for each dimension to normalize (0-100 scale)
  const maxValues: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    maxValues[dim.key] = Math.max(...memberData.map(m => (m as unknown as Record<string, number>)[dim.key] || 0));
  }

  // Build chart data: one entry per dimension, with each member's normalized value
  const chartData = DIMENSIONS.map(dim => {
    const entry: Record<string, number | string> = { dimension: dim.label };
    for (const member of memberData) {
      const rawValue = (member as unknown as Record<string, number>)[dim.key] || 0;
      const normalized = maxValues[dim.key] > 0 ? Math.round((rawValue / maxValues[dim.key]) * 100) : 0;
      entry[member.name] = normalized;
    }
    return entry;
  });

  const CustomTooltip = ({ active, payload }: RadarTooltipProps) => {
    if (!active || !payload || !payload.length) return null;
    const dimension = payload[0].payload.dimension as string;
    return (
      <div className="bg-card border rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium mb-2">{dimension}</p>
        <div className="space-y-1">
          {payload
            .sort((a, b) => b.value - a.value)
            .map((entry, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span>{entry.name}</span>
                </div>
                <span className="font-medium tabular-nums">{entry.value}%</span>
              </div>
            ))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Member Activity Radar</CardTitle>
        <p className="text-sm text-muted-foreground">
          Comparing members across key dimensions (normalized to 100%)
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
              <PolarGrid className="stroke-muted" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fontSize: 12, fill: 'hsl(215.4 16.3% 46.9%)' }}
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'hsl(215.4 16.3% 46.9%)' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                iconType="circle"
              />
              {memberData.map((member, i) => (
                <Radar
                  key={member.pubkey}
                  name={member.name}
                  dataKey={member.name}
                  stroke={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                  fill={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
