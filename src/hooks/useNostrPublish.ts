import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";
import { withTimeout } from "@/lib/promiseTimeout";

import type { NostrEvent } from "@nostrify/nostrify";

const SIGN_TIMEOUT_MS = 60_000;
const PUBLISH_TIMEOUT_MS = 10_000;

export function useNostrPublish(): UseMutationResult<NostrEvent, Error, { event: { kind: number; content?: string; tags?: string[][]; created_at?: number }; relays?: string[] }> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ event: t, relays }) => {
      if (user) {
        const tags = t.tags ?? [];

        // Add the client tag if it doesn't exist
        if (location.protocol === "https:" && !tags.some(([name]) => name === "client")) {
          tags.push(["client", location.hostname]);
        }

        const signedEvent = await withTimeout(
          user.signer.signEvent({
            kind: t.kind,
            content: t.content ?? "",
            tags,
            created_at: t.created_at ?? Math.floor(Date.now() / 1000),
          }),
          SIGN_TIMEOUT_MS,
          'Signing timed out. Check that your signer (extension/bunker/nsec) is unlocked and authorized.',
        );

        // NIP-07 extensions can sign with whichever account is currently active,
        // which may differ from the CMS user we think is logged in. Catch that
        // before we publish an event under the wrong pubkey.
        if (signedEvent.pubkey !== user.pubkey) {
          throw new Error(
            `The signer returned a different public key than the logged-in user. ` +
            `Make sure your extension/bunker is switched to ${user.pubkey}, not ${signedEvent.pubkey}.`,
          );
        }

        if (relays && relays.length > 0) {
          // Publish to specific relays if provided
          const results = await Promise.allSettled(
            relays.map(url => {
              try {
                // Check if nostr is a pool-like object with a relay() method
                const pool = nostr as unknown as { relay: (url: string) => { event: (e: NostrEvent, options?: { signal?: AbortSignal }) => Promise<void> } };
                const r = typeof pool.relay === 'function' ? pool.relay(url) : (nostr as { event: (e: NostrEvent, options?: { signal?: AbortSignal }) => Promise<void> });
                return withTimeout(
                  r.event(signedEvent, { signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS) }),
                  PUBLISH_TIMEOUT_MS,
                  `Publish to ${url} timed out`,
                );
              } catch (e) {
                console.error(`Failed to publish to ${url}:`, e);
                return Promise.reject(e);
              }
            })
          );

          const anySuccess = results.some((r) => r.status === 'fulfilled');
          if (!anySuccess) {
            const errors = results
              .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
              .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
            throw new Error(errors.length > 0 ? errors.join('; ') : 'Failed to publish to all relays');
          }
        } else {
          // Default publish (to all pool relays)
          await withTimeout(
            (nostr as { event: (e: NostrEvent, options?: { signal?: AbortSignal }) => Promise<void> }).event(signedEvent, { signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS) }),
            PUBLISH_TIMEOUT_MS,
            'Publish timed out. No relay confirmed the event.',
          );
        }

        return signedEvent;
      } else {
        throw new Error("User is not logged in");
      }
    },
    onError: (error) => {
      console.error("Failed to publish event:", error);
    },
    onSuccess: (data) => {
      console.log("Event published successfully:", data);
    },
  });
}