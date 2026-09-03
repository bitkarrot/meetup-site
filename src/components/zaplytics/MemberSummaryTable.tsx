import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import type { MemberStats } from '@/hooks/useCommunityZapStats';
import { formatSats } from '@/lib/zaplytics/utils';

interface MemberSummaryTableProps {
  members: MemberStats[];
  isLoading: boolean;
  onSelectMember?: (pubkey: string) => void;
}

function MemberRow({ member, onSelectMember }: { member: MemberStats; onSelectMember?: (pubkey: string) => void }) {
  const { data } = useAuthor(member.pubkey);
  const metadata = data?.metadata;
  const avgPerZap = member.totalZaps > 0 ? Math.round(member.totalEarnings / member.totalZaps) : 0;
  const name = metadata?.name || metadata?.display_name || member.name;

  return (
    <tr
      className={`border-b transition-colors hover:bg-muted/50 ${onSelectMember ? 'cursor-pointer' : ''}`}
      onClick={() => onSelectMember?.(member.pubkey)}
    >
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={metadata?.picture} alt={name} />
            <AvatarFallback className="text-xs">
              {name?.charAt(0)?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate max-w-[120px]">{name}</span>
        </div>
      </td>
      <td className="py-2 px-3 text-right text-sm tabular-nums font-medium text-primary">
        {formatSats(member.totalEarnings)}
      </td>
      <td className="py-2 px-3 text-right text-sm tabular-nums text-muted-foreground">
        {member.totalZaps.toLocaleString()}
      </td>
      <td className="py-2 px-3 text-right text-sm tabular-nums text-muted-foreground">
        {member.uniqueZappers.toLocaleString()}
      </td>
      <td className="py-2 px-3 text-right text-sm tabular-nums text-muted-foreground">
        {formatSats(avgPerZap)}
      </td>
    </tr>
  );
}

export function MemberSummaryTable({ members, isLoading, onSelectMember }: MemberSummaryTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-[120px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!members || members.length === 0) {
    return null;
  }

  const sorted = [...members].sort((a, b) => b.totalEarnings - a.totalEarnings);

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Member</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Total Sats</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Zaps</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Supporters</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Avg/Zap</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(member => (
              <MemberRow
                key={member.pubkey}
                member={member}
                onSelectMember={onSelectMember}
              />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
