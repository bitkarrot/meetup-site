/**
 * NIP-53 room event parsing utilities.
 *
 * Handles kind 30312 (Meeting Space) events for room configuration.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/53.md
 */

import type { NostrEvent } from '@nostrify/nostrify';
import type { RoomDetails } from './calendarEvents';

/**
 * Parse a NIP-53 30312 room event to RoomDetails.
 */
export function parseRoomEvent(event: NostrEvent): RoomDetails {
  const tags = event.tags || [];

  return {
    id: tags.find(([name]) => name === 'd')?.[1] || '',
    pubkey: event.pubkey,
    name: tags.find(([name]) => name === 'room')?.[1] || 'Untitled Room',
    serviceUrl: tags.find(([name]) => name === 'service')?.[1] || '',
    status: (tags.find(([name]) => name === 'status')?.[1] || 'open') as 'open' | 'private' | 'closed',
    summary: tags.find(([name]) => name === 'summary')?.[1],
    image: tags.find(([name]) => name === 'image')?.[1],
  };
}

/**
 * Generate a room identifier (d tag) from a room name.
 * Converts to lowercase, replaces spaces with hyphens, removes special chars.
 */
export function generateRoomId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .trim()
    .replace(/\s+/g, '-'); // Replace spaces with hyphens
}
