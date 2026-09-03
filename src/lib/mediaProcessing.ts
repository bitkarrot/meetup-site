/**
 * Client-side media processing utilities.
 *
 * Images: metadata is ALWAYS stripped via canvas re-encode (canvas does not
 * preserve EXIF, GPS, ICC profiles, or camera data). When compression is
 * enabled, images are re-encoded to WebP (lossy for photos, lossless for
 * images with transparency) at a configurable quality level.
 *
 * Videos: handled server-side via the /process-video endpoint (ffmpeg).
 * This module provides the size estimation heuristic and the API call.
 */

import { sha256 } from '@noble/hashes/sha256';

// ─── Types ───

export interface ProcessedImage {
  file: File;
  originalSize: number;
  processedSize: number;
  format: string;
  width: number;
  height: number;
  stripped: boolean; // metadata was stripped
}

/** Result of stripImageMetadata. */
export interface StrippedImage {
  file: File;
  stripped: boolean;
  /** Why metadata was not stripped, if applicable. */
  reason?: 'gif' | 'canvas-failed';
}

export interface VideoProcessResult {
  sha256: string;
  url: string;
  size: number;
  original_size: number;
  original_sha: string;
  mime: string;
}

export type VideoQuality = 'high' | 'medium' | 'low' | 'none';
export type VideoResolution = 'original' | '1080' | '720' | '480';

// ─── Image Processing ───

/** Load a File into an HTMLImageElement. */
function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/** Check if an image has any transparent pixels by sampling the alpha channel. */
function hasTransparency(img: HTMLImageElement): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);

  // Sample a grid of pixels — checking every pixel is too slow for large images
  const w = canvas.width;
  const h = canvas.height;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 100));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[3] < 255) return true;
    }
  }
  return false;
}

/**
 * Strip metadata from an image by re-encoding it through a canvas.
 * Canvas does not preserve EXIF, GPS, ICC profiles, or camera data.
 * The output format matches the input format at high quality (visually
 * lossless).
 *
 * GIFs cannot be processed through canvas (animation would be lost), so
 * they are returned as-is with `stripped: false, reason: 'gif'`. The
 * caller should warn the user that metadata is not stripped for GIFs.
 *
 * If canvas processing fails entirely, throws an Error so the caller can
 * inform the user and abort the upload — never silently upload a file
 * with private metadata intact.
 *
 * This is ALWAYS applied to every uploaded image, regardless of whether
 * compression is enabled.
 */
export async function stripImageMetadata(file: File): Promise<StrippedImage> {
  // GIFs: canvas can't preserve animation — return as-is, caller must warn
  if (file.type === 'image/gif') {
    return { file, stripped: false, reason: 'gif' };
  }

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available — cannot strip metadata');

  ctx.drawImage(img, 0, 0);

  // Re-encode in original format at high quality (visually lossless)
  // PNG is lossless so quality doesn't apply; JPEG at 0.95 is near-lossless
  const outputType = file.type === 'image/png' ? 'image/png'
    : file.type === 'image/webp' ? 'image/webp'
    : 'image/jpeg'; // default to JPEG for JPEG, BMP, etc.

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, 0.95);
  });

  if (!blob) throw new Error('Canvas re-encode failed — cannot strip metadata');

  // Always return the canvas version, even if larger. The whole point is
  // to strip metadata — a size increase is an acceptable trade-off for
  // privacy. The canvas output has no EXIF/GPS/ICC data.
  return {
    file: new File([blob], replaceExtension(file.name, outputType), { type: outputType }),
    stripped: true,
  };
}

/**
 * Process an image: strip metadata AND compress to WebP.
 *
 * - Images with transparency → WebP lossless (preserves alpha, ~20% smaller than PNG)
 * - Photos (no transparency) → WebP lossy at given quality (visually lossless at 85)
 * - GIFs → returned as-is (animated WebP has spotty browser support)
 * - Optionally resize if dimensions exceed maxDimension
 */
export async function processImage(
  file: File,
  quality: number = 85,
  maxDimension: number = 0, // 0 = no resize
): Promise<ProcessedImage> {
  const originalSize = file.size;

  // GIFs: pass through (can't convert animated GIFs via canvas)
  if (file.type === 'image/gif') {
    return {
      file,
      originalSize,
      processedSize: originalSize,
      format: 'gif',
      width: 0,
      height: 0,
      stripped: false,
    };
  }

  const img = await loadImage(file);
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  // Resize if needed (maintain aspect ratio)
  if (maxDimension > 0 && (width > maxDimension || height > maxDimension)) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available');
  }
  ctx.drawImage(img, 0, 0, width, height);

  // Determine if image has transparency
  const transparent = hasTransparency(img);

  // Choose WebP mode: lossless for transparent images, lossy for photos
  const outputType = 'image/webp';
  const qualityValue = transparent ? 1.0 : quality / 100;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, qualityValue);
  });

  if (!blob) {
    throw new Error('Failed to encode image');
  }

  const processedFile = new File([blob], replaceExtension(file.name, 'image/webp'), { type: 'image/webp' });

  return {
    file: processedFile,
    originalSize,
    processedSize: blob.size,
    format: transparent ? 'webp-lossless' : 'webp-lossy',
    width,
    height,
    stripped: true,
  };
}

/** Replace the file extension to match the new MIME type. */
function replaceExtension(filename: string, mimeType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  const ext = extMap[mimeType];
  if (!ext) return filename;

  const baseName = filename.replace(/\.[^.]+$/, '');
  return baseName + ext;
}

// ─── Video Processing ───

/** Rough size estimate for video transcoding based on quality + resolution. */
export function estimateVideoSize(
  originalSize: number,
  quality: VideoQuality,
  resolution: VideoResolution = 'original',
): number {
  const qualityRatios: Record<VideoQuality, number> = {
    none: 1.0,    // copy-only remux — no re-encoding, ~same size
    high: 0.80,   // CRF 18 — high quality, modest compression
    medium: 0.50, // CRF 23 — balanced
    low: 0.30,    // CRF 28 — aggressive compression
  };
  // Resolution scaling: pixel count ratio (height² approximation since width scales too)
  // 1080p = 1.0 (baseline), 720p ≈ 0.44, 480p ≈ 0.20
  const resRatios: Record<VideoResolution, number> = {
    original: 1.0,
    '1080': 1.0,
    '720': 0.44,
    '480': 0.20,
  };
  return Math.round(originalSize * qualityRatios[quality] * resRatios[resolution]);
}

/** Format bytes as human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Call the server-side /process-video endpoint to transcode a stored video
 * blob to MP4 (H.264/AAC) with metadata stripped.
 */
export async function processVideo(
  blossomUrl: string,
  sha256: string,
  quality: VideoQuality,
  resolution: VideoResolution,
  signer: { signEvent: (event: unknown) => Promise<unknown> },
): Promise<VideoProcessResult> {
  // Build NIP-98 auth event
  const now = Math.floor(Date.now() / 1000);
  const authEvent = await signer.signEvent({
    kind: 24242,
    content: 'Process video',
    created_at: now,
    tags: [
      ['t', 'upload'],
      ['expiration', (now + 300).toString()], // 5 min expiry for video processing
      ['x', sha256],
      ['method', 'POST'],
    ],
  }) as Record<string, unknown>;

  const authBase64 = btoa(JSON.stringify(authEvent));

  const response = await fetch(`${blossomUrl}/process-video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Nostr ${authBase64}`,
    },
    body: JSON.stringify({ sha256, quality, resolution }),
  });

  if (response.status === 503) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Another video is being processed. Please try again in a moment.');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Video processing failed: ${text}`);
  }

  return response.json();
}

/**
 * Stream a raw video file to the server for transcoding in a single request.
 * The server receives the file, runs ffmpeg, and stores only the result —
 * the original is never persisted to blossom.
 *
 * This avoids the iOS Safari memory crash that occurs when the client
 * calls file.arrayBuffer() to compute a SHA-256 hash before uploading.
 * With this function, the File is passed directly as the fetch() body,
 * which the browser streams without loading it into JS heap.
 *
 * Quality and resolution are sent as query params. The auth event does
 * not include an 'x' tag (since we don't know the hash yet) — the server
 * accepts this for the streaming endpoint.
 */
export async function streamProcessVideo(
  blossomUrl: string,
  file: File,
  quality: VideoQuality,
  resolution: VideoResolution,
  signer: { signEvent: (event: unknown) => Promise<unknown> },
): Promise<VideoProcessResult> {
  const now = Math.floor(Date.now() / 1000);
  const authEvent = await signer.signEvent({
    kind: 24242,
    content: 'Stream process video',
    created_at: now,
    tags: [
      ['t', 'upload'],
      ['expiration', (now + 900).toString()], // 15 min — large videos need time
      ['method', 'PUT'],
    ],
  }) as Record<string, unknown>;

  const authBase64 = btoa(JSON.stringify(authEvent));

  const params = new URLSearchParams({ quality, resolution });
  const response = await fetch(`${blossomUrl}/process-video-stream?${params}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Nostr ${authBase64}`,
      'Content-Type': file.type || 'video/mp4',
    },
    body: file, // fetch streams the File without loading it into JS heap
  });

  if (response.status === 503) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Another video is being processed. Please try again in a moment.');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Video processing failed: ${text}`);
  }

  return response.json();
}



/**
 * Stream-upload a file to one or more Blossom servers using NIP-42 auth
 * (kind 24242). The SHA-256 hash is computed incrementally in 1 MB chunks
 * via @noble/hashes so the full file is never loaded into JS heap at once.
 *
 * When multiple servers are provided, the file is uploaded to each
 * sequentially. Tags from the first successful response are returned.
 * Failed servers are silently skipped (same semantics as BlossomUploader's
 * Promise.any for images).
 */
export async function streamUpload(
  file: File,
  servers: string | string[],
  signer: { signEvent: (event: unknown) => Promise<unknown> },
  expiresIn: number = 15 * 60_000,
): Promise<string[][]> {
  const serverList = Array.isArray(servers) ? servers : [servers];
  if (serverList.length === 0) throw new Error('No servers provided for upload');

  // Incremental SHA-256: hash the file in 1 MB chunks so we never load
  // the entire file into memory at once.
  const CHUNK_SIZE = 1024 * 1024; // 1 MB
  const hasher = sha256.create();
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
    const chunk = new Uint8Array(await slice.arrayBuffer());
    hasher.update(chunk);
  }
  const hashBytes = hasher.digest();
  const x = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const now = Date.now();
  const expiration = now + expiresIn;
  const event = await signer.signEvent({
    kind: 24242,
    content: `Upload ${file.name}`,
    created_at: Math.floor(now / 1000),
    tags: [
      ['t', 'upload'],
      ['x', x],
      ['size', file.size.toString()],
      ['expiration', Math.floor(expiration / 1000).toString()],
    ],
  }) as Record<string, unknown>;

  const authBase64 = btoa(JSON.stringify(event));

  // Upload to each server sequentially. Return tags from the first
  // successful upload; subsequent failures are non-fatal.
  let tags: string[][] | null = null;
  let lastError: Error | null = null;

  for (const server of serverList) {
    try {
      const url = new URL('/upload', server);
      const response = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Authorization': `Nostr ${authBase64}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`Upload failed (${response.status}): ${text}`);
      }

      const json = await response.json() as {
        url: string;
        sha256: string;
        size: number;
        type?: string;
      };

      if (!tags) {
        tags = [
          ['url', json.url],
          ['x', json.sha256],
          ['ox', json.sha256],
          ['size', json.size.toString()],
        ];
        if (json.type) tags.push(['m', json.type]);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!tags) {
    throw lastError || new Error('All upload servers failed');
  }

  return tags;
}
