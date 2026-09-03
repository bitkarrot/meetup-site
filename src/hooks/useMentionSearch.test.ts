import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { looksLikeBech32Entity, lookupBech32Entity } from './useMentionSearch';
import type { NostrEvent, NRelay } from '@nostrify/nostrify';

const PUBKEY = '79dff8f82963424e0bb02708a22e44b4980893e3a4be0fa3cb60a43b946764e3';
const NPROFILE_DATA = { pubkey: PUBKEY, relays: ['wss://relay.example.com'] };

function makeProfileEvent(pubkey: string, metadata: Record<string, unknown>): NostrEvent {
  return {
    id: 'e' + pubkey.slice(0, 6),
    pubkey,
    created_at: 1700000000,
    kind: 0,
    tags: [],
    content: JSON.stringify(metadata),
    sig: 's',
  };
}

/** Build a fake nostr object whose `relay(url).query(...)` returns `eventsByRelay[url]`. */
function fakeNostr(eventsByRelay: Record<string, NostrEvent[]>) {
  return {
    relay(url: string): NRelay {
      return {
        async query(_filters, _opts) {
          return eventsByRelay[url] ?? [];
        },
      } as unknown as NRelay;
    },
  };
}

describe('looksLikeBech32Entity', () => {
  it('matches a bare npub', () => {
    const npub = nip19.npubEncode(PUBKEY);
    expect(looksLikeBech32Entity(npub)).toBe(true);
  });

  it('matches a nostr:-prefixed npub', () => {
    const npub = nip19.npubEncode(PUBKEY);
    expect(looksLikeBech32Entity(`nostr:${npub}`)).toBe(true);
  });

  it('matches an nprofile', () => {
    const nprofile = nip19.nprofileEncode(NPROFILE_DATA);
    expect(looksLikeBech32Entity(nprofile)).toBe(true);
  });

  it('matches a partial npub (still being typed) so NIP-50 search is skipped', () => {
    // The regex is intentionally permissive: anything bech32-shaped after
    // npub1/nprofile1 counts, so we don't waste a NIP-50 text search on it.
    // `lookupBech32Entity` will return null for incomplete bech32 (bad checksum).
    const partial = nip19.npubEncode(PUBKEY).slice(0, 12); // e.g. "npub108nx..."
    expect(looksLikeBech32Entity(partial)).toBe(true);
  });

  it('returns null for an incomplete npub that fails bech32 decode', async () => {
    const nostr = fakeNostr({});
    const partial = nip19.npubEncode(PUBKEY).slice(0, 12);
    const result = await lookupBech32Entity(partial, nostr, new AbortController().signal);
    expect(result).toBeNull();
  });

  it('does not match a plain name or NIP-05', () => {
    expect(looksLikeBech32Entity('bob')).toBe(false);
    expect(looksLikeBech32Entity('bob@example.com')).toBe(false);
  });
});

describe('lookupBech32Entity', () => {
  it('decodes an npub and returns parsed profile metadata', async () => {
    const npub = nip19.npubEncode(PUBKEY);
    const profile = makeProfileEvent(PUBKEY, {
      name: 'bob',
      display_name: 'Bob',
      picture: 'https://example.com/p.png',
      nip05: 'bob@example.com',
    });
    const nostr = fakeNostr({ 'wss://search.nos.today': [profile] });

    const result = await lookupBech32Entity(
      npub,
      nostr,
      new AbortController().signal,
    );

    expect(result).not.toBeNull();
    expect(result!.pubkey).toBe(PUBKEY);
    expect(result!.npub).toBe(npub);
    expect(result!.name).toBe('bob');
    expect(result!.displayName).toBe('Bob');
    expect(result!.picture).toBe('https://example.com/p.png');
    expect(result!.nip05).toBe('bob@example.com');
  });

  it('strips a nostr: prefix before decoding', async () => {
    const npub = nip19.npubEncode(PUBKEY);
    const nostr = fakeNostr({});
    const result = await lookupBech32Entity(
      `nostr:${npub}`,
      nostr,
      new AbortController().signal,
    );
    expect(result).not.toBeNull();
    expect(result!.pubkey).toBe(PUBKEY);
  });

  it('decodes an nprofile and resolves its pubkey', async () => {
    const nprofile = nip19.nprofileEncode(NPROFILE_DATA);
    const profile = makeProfileEvent(PUBKEY, { name: 'carol' });
    const nostr = fakeNostr({ 'wss://purplepag.es': [profile] });

    const result = await lookupBech32Entity(
      nprofile,
      nostr,
      new AbortController().signal,
    );

    expect(result).not.toBeNull();
    expect(result!.pubkey).toBe(PUBKEY);
    expect(result!.name).toBe('carol');
  });

  it('returns a bare pubkey result when no profile is found', async () => {
    const npub = nip19.npubEncode(PUBKEY);
    const nostr = fakeNostr({});
    const result = await lookupBech32Entity(
      npub,
      nostr,
      new AbortController().signal,
    );
    expect(result).not.toBeNull();
    expect(result!.pubkey).toBe(PUBKEY);
    expect(result!.npub).toBe(npub);
    expect(result!.name).toBeUndefined();
  });

  it('returns null for a non-bech32 query', async () => {
    const nostr = fakeNostr({});
    const result = await lookupBech32Entity('bob', nostr, new AbortController().signal);
    expect(result).toBeNull();
  });
});
