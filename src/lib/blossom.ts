/**
 * Shared Blossom media utilities used by AdminMedia and MediaSelectorDialog.
 */

export interface BlossomBlob {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  uploaded?: number;
  owner?: string;
}

const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogg',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.weba',
  'application/pdf': '.pdf',
};

/**
 * Append the correct file extension to Blossom URLs (bare sha256 hashes).
 * Some browsers (Safari) won't render <video> elements without an extension.
 * Inserts the extension before any query string or fragment.
 */
export function urlWithExtension(blob: BlossomBlob): string {
  try {
    const url = new URL(blob.url);
    if (/\.[a-zA-Z0-9]{2,5}$/.test(url.pathname)) return blob.url;

    const mime = (blob.type || '').toLowerCase();
    const ext = EXT_MAP[mime];
    if (!ext) return blob.url;
    url.pathname += ext;
    return url.toString();
  } catch {
    // Malformed URL — return as-is rather than corrupting it
    return blob.url;
  }
}

/**
 * Determine if a blob can be previewed as an image or video.
 * AVIF/HEIC/HEIF return null because canvas can't re-encode them and
 * browser support is inconsistent.
 */
export function getMediaPreviewKind(blob: BlossomBlob): 'image' | 'video' | null {
  const mime = (blob.type || '').toLowerCase();

  if (mime === 'image/avif' || mime === 'image/heic' || mime === 'image/heif') {
    return null;
  }

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return null;
}
