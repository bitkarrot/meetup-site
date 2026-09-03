/**
 * Unified calendar event model and normalization logic.
 *
 * Merges NIP-52 calendar events (kinds 31922/31923) with NIP-53 live events
 * (kinds 30311/30312/30313) into a single unified interface.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/52.md
 * @see https://github.com/nostr-protocol/nips/blob/master/53.md
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { parseCalendarEventStartEnd } from './eventTime';

// ============================================================================
// Unified Event Model (Discriminated Unions)
// ============================================================================

/**
 * Base fields common to all calendar events.
 */
interface BaseCalendarEvent {
  id: string;
  pubkey: string;
  kind: number;
  title: string;
  summary: string;
  description?: string;
  image?: string;
  start: number; // Unix timestamp in seconds
  end?: number;
  timezone?: string; // IANA time zone ID (e.g., 'America/New_York')
  status?: string;
  tags: string[][];
  created_at: number;
  sig: string; // event signature (needed for NIP-18 repost embedding)
}

/**
 * Calendar event (NIP-52) — date-based or time-based calendar events.
 * Examples: holidays, conferences, multi-day events, scheduled meetings.
 */
export interface CalendarEvent extends BaseCalendarEvent {
  type: 'calendar';
  kind: 31922 | 31923;
  location?: string; // Text location (address, video link)
  // No room, no live status
}

/**
 * Live event (NIP-53) — meeting room events with live status.
 * Examples: live streams, meeting rooms, spaces.
 */
export interface LiveEvent extends BaseCalendarEvent {
  type: 'live';
  kind: 30313;
  status: 'planned' | 'live' | 'ended';
  room: RoomDetails;
  participants?: {
    total?: number;
    current?: number;
  };
}

/**
 * Unified calendar event type — either a calendar event or a live event.
 */
export type UnifiedCalendarEvent = CalendarEvent | LiveEvent;

/**
 * Room details from NIP-53 30312 event.
 */
export interface RoomDetails {
  id: string; // d tag
  pubkey?: string;
  name: string;
  serviceUrl: string;
  status: 'open' | 'private' | 'closed';
  summary?: string;
  image?: string;
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize a NIP-52 calendar event (kind 31922 or 31923) to CalendarEvent.
 */
export function normalizeCalendarEvent(event: NostrEvent): CalendarEvent {
  const tags = event.tags || [];
  const startTag = tags.find(([name]) => name === 'start')?.[1] || '0';
  const endTag = tags.find(([name]) => name === 'end')?.[1];
  const { start, end } = parseCalendarEventStartEnd(
    event.kind,
    startTag,
    endTag,
    event.created_at,
  );

  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind as 31922 | 31923,
    type: 'calendar',
    title: tags.find(([name]) => name === 'title')?.[1] || 'Untitled Event',
    summary: tags.find(([name]) => name === 'summary')?.[1] || '',
    image: tags.find(([name]) => name === 'image')?.[1],
    location: tags.find(([name]) => name === 'location')?.[1],
    start,
    end,
    timezone: undefined, // NIP-52 doesn't have time zones
    status: tags.find(([name]) => name === 'status')?.[1] || 'confirmed',
    tags,
    created_at: event.created_at,
    sig: event.sig,
  };
}

/**
 * Normalize a NIP-53 live event (kind 30313) to LiveEvent.
 * Requires a room details fetcher to resolve the parent room (30312).
 */
export async function normalizeLiveEvent(
  event: NostrEvent,
  fetchRoomDetails: (coords: string) => Promise<RoomDetails | null>,
): Promise<LiveEvent> {
  const tags = event.tags || [];
  const aTag = tags.find(([name]) => name === 'a')?.[1];
  const roomCoords = aTag || '';

  // Fetch room details (cached by caller)
  const room = await fetchRoomDetails(roomCoords);

  // Fallback for events that publish the room URL directly on the 30313 event
  const serviceTag = tags.find(([name]) => name === 'service')?.[1];
  const roomNameTag = tags.find(([name]) => name === 'room')?.[1];
  const serviceUrl = room?.serviceUrl || serviceTag || '';
  const roomName = room?.name || roomNameTag || (serviceUrl ? (() => { try { return new URL(serviceUrl).hostname; } catch { return 'Live Room'; } })() : 'Unknown Room');

  const totalParticipants = tags.find(([name]) => name === 'total_participants')?.[1];
  const currentParticipants = tags.find(([name]) => name === 'current_participants')?.[1];

  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: 30313,
    type: 'live',
    title: tags.find(([name]) => name === 'title')?.[1] || 'Untitled Event',
    summary: tags.find(([name]) => name === 'summary')?.[1] || '',
    image: tags.find(([name]) => name === 'image')?.[1],
    start: Number(tags.find(([name]) => name === 'starts')?.[1] || 0),
    end: tags.find(([name]) => name === 'ends')?.[1]
      ? Number(tags.find(([name]) => name === 'ends')?.[1])
      : undefined,
    timezone: tags.find(([name]) => name === 'start_tzid')?.[1],
    status: (tags.find(([name]) => name === 'status')?.[1] || 'planned') as 'planned' | 'live' | 'ended',
    room: {
      id: room?.id || '',
      pubkey: room?.pubkey,
      name: roomName,
      serviceUrl,
      status: room?.status || 'closed',
    },
    participants: {
      total: totalParticipants ? Number(totalParticipants) : undefined,
      current: currentParticipants ? Number(currentParticipants) : undefined,
    },
    tags,
    created_at: event.created_at,
    sig: event.sig,
  };
}

/**
 * Normalize a raw Nostr event to a unified calendar event.
 * Dispatches to the appropriate normalization function based on kind.
 */
export async function normalizeEvent(
  event: NostrEvent,
  fetchRoomDetails: (coords: string) => Promise<RoomDetails | null>,
): Promise<UnifiedCalendarEvent> {
  if (event.kind === 31922 || event.kind === 31923) {
    return normalizeCalendarEvent(event);
  }
  if (event.kind === 30313) {
    return normalizeLiveEvent(event, fetchRoomDetails);
  }
  // Unsupported kind — throw or return a fallback
  throw new Error(`Unsupported event kind: ${event.kind}`);
}

/**
 * Check if an event is currently live (status === 'live' and within time range).
 * For live events with no end time, the status field (updated by the creator)
 * is trusted rather than inventing a duration.
 */
export function isEventLive(event: UnifiedCalendarEvent): boolean {
  if (event.type !== 'live') return false;
  if (event.status !== 'live') return false;

  const now = Math.floor(Date.now() / 1000);
  const start = event.start;
  if (event.end === undefined) return now >= start;

  return now >= start && now <= event.end;
}

/**
 * Check if an event is upcoming or currently ongoing.
 * An event shows in the Upcoming filter from creation until it ends.
 */
export function isEventUpcoming(event: UnifiedCalendarEvent): boolean {
  const now = Math.floor(Date.now() / 1000);
  return event.end ? event.end > now : event.start > now;
}

/**
 * Check if an event is past (end time has passed).
 */
export function isEventPast(event: UnifiedCalendarEvent): boolean {
  const now = Math.floor(Date.now() / 1000);
  const end = event.end || event.start;
  return end < now;
}
