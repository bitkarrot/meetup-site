// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from '@unhead/addons';
import { Suspense } from 'react';
import NostrProvider from '@/components/NostrProvider';
import { NostrSync } from '@/components/NostrSync';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NostrLoginProvider } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import { NWCProvider } from '@/contexts/NWCContext';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import { AppConfig } from '@/contexts/AppContext';
import AppRouter from './AppRouter';

const head = createHead({
  plugins: [
    InferSeoMetaPlugin(),
  ],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 0, // No caching
      gcTime: 0, // Clear cache immediately
      retry: false, // Don't retry failed requests
    },
  },
});

const defaultConfig: AppConfig = {
  theme: "light",
  relayMetadata: {
    relays: [
      { url: import.meta.env.VITE_DEFAULT_RELAY, read: true, write: true },
      { url: import.meta.env.VITE_READ_RELAY_1, read: true, write: true },
      { url: import.meta.env.VITE_READ_RELAY_2, read: true, write: true },
      { url: import.meta.env.VITE_READ_RELAY_3, read: true, write: true },
    ],
    updatedAt: 0,
  },
};

export function App() {
  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <NostrProvider>
              <NostrSync />
              <NWCProvider>
                <TooltipProvider>
                  <Toaster />
                  <Suspense>
                    <AdminAuthProvider>
                      <AppRouter />
                    </AdminAuthProvider>
                  </Suspense>
                </TooltipProvider>
              </NWCProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
