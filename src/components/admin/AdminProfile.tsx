import { EditProfileForm } from '@/components/EditProfileForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WalletModal } from '@/components/WalletModal';
import { Button } from '@/components/ui/button';
import { Wallet, User, Zap } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { Badge } from '@/components/ui/badge';

export default function AdminProfile() {
  const { hasNWC, activeNWC } = useWallet();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">User Profile</h2>
        <p className="text-muted-foreground">
          Manage your Nostr profile and wallet connections.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Settings
            </CardTitle>
            <CardDescription>
              Update your public Nostr metadata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditProfileForm />
          </CardContent>
        </Card>

        {/* Wallet Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Lightning Wallet
              </CardTitle>
              <CardDescription>
                Connect your wallet via NWC to enable automated zaps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="space-y-1">
                  <p className="text-sm font-medium">NWC Status</p>
                  <div className="flex items-center gap-2">
                    {hasNWC ? (
                      <Badge variant="default" className="bg-green-600">
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        Disconnected
                      </Badge>
                    )}
                    {activeNWC && (
                      <span className="text-xs text-muted-foreground">
                        Active: {activeNWC.alias || 'NWC Wallet'}
                      </span>
                    )}
                  </div>
                </div>
                <WalletModal>
                  <Button variant="outline" size="sm">
                    {hasNWC ? 'Manage Wallet' : 'Connect Wallet'}
                  </Button>
                </WalletModal>
              </div>

              <div className="p-4 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Automated Zaps
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                      When NWC is connected, zaps are sent automatically without requiring manual confirmation for each payment.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
