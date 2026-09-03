/**
 * Compute the pixel coordinates (relative to the textarea's top-left) of the
 * caret at `position` inside `textarea`.
 *
 * Uses the standard "mirror div" technique: a hidden div styled identically to
 * the textarea is filled with the text up to the caret, plus a marker span.
 * The marker's offsetLeft/offsetTop give the caret position, accounting for
 * wrapping, scrolling, padding, and border exactly as the browser renders the
 * textarea. This is O(1) layout reads and avoids manual line-height math.
 *
 * The mirror div is created lazily and reused across calls; it is only touched
 * when mention mode is active, so normal typing pays nothing.
 */

const MIRROR_STYLES = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
] as const;

let mirror: HTMLDivElement | null = null;

export interface CaretCoords {
  top: number;
  left: number;
  lineHeight: number;
}

export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): CaretCoords {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.id = 'mention-caret-mirror';
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top = '0';
    mirror.style.left = '0';
    mirror.style.pointerEvents = 'none';
    mirror.style.zIndex = '-1';
    document.body.appendChild(mirror);
  }

  const computed = window.getComputedStyle(textarea);
  for (const prop of MIRROR_STYLES) {
    mirror!.style.setProperty(
      prop,
      computed.getPropertyValue(prop) || (computed as unknown as Record<string, string>)[prop],
    );
  }
  // Force wrapping behaviour identical to the textarea.
  mirror!.style.whiteSpace = computed.whiteSpace === 'pre' ? 'pre-wrap' : computed.whiteSpace;
  mirror!.style.wordWrap = computed.wordWrap === 'normal' ? 'break-word' : computed.wordWrap;

  // Mirror the textarea's width so wrapping matches. Account for scrollbar.
  mirror!.style.width = `${textarea.clientWidth}px`;

  const text = textarea.value.substring(0, position);
  // Use textContent for the part before the caret (no HTML injection risk),
  // and a marker span to measure the caret position.
  mirror!.textContent = text;
  const marker = document.createElement('span');
  marker.textContent = '\u200b'; // zero-width space so it has a measurable box
  mirror!.appendChild(marker);

  const mirrorRect = mirror!.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();

  // Offset of the marker relative to the mirror's content box origin, then
  // translate into coordinates relative to the textarea's border box.
  const top =
    markerRect.top - mirrorRect.top + textarea.scrollTop - textarea.clientTop;
  const left =
    markerRect.left - mirrorRect.left + textarea.scrollLeft - textarea.clientLeft;

  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;

  // Clean up the marker so the mirror is ready for the next call.
  mirror!.textContent = '';

  // Return coords relative to the textarea's top-left (border box), clamped
  // so the popover never positions itself off the textarea's width.
  return {
    top,
    left: Math.min(left, textarea.clientWidth - 20),
    lineHeight,
  };
}
