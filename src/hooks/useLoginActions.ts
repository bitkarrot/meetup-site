import { useNostr } from '@nostrify/react';
import { NLogin, useNostrLogin } from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const { nostr } = useNostr();
  const { logins, addLogin, removeLogin } = useNostrLogin();
  const queryClient = useQueryClient();

  return {
    // Login with a Nostr secret key
    nsec(nsec: string): void {
      // Clear any existing logins first to ensure a clean state
      for (const login of [...logins]) {
        removeLogin(login.id);
      }
      const login = NLogin.fromNsec(nsec);
      addLogin(login);
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(uri: string): Promise<void> {
      // Clear any existing logins first
      for (const login of [...logins]) {
        removeLogin(login.id);
      }
      const login = await NLogin.fromBunker(uri, nostr);
      addLogin(login);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      // Clear any existing logins first
      for (const login of [...logins]) {
        removeLogin(login.id);
      }
      const login = await NLogin.fromExtension();
      addLogin(login);
    },
    // Log out the current user and clear all sessions
    async logout(): Promise<void> {
      console.log('[Logout] Starting aggressive logout...');
      
      // 1. Clear TanStack Query cache first
      queryClient.clear();

      // 2. Remove all logged-in accounts from the provider
      for (const login of [...logins]) {
        removeLogin(login.id);
      }

      // 3. Explicitly clear the localStorage keys
      localStorage.removeItem('nostr:login');
      
      // 4. Also clear any session-specific storage that might be used by signers
      sessionStorage.clear();

      console.log('[Logout] Storage cleared, reloading page...');

      // 5. Small delay to ensure browser has processed the storage changes
      await new Promise(resolve => setTimeout(resolve, 200));

      // 6. Force page reload from server to ensure all providers restart with clean state
      window.location.href = window.location.origin + '/admin/login';
    }
  };
}
