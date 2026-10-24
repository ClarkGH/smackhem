import { describe, it, expect } from 'vitest';
import {
    hitTestMenu,
    scrollToSelection,
    toBufferCoords,
    type MenuItemRects,
} from './menuHitTest';

describe('menu hit-test', () => {
    it('converts mouse position to buffer pixels when the overlay is shown scaled', () => {
        // An 800x600 drawing buffer shown at 400x300, 10px from the page's corner
        const bounds = {
            left: 10, top: 10, width: 400, height: 300,
        };

        expect(toBufferCoords(210, 160, bounds, 800, 600)).toEqual({ x: 400, y: 300 });
        expect(toBufferCoords(10, 10, bounds, 800, 600)).toEqual({ x: 0, y: 0 });
    });

    const rows: MenuItemRects[] = [
        {
            row: {
                x: 0, y: 100, width: 800, height: 40,
            },
        },
        {
            row: {
                x: 0, y: 140, width: 800, height: 40,
            },
            decrease: {
                x: 300, y: 140, width: 30, height: 40,
            },
            increase: {
                x: 400, y: 140, width: 30, height: 40,
            },
        },
    ];

    it('finds the row under the pointer', () => {
        expect(hitTestMenu(rows, 50, 120)).toEqual({ index: 0 });
        expect(hitTestMenu(rows, 700, 150)).toEqual({ index: 1 });
    });

    it('prefers the arrows over the row they sit in', () => {
        expect(hitTestMenu(rows, 310, 150)).toEqual({ index: 1, step: -1 });
        expect(hitTestMenu(rows, 410, 150)).toEqual({ index: 1, step: 1 });
    });

    it('misses outside every row', () => {
        expect(hitTestMenu(rows, 50, 50)).toBeNull();
        expect(hitTestMenu(rows, 50, 180)).toBeNull();
    });
});

describe('menu scrolling', () => {
    it('never scrolls a list that fits', () => {
        expect(scrollToSelection(0, 3, 11, 4)).toBe(0);
    });

    it('scrolls just enough to keep the selection on screen', () => {
        // 11 items, 8 rows: selecting item 9 shows items 2-9
        expect(scrollToSelection(0, 9, 8, 11)).toBe(2);
        // Back up to item 1 shows items 1-8
        expect(scrollToSelection(2, 1, 8, 11)).toBe(1);
    });

    it('does not move when the selection is already visible', () => {
        expect(scrollToSelection(2, 5, 8, 11)).toBe(2);
        expect(scrollToSelection(2, 9, 8, 11)).toBe(2);
    });

    it('wrapping to the first or last item jumps the window with it', () => {
        expect(scrollToSelection(3, 0, 8, 11)).toBe(0);
        expect(scrollToSelection(0, 10, 8, 11)).toBe(3);
    });
});
