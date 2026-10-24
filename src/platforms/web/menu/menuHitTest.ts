export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Where one menu item was drawn, in the overlay's drawing-buffer pixels
export interface MenuItemRects {
    row: Rect;
    // The < and > arrows, only on value rows
    decrease?: Rect;
    increase?: Rect;
}

export interface MenuHit {
    index: number;
    step?: -1 | 1;
}

const contains = (rect: Rect, x: number, y: number): boolean => x >= rect.x
    && x < rect.x + rect.width
    && y >= rect.y
    && y < rect.y + rect.height;

/**
 * Mouse position (CSS pixels) to drawing-buffer pixels.
 * The overlay can be drawn at one size and shown at another, so scale by the ratio.
 */
export const toBufferCoords = (
    clientX: number,
    clientY: number,
    bounds: { left: number; top: number; width: number; height: number },
    bufferWidth: number,
    bufferHeight: number,
): { x: number; y: number } => ({
    x: ((clientX - bounds.left) * bufferWidth) / bounds.width,
    y: ((clientY - bounds.top) * bufferHeight) / bounds.height,
});

// Arrows are checked first, they sit inside their row
export const hitTestMenu = (items: MenuItemRects[], x: number, y: number): MenuHit | null => {
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.decrease && contains(item.decrease, x, y)) return { index: i, step: -1 };
        if (item.increase && contains(item.increase, x, y)) return { index: i, step: 1 };
        if (contains(item.row, x, y)) return { index: i };
    }
    return null;
};

/**
 * First visible item of a list that doesn't fit. Moves only as far as needed to keep the
 * selection on screen, so selecting a row that's already visible (e.g. by hover) never scrolls.
 */
export const scrollToSelection = (
    firstVisible: number,
    selected: number,
    visibleRows: number,
    itemCount: number,
): number => {
    let first = firstVisible;
    if (selected < first) first = selected;
    if (selected >= first + visibleRows) first = selected - visibleRows + 1;
    return Math.max(0, Math.min(first, itemCount - visibleRows));
};
