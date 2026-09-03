import { useState, useRef, useLayoutEffect, type RefObject } from 'react';

interface MasonryConfig {
  columns: { base: number; md: number; lg: number };
  gap: number;
}

interface MasonryPosition {
  x: number;
  y: number;
  width: number;
}

/**
 * Masonry layout hook — places items in reading order (left-to-right,
 * top-to-bottom) with no vertical gaps by assigning each item to the
 * shortest column. Recomputes on resize and when images/videos load.
 *
 * Items must have `data-masonry-item` attribute.
 */
export function useMasonry<T>(
  items: T[],
  containerRef: RefObject<HTMLDivElement | null>,
  config: MasonryConfig,
  deps: unknown[],
) {
  const [positions, setPositions] = useState<MasonryPosition[]>([]);
  const [height, setHeight] = useState(0);
  const prevKey = useRef('');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) {
      setPositions([]);
      setHeight(0);
      return;
    }

    const compute = () => {
      const containerWidth = container.offsetWidth;
      // Skip if container isn't laid out yet (e.g. dialog animating open)
      if (containerWidth === 0) return;

      let numColumns = config.columns.base;
      if (containerWidth >= 1024) numColumns = config.columns.lg;
      else if (containerWidth >= 768) numColumns = config.columns.md;

      const colWidth = (containerWidth - config.gap * (numColumns - 1)) / numColumns;
      const colHeights = new Array(numColumns).fill(0);
      const itemEls = container.querySelectorAll('[data-masonry-item]');
      const newPositions: MasonryPosition[] = [];

      itemEls.forEach((el) => {
        const itemHeight = (el as HTMLElement).offsetHeight;
        let shortestCol = 0;
        for (let i = 1; i < numColumns; i++) {
          if (colHeights[i] < colHeights[shortestCol]) shortestCol = i;
        }
        const x = shortestCol * (colWidth + config.gap);
        const y = colHeights[shortestCol];
        newPositions.push({ x, y, width: colWidth });
        colHeights[shortestCol] = y + itemHeight + config.gap;
      });

      const key = newPositions.map(p => `${p.x},${p.y},${p.width}`).join('|') + `;${Math.max(...colHeights, 0)}`;
      if (key !== prevKey.current) {
        prevKey.current = key;
        setPositions(newPositions);
        setHeight(Math.max(...colHeights, 0));
      }
    };

    const rafId = requestAnimationFrame(compute);

    const resizeObserver = new ResizeObserver(() => compute());
    resizeObserver.observe(container);

    // Attach load listeners for images/videos that haven't loaded yet,
    // and schedule recomputes for ones that are already complete (cached).
    // Without this, cached images never fire a `load` event and the
    // initial compute runs with 0-height items, causing them to stack.
    const mediaEls = container.querySelectorAll('img, video');
    const onLoad = () => compute();
    let anyComplete = false;
    mediaEls.forEach((el) => {
      const img = el as HTMLImageElement;
      if (img.complete) {
        anyComplete = true;
      } else {
        img.addEventListener('load', onLoad);
        img.addEventListener('loadedmetadata', onLoad);
      }
    });

    // Fallback recompute schedule: catches cached images (complete=true,
    // no load event fires) and late layout settles after dialog animation.
    let fallbackId: number | undefined;
    if (anyComplete) {
      fallbackId = window.setTimeout(compute, 100);
    }
    // Always schedule a final settle pass — cheap insurance for edge cases
    // (dialog open animation, font loading, lazy image decode, etc.)
    const settleId = window.setTimeout(compute, 400);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mediaEls.forEach((el) => {
        el.removeEventListener('load', onLoad);
        el.removeEventListener('loadedmetadata', onLoad);
      });
      if (fallbackId) clearTimeout(fallbackId);
      clearTimeout(settleId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { positions, height };
}
