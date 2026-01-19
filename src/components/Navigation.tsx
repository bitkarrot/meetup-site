import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { LoginArea } from '@/components/auth/LoginArea';
import { Settings, Menu, X, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

const defaultNavigation = [
  { id: 'home', name: 'Home', href: '/', isSubmenu: false },
  { id: 'events', name: 'Events', href: '/events', isSubmenu: false },
  { id: 'blog', name: 'Blog', href: '/blog', isSubmenu: false },
  { id: 'about', name: 'About', href: '/about', isSubmenu: false },
  { id: 'contact', name: 'Contact', href: '/contact', isSubmenu: false },
];

export default function Navigation() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const siteConfig = config.siteConfig;
  const configNavigation = Array.isArray(config.navigation) ? config.navigation : defaultNavigation;

  const isActivePath = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="bg-background border-b sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              {siteConfig?.logo ? (
                <img src={siteConfig.logo} alt="Logo" className="h-8 w-auto" />
              ) : (
                <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold">
                  {siteConfig?.title?.charAt(0) || 'M'}
                </div>
              )}
              {siteConfig?.title && (
                <span className="font-semibold text-lg hidden sm:block">{siteConfig.title}</span>
              )}
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {configNavigation.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActivePath(item.href) ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Right side items */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>

            <div className="hidden md:flex items-center space-x-4">
              {user && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin">
                    <Settings className="h-4 w-4" />
                    <span className="ml-2">Admin</span>
                  </Link>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                <span className="ml-2">Toggle Theme</span>
              </Button>

              <LoginArea />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <div className="space-y-3">
              {configNavigation.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    isActivePath(item.href) ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              {user && (
                <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Admin
                  </Link>
                </Button>
              )}
              <LoginArea className="flex" />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}