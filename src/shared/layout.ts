/** Layout constants shared by main process (view bounds) and UI (CSS). */
export const TITLEBAR_HEIGHT = 38;
export const EQ_PANEL_WIDTH = 372;
/** Space around the floating panel card: to YT, the title bar and the window edges. */
export const PANEL_GAP = 10;
/** Width YT gives up while a side panel is open (the card plus its gaps). */
export const PANEL_SPACE = EQ_PANEL_WIDTH + 2 * PANEL_GAP;

export const MAIN_WINDOW_DEFAULT = { width: 1280, height: 800 } as const;
export const MAIN_WINDOW_MIN = { width: 900, height: 600 } as const;

export const MINI_WINDOW_SIZE = { width: 360, height: 150 } as const;
