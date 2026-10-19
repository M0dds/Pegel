import { findPegelLink } from './links';

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  );
}

function carriesText(event: DragEvent): boolean {
  const types = event.dataTransfer?.types ?? [];
  return types.includes('text/uri-list') || types.includes('text/plain');
}

/** First URL of a text/uri-list (lines starting with # are comments). */
function droppedText(data: DataTransfer): string {
  const uris = data.getData('text/uri-list');
  const first = uris.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'));
  return first ?? data.getData('text/plain');
}

/**
 * Lets YT links be dropped onto a page (from Discord, a browser, …). Drops
 * that the page handles itself (YT's own drag and drop, text fields) and
 * texts without a YT link keep their normal behaviour.
 */
export function watchLinkDrops(target: Window, onLink: (url: string) => void): () => void {
  const onDragOver = (event: DragEvent) => {
    if (event.defaultPrevented || isEditable(event.target) || !carriesText(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'link';
  };
  const onDrop = (event: DragEvent) => {
    if (event.defaultPrevented || isEditable(event.target) || !event.dataTransfer) return;
    const link = findPegelLink(droppedText(event.dataTransfer));
    if (!link) return;
    event.preventDefault();
    onLink(link.url);
  };
  target.addEventListener('dragover', onDragOver);
  target.addEventListener('drop', onDrop);
  return () => {
    target.removeEventListener('dragover', onDragOver);
    target.removeEventListener('drop', onDrop);
  };
}
