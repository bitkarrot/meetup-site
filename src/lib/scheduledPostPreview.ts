/**
 * Shared helpers for extracting a display preview, image, and kind label from a
 * ScheduledPost. Used by both the list card and the calendar view.
 */

import type { ScheduledPost } from '@/types/scheduled';

export type ScheduledPostKind = 'note' | 'blog' | 'repost';

export function getScheduledPostKind(post: ScheduledPost): ScheduledPostKind {
  if (post.kind === 6 || post.kind === 16) return 'repost';
  if (post.kind === 30023) return 'blog';
  return 'note';
}

export function getScheduledPostPreview(post: ScheduledPost): string {
  const kind = getScheduledPostKind(post);

  if (kind === 'repost') {
    try {
      const original = JSON.parse(post.signed_event.content);
      if (original.kind === 1) {
        return original.content?.slice(0, 200) || 'Repost';
      }
      return original.tags?.find(([name]: string[]) => name === 'title')?.[1]
        || original.content?.slice(0, 200)
        || 'Repost';
    } catch {
      const eTag = post.signed_event.tags.find(([name]) => name === 'e');
      return eTag ? `Repost of ${eTag[1].slice(0, 16)}...` : 'Repost';
    }
  }

  if (kind === 'blog') {
    return post.signed_event.tags.find(([name]) => name === 'title')?.[1]
      || post.signed_event.content.slice(0, 200)
      || 'Untitled';
  }

  return post.signed_event.content.slice(0, 200);
}

export function getScheduledPostRepostKindLabel(post: ScheduledPost): string | null {
  if (getScheduledPostKind(post) !== 'repost') return null;

  try {
    const original = JSON.parse(post.signed_event.content);
    if (original.kind === 1) return 'Note';
    if (original.kind === 30023) return 'Blog Post';
    if (original.kind === 31922 || original.kind === 31923 || original.kind === 30313) return 'Event';
    return `Kind ${original.kind}`;
  } catch {
    return null;
  }
}

export function getScheduledPostImage(post: ScheduledPost): string | undefined {
  const kind = getScheduledPostKind(post);

  if (kind === 'blog') {
    return post.signed_event.tags.find(([name]) => name === 'image')?.[1];
  }

  if (kind === 'note') {
    // Try to find the first image URL in the note content
    const urlMatch = post.signed_event.content.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|avif)/i);
    if (urlMatch) return urlMatch[0];
  }

  return undefined;
}
