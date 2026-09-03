import { useRef, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Quote,
  Code,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaSelectorDialog } from '@/components/admin/MediaSelectorDialog';
import { EventPickerDialog } from '@/components/admin/EventPickerDialog';

interface MarkdownToolbarProps {
  /** ID of the textarea to target */
  textareaId: string;
  disabled?: boolean;
}

interface PendingImage {
  url: string;
  alt: string;
}

interface ImageSize {
  label: string;
  description: string;
  width: string;
  /** Preview width for the size button */
  previewWidth: string;
}

const IMAGE_SIZES: ImageSize[] = [
  { label: 'Thumbnail', description: 'Small inline image', width: '25%', previewWidth: 'w-16' },
  { label: 'Small', description: 'Half width', width: '50%', previewWidth: 'w-24' },
  { label: 'Medium', description: 'Three-quarter width', width: '75%', previewWidth: 'w-32' },
  { label: 'Full Width', description: 'Fill the content column', width: '100%', previewWidth: 'w-full' },
];

/**
 * Set a textarea's value using the native prototype setter.
 *
 * React 18 controlled components track the last-known value internally.
 * Direct `textarea.value = ...` assignments bypass this tracking, so
 * the subsequent `input` event may not trigger `onChange` — especially
 * when the textarea isn't focused (e.g. behind a dialog).
 *
 * The native setter from `HTMLTextAreaElement.prototype` goes through
 * the same internal path as user typing, so React reliably detects the
 * change and fires `onChange` when we dispatch the `input` event.
 */
function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value',
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(textarea, value);
  } else {
    textarea.value = value;
  }
}

/**
 * Insert `text` at the saved cursor position in the textarea, then restore
 * focus and place the caret after the inserted text.
 *
 * Shared by `insertEventRef` and `insertImageWithSize` — both need to insert
 * block-level content at a cursor position that was saved before a dialog
 * opened (opening a dialog blurs the textarea, losing the selection).
 */
function insertAtSavedCursor(
  textarea: HTMLTextAreaElement,
  savedSelection: { start: number; end: number } | null,
  text: string,
) {
  const start = savedSelection?.start ?? textarea.selectionStart;
  const value = textarea.value;
  const newValue = value.slice(0, start) + text + value.slice(start);

  setTextareaValue(textarea, newValue);
  textarea.setSelectionRange(start + text.length, start + text.length);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

/**
 * Formatting toolbar that inserts Markdown syntax at the cursor position
 * in a textarea. Works by manipulating the textarea's value via the native
 * setter and dispatching an input event so React's controlled component
 * picks up the change.
 *
 * Image insertion uses the unified MediaSelectorDialog (same as Notes and Blog)
 * which lets users browse existing media or upload new files. After selecting
 * an image, a size picker dialog lets the user choose how large the image
 * should appear in the page.
 */
export function MarkdownToolbar({ textareaId, disabled }: MarkdownToolbarProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Saved cursor position for restoring after the media dialog closes
  const savedSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  // After image selection, show size picker before inserting
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);

  const getTextarea = useCallback(() => {
    if (!textareaRef.current || textareaRef.current.id !== textareaId) {
      textareaRef.current = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    }
    return textareaRef.current;
  }, [textareaId]);

  /**
   * Insert text around the current selection in the textarea.
   * wrap: text to insert before selection
   * placeholder: text to insert if nothing is selected
   * block: if true, insert on new lines (for headings, lists, quotes)
   */
  const insert = useCallback((before: string, after: string = '', placeholder: string = 'text', block = false) => {
    const textarea = getTextarea();
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.slice(start, end) || placeholder;

    let insertText: string;
    let newCursorStart: number;
    let newCursorEnd: number;

    if (block) {
      // For block elements, ensure we're on a new line
      const prefix = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
      insertText = `${prefix}${before}${selected}${after}`;
      setTextareaValue(textarea, value.slice(0, start) + insertText + value.slice(end));
      newCursorStart = start + prefix.length;
      newCursorEnd = newCursorStart + before.length + selected.length;
    } else {
      insertText = `${before}${selected}${after}`;
      setTextareaValue(textarea, value.slice(0, start) + insertText + value.slice(end));
      newCursorStart = start + before.length;
      newCursorEnd = newCursorStart + selected.length;
    }

    textarea.setSelectionRange(newCursorStart, newCursorEnd);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }, [getTextarea]);

  const insertLine = useCallback((prefix: string, placeholder: string = 'List item') => {
    const textarea = getTextarea();
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    // Find the start of the current line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;

    // Get all selected lines and prefix each
    const selectedLines = value.slice(lineStart, actualLineEnd) || placeholder;
    const newLines = selectedLines.split('\n').map(line => `${prefix}${line}`).join('\n');

    setTextareaValue(textarea, value.slice(0, lineStart) + newLines + value.slice(actualLineEnd));
    textarea.setSelectionRange(lineStart, lineStart + newLines.length);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }, [getTextarea]);

  const insertLink = useCallback(() => {
    const textarea = getTextarea();
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.slice(start, end) || 'link text';

    const url = window.prompt('Enter URL:', 'https://');
    if (!url) return;

    const insertText = `[${selected}](${url})`;
    setTextareaValue(textarea, value.slice(0, start) + insertText + value.slice(end));
    textarea.setSelectionRange(start + 1, start + 1 + selected.length);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }, [getTextarea]);

  /**
   * Save the current cursor position and open a dialog. Opening a dialog
   * blurs the textarea (losing the selection), so we save it first to
   * restore it when inserting content after the dialog closes.
   */
  const saveCursorAndOpen = useCallback((open: () => void) => {
    const textarea = getTextarea();
    if (!textarea) return;

    savedSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    open();
  }, [getTextarea]);

  const openMediaSelector = useCallback(
    () => saveCursorAndOpen(() => setShowMediaSelector(true)),
    [saveCursorAndOpen],
  );

  const openEventPicker = useCallback(
    () => saveCursorAndOpen(() => setShowEventPicker(true)),
    [saveCursorAndOpen],
  );

  /**
   * Insert a `nostr:<id>` reference at the saved cursor position.
   * Wrapped in newlines so it renders as a standalone block in Markdown
   * (the remark plugin turns it into an embedded preview card).
   */
  const insertEventRef = useCallback((nostrRef: string) => {
    const textarea = getTextarea();
    if (!textarea) return;

    insertAtSavedCursor(textarea, savedSelectionRef.current, `\n${nostrRef}\n`);
    savedSelectionRef.current = null;
  }, [getTextarea]);

  /**
   * When an image is selected from the media dialog, don't insert immediately.
   * Instead, store the URL + alt text and show the size picker dialog.
   */
  const handleMediaSelect = useCallback((url: string) => {
    const filename = url.split('/').pop()?.split('?')[0] || 'image';
    const alt = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    setPendingImage({ url, alt });
    setShowMediaSelector(false);
  }, []);

  /**
   * Insert the pending image at the saved cursor position with the chosen
   * width. Uses an <img> tag with inline style since standard Markdown
   * has no syntax for image sizing. rehypeRaw renders this correctly.
   */
  const insertImageWithSize = useCallback((size: ImageSize) => {
    const textarea = getTextarea();
    if (!textarea || !pendingImage) return;

    // Full width uses plain markdown (no style needed — CSS defaults handle it).
    // Sized images use an <img> tag with inline width style.
    const insertText = size.width === '100%'
      ? `\n![${pendingImage.alt}](${pendingImage.url})\n`
      : `\n<img src="${pendingImage.url}" alt="${pendingImage.alt}" style="width: ${size.width}; border-radius: var(--radius);" />\n`;

    insertAtSavedCursor(textarea, savedSelectionRef.current, insertText);
    savedSelectionRef.current = null;
    setPendingImage(null);
  }, [getTextarea, pendingImage]);

  const tools = [
    { icon: Bold, title: 'Bold', action: () => insert('**', '**', 'bold text') },
    { icon: Italic, title: 'Italic', action: () => insert('*', '*', 'italic text') },
    { icon: Heading1, title: 'Heading 1', action: () => insert('# ', '', 'Heading 1', true) },
    { icon: Heading2, title: 'Heading 2', action: () => insert('## ', '', 'Heading 2', true) },
    { icon: Heading3, title: 'Heading 3', action: () => insert('### ', '', 'Heading 3', true) },
    { icon: List, title: 'Bullet List', action: () => insertLine('- ') },
    { icon: ListOrdered, title: 'Numbered List', action: () => insertLine('1. ') },
    { icon: Quote, title: 'Quote', action: () => insert('> ', '', 'Quote', true) },
    { icon: Code, title: 'Code', action: () => insert('`', '`', 'code') },
    { icon: LinkIcon, title: 'Link', action: insertLink },
    { icon: ImageIcon, title: 'Image from library', action: openMediaSelector },
    { icon: Link2, title: 'Insert Event', action: openEventPicker },
  ];

  return (
    <>
      <div className="flex items-center gap-0.5 flex-wrap border-b pb-2 mb-2">
        {tools.map((tool) => (
          <Button
            key={tool.title}
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={tool.action}
            title={tool.title}
            className={cn('h-8 w-8 p-0')}
          >
            <tool.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      <MediaSelectorDialog
        open={showMediaSelector}
        onOpenChange={setShowMediaSelector}
        onSelect={handleMediaSelect}
        title="Insert Image"
      />

      <EventPickerDialog
        open={showEventPicker}
        onOpenChange={setShowEventPicker}
        onSelect={insertEventRef}
        title="Insert Event"
      />

      {/* Size picker — shown after an image is selected from the media dialog */}
      <Dialog open={!!pendingImage} onOpenChange={(open) => !open && setPendingImage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose image size</DialogTitle>
            <DialogDescription>
              How large should this image appear on the page?
            </DialogDescription>
          </DialogHeader>

          {pendingImage && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="flex items-center justify-center p-4 border rounded-lg bg-muted/30 min-h-[120px]">
                <img
                  src={pendingImage.url}
                  alt={pendingImage.alt}
                  className="max-h-32 w-auto rounded-md object-contain"
                />
              </div>

              {/* Size options */}
              <div className="grid grid-cols-2 gap-3">
                {IMAGE_SIZES.map((size) => (
                  <button
                    key={size.label}
                    type="button"
                    onClick={() => insertImageWithSize(size)}
                    className="flex flex-col items-center gap-2 p-4 border rounded-lg hover:border-primary hover:bg-accent transition-colors text-center"
                  >
                    {/* Visual width indicator */}
                    <div className="flex items-center justify-center h-8 w-full">
                      <div className={cn('h-6 bg-primary/20 rounded border border-primary/40', size.previewWidth)} />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{size.label}</div>
                      <div className="text-xs text-muted-foreground">{size.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogClose asChild>
            <Button variant="outline" className="w-full">Cancel</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
