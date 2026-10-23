export interface MenuItemView {
    label: string;
    // Current value for setting rows, e.g. '0.8' or 'On'
    value?: string;
    // Value can be stepped with navigate.x or the < > arrows
    adjustable: boolean;
    // Shown but can't be chosen, e.g. Continue with no saves
    disabled: boolean;
}

/**
 * Declarative description of the open menu, built by core and drawn by the overlay.
 * Rebuilt only when the menu changes, never per frame (M-1).
 */
export interface MenuView {
    title: string;
    items: MenuItemView[];
    selected: number;
    textScale: number;
}

/**
 * Menu overlay interface
 * Draws the menu core describes. It also hit-tests what it drew and reports
 * mouse hover and clicks back as a menuPointer intent, so core never sees coordinates.
 */
export interface MenuOverlay {
    // null hides the overlay
    render(view: MenuView | null): void;
}
