import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Eye,
  Lock,
  Zap,
  MessageCircle,
  Calendar,
  FileText,
  FileCode,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminHelp() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <HelpCircle className="h-8 w-8 text-primary" />
          Admin Help & Access Control
        </h2>
        <p className="text-muted-foreground text-lg">
          Detailed guide on user permissions and content visibility based on roles defined in your community.
        </p>
      </div>

      {/* Role Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-purple-600" />
              Master User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Absolute ownership. Can manage roles, relays, and sensitive system settings.</p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              Primary Admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Trusted moderator. Content is published live immediately to the public site.</p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              Secondary Admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Contributor. Can create content, but it requires role promotion to appear publicly.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-500/20 bg-slate-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-slate-600" />
              Unassigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Registered user. Can access the admin panel but has no public publishing rights.</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Matrix Card */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto border rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Feature / Action</th>
                  <th className="px-4 py-3 text-center border-l">Master</th>
                  <th className="px-4 py-3 text-center border-l">Primary</th>
                  <th className="px-4 py-3 text-center border-l">Secondary</th>
                  <th className="px-4 py-3 text-center border-l">Unassigned</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* System Settings */}
                <tr>
                  <td className="px-4 py-4 flex items-center gap-2 font-medium">
                    <Lock className="h-4 w-4 text-orange-500" />
                    System & Site Settings
                  </td>
                  <td className="px-4 py-4 text-center border-l">
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Manage & Save</Badge>
                  </td>
                  <td className="px-4 py-4 text-center border-l" colSpan={3}>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-orange-600">
                        <Eye className="h-3.5 w-3.5" />
                        <span>View Only*</span>
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Content Categories */}
                {[
                  { name: 'Events', icon: Calendar, color: 'text-blue-500' },
                  { name: 'Blog Posts', icon: FileText, color: 'text-indigo-500' },
                  { name: 'Static Pages', icon: FileCode, color: 'text-cyan-500' },
                ].map((item) => (
                  <tr key={item.name}>
                    <td className="px-4 py-4 flex items-center gap-2 font-medium">
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                      {item.name}
                    </td>
                    <td className="px-4 py-4 text-center border-l">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                    </td>
                    <td className="px-4 py-4 text-center border-l">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                    </td>
                    <td className="px-4 py-4 text-center border-l group" colSpan={2}>
                      <div className="flex items-center justify-center gap-1.5 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 py-1 px-3 rounded-full mx-auto w-fit">
                        <Shield className="h-3.5 w-3.5" />
                        <span>Approval Required**</span>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Notes Feed */}
                <tr>
                  <td className="px-4 py-4 flex items-center gap-2 font-medium">
                    <MessageCircle className="h-4 w-4 text-pink-500" />
                    Notes (Kind 1 Feed)
                  </td>
                  <td className="px-4 py-4 text-center border-l text-xs">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                  </td>
                  <td className="px-4 py-4 text-center border-l text-xs" colSpan={3}>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-pink-600 bg-pink-50 dark:bg-pink-900/20 py-1 px-3 rounded-full mx-auto w-fit">
                      <Zap className="h-3.5 w-3.5" />
                      <span>Whitelist Only***</span>
                    </div>
                  </td>
                </tr>

                {/* Reset to Defaults */}
                <tr>
                  <td className="px-4 py-4 flex items-center gap-2 font-medium">
                    <Zap className="h-4 w-4 text-red-500" />
                    Reset to Defaults
                  </td>
                  <td className="px-4 py-4 text-center border-l">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                  </td>
                  <td className="px-4 py-4 text-center border-l">
                    <XCircle className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                  </td>
                  <td className="px-4 py-4 text-center border-l">
                    <XCircle className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                  </td>
                  <td className="px-4 py-4 text-center border-l">
                    <XCircle className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 space-y-4 text-sm text-muted-foreground border-t pt-6">
            <p>
              <span className="font-bold text-foreground">* View Only Access:</span> Non-master admins can only see Site and Admin settings if
              <span className="font-bold text-foreground italic px-1">"Read-Only Admin Access"</span> is enabled in
              <Link to="/admin/system-settings" className="text-primary hover:underline inline-flex items-center gap-1 ml-1">
                Admin Settings <ExternalLink className="h-3 w-3" />
              </Link>.
            </p>
            <p>
              <span className="font-bold text-foreground">** Approval Required:</span> Content from Secondary or Unassigned users is published to relays but
              remains hidden from the public site. To "approve" their content, a Master User or Primary Admin must promote the user to a
              <span className="text-green-600 font-bold px-1">Primary Admin</span> role.
            </p>
            <p>
              <span className="font-bold text-foreground">*** Whitelist Only:</span> The public site's Note Feed only displays Kind 1 events from npubs specifically
              listed in the <span className="font-bold text-foreground italic px-1">"Feed npub List"</span> within Admin Settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer Note */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
        <p className="text-sm text-muted-foreground">
          Permissions are enforced both in the Admin UI (hidden buttons) and in the public site logic (content filtering).
        </p>
      </div>
    </div>
  );
}
