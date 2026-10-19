import type { PegelApi } from '@shared/ipc';

declare global {
  interface Window {
    pegel: PegelApi;
  }
}
