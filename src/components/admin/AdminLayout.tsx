import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/hooks/useTheme';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  LayoutDashboard,
  FileText,
  FileCode,
  Calendar,
  Settings,
  Home,
  Menu,
  X,
  Sun,
  Moon,
  Shield,
  Rss,
  Zap,
  FileImage,
  MessageCircle
} from 'lucide-react';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { user } = useCurrentUser();

  const masterPubkey = (import.meta.env.VITE_MASTER_PUBKEY || '').toLowerCase().trim();
  const isMasterUser = user?.pubkey.toLowerCase().trim() === masterPubkey;

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Notes', href: '/admin/notes', icon: MessageCircle },
    { name: 'Blog Posts', href: '/admin/blog', icon: FileText },
    { name: 'Events', href: '/admin/events', icon: Calendar },
    { name: 'Feed', href: '/admin/feed', icon: Rss },
    { name: 'Zaplytics', href: '/admin/zaplytics', icon: Zap },
    { name: 'Media', href: '/admin/media', icon: FileImage },
    { name: 'Pages', href: '/admin/pages', icon: FileCode },
    ...(isMasterUser ? [
      { name: 'Site Settings', href: '/admin/settings', icon: Settings },
      { name: 'Admin Settings', href: '/admin/system-settings', icon: Shield }
    ] : []),
    { name: 'View Site', href: '/', icon: Home },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar */}
      <div className={cn(
        "fixed inset-0 z-50 lg:hidden",
        sidebarOpen ? "block" : "hidden"
      )}>
        <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
        <div className="fixed left-0 top-0 h-full w-64 bg-card border-r">
          <div className="flex items-center justify-between p-6">
            <h2 className="text-lg font-semibold">Admin Panel</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <nav className="px-4 space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:overflow-y-auto lg:bg-card lg:border-r">
        <div className="flex h-16 shrink-0 items-center px-6">
          <h2 className="text-lg font-semibold">Admin Panel</h2>
        </div>
        <nav className="mt-6 px-4 space-y-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-card px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1 items-center">
              <h1 className="text-lg font-semibold">
                {navigation.find(item => item.href === location.pathname)?.name || 'Admin'}
              </h1>
            </div>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle Theme"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="h-5 w-5 mr-3" />
                    {/* <span className="ml-2">Light</span> */}
                  </>
                ) : (<>
                  <Moon className="h-5 w-5 mr-3" />
                  {/* <span className="ml-2">Dark</span> */}
                </>)}


              </Button>
              <Separator orientation="vertical" className="h-6" />
              <LoginArea />
            </div>
          </div>
        </div>

        <main className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}