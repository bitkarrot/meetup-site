import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { AppContext, type AppContextType, type AppConfig } from '@/contexts/AppContext';
import { useAppContext } from '@/hooks/useAppContext';
import Index from '@/pages/Index';
import { type SiteConfig, type NavigationItem } from './types';

interface HomepagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteConfig: SiteConfig;
  navigation: NavigationItem[];
}

/**
 * Renders the live homepage inside a full-screen dialog with the unsaved
 * siteConfig and navigation applied. This lets the user see exactly what
 * their changes will look like before saving.
 *
 * Works by wrapping <Index /> in an AppContext.Provider that overrides the
 * config with the in-progress values. All homepage components (Hero, Events,
 * Blog, Feed, Navigation, Page sections) read from useAppContext(), so they
 * automatically pick up the preview config.
 *
 * Data fetching (events, blog posts, feed notes) uses React Query's cache —
 * if the user recently visited the homepage, data is instant. Otherwise it
 * fetches from the relay with a brief loading state.
 */
export function HomepagePreviewDialog({
  open,
  onOpenChange,
  siteConfig,
  navigation,
}: HomepagePreviewDialogProps) {
  const { config } = useAppContext();

  // Build a preview AppConfig that merges the unsaved state into the live config
  const previewContextValue = useMemo<AppContextType>(() => {
    const previewConfig: AppConfig = {
      ...config,
      siteConfig: { ...siteConfig },
      navigation: [...navigation],
    };
    return {
      config: previewConfig,
      // No-op updater — preview is read-only
      updateConfig: () => {},
    };
  }, [config, siteConfig, navigation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-full h-[100dvh] max-h-[100dvh] top-0 left-0 right-0 bottom-0 translate-x-0 translate-y-0 p-0 rounded-none border-0 flex flex-col overflow-hidden" hideCloseButton>
        <DialogTitle className="sr-only">Homepage Preview</DialogTitle>
        {/* Preview header bar with explicit close button */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background/95 backdrop-blur z-10" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Preview — unsaved changes
          </span>
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="h-9 px-4" title="Close preview">
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </DialogClose>
        </div>
        {/* Preview content — the actual homepage rendering */}
        <div className="flex-1 overflow-y-auto">
          <AppContext.Provider value={previewContextValue}>
            <Index preview />
          </AppContext.Provider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
