import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import WebMenuOverlay, { type MenuOverlayInput } from './webMenuOverlay';
import type { MenuItemView, MenuView } from '../../services/menuOverlay';
import {
    CHAR_WIDTH,
    FakeCanvas,
    FakeElement,
    installFakeDom,
    type DrawnText,
    type FakeDocument,
} from '../../testing/fakeDom';

const item = (label: string, extra: Partial<MenuItemView> = {}): MenuItemView => ({
    label, adjustable: false, disabled: false, ...extra,
});

const settingsView: MenuView = {
    title: 'Settings',
    items: [
        item('Master Volume', { value: '100%', adjustable: true }),
        item('Invert Mouse Y', { value: 'Off', adjustable: true }),
        item('Back'),
    ],
    selected: 0,
    textScale: 1,
};

describe('WebMenuOverlay', () => {
    let document: FakeDocument;
    let canvas: FakeCanvas;
    let overlay: WebMenuOverlay;
    let overlayCanvas: FakeCanvas;
    let input: { [K in keyof MenuOverlayInput]: ReturnType<typeof vi.fn> };

    const drawn = (): DrawnText[] => overlayCanvas.ctx.drawn;

    // Where a character of a drawn line is, in page coordinates (the overlay isn't scaled here).
    // Uses its last occurrence: '>' is both the selection marker and the value arrow.
    const charPosition = (line: string, char: string): { clientX: number; clientY: number } => {
        const text = drawn().find((d) => d.text.includes(line));
        if (!text) throw new Error(`"${line}" was not drawn`);
        return {
            clientX: text.x + text.text.lastIndexOf(char) * CHAR_WIDTH + CHAR_WIDTH / 2,
            clientY: text.y + 5,
        };
    };

    beforeEach(() => {
        ({ document } = installFakeDom());
        const container = new FakeElement();
        canvas = new FakeCanvas();
        canvas.width = 800;
        canvas.height = 600;
        container.appendChild(canvas);
        input = { pointer: vi.fn(), back: vi.fn(), opened: vi.fn() };

        overlay = new WebMenuOverlay(canvas as unknown as HTMLCanvasElement, input as unknown as MenuOverlayInput);
        overlayCanvas = document.created[0] as FakeCanvas;
    });

    it('sits inside the game canvas container, so fullscreen takes it along', () => {
        expect(overlayCanvas.parentElement).toBe(canvas.parentElement);
    });

    it('tells the input service when it opens and closes', () => {
        overlay.render(settingsView);
        overlay.render(null);

        expect(input.opened.mock.calls).toEqual([[true], [false]]);
        expect(overlayCanvas.style.display).toBe('none');
    });

    it('releases the captured cursor when a menu opens', () => {
        canvas.requestPointerLock();

        overlay.render(settingsView);

        expect(document.pointerLockElement).toBeNull();
    });

    it('draws the title, items and the selection marker', () => {
        overlay.render(settingsView);
        const texts = drawn().map((d) => d.text);

        expect(texts).toContain('Settings');
        expect(texts).toContain('> Master Volume   < 100% >');
        expect(texts).toContain('  Back');
    });

    describe('mouse', () => {
        beforeEach(() => {
            overlay.render(settingsView);
            input.opened.mockClear();
        });

        it('clicking the drawn < and > steps the value', () => {
            overlayCanvas.dispatch('click', charPosition('Master Volume', '<'));
            overlayCanvas.dispatch('click', charPosition('Master Volume', '>'));

            expect(input.pointer.mock.calls).toEqual([
                [{ index: 0, clicked: false, step: -1 }],
                [{ index: 0, clicked: false, step: 1 }],
            ]);
        });

        it('clicking elsewhere on a row chooses it', () => {
            overlayCanvas.dispatch('click', charPosition('Back', 'B'));

            expect(input.pointer).toHaveBeenCalledWith({ index: 2, clicked: true, step: undefined });
        });

        it('reports hover only when it moves to another item', () => {
            overlayCanvas.dispatch('mousemove', charPosition('Invert Mouse Y', 'I'));
            overlayCanvas.dispatch('mousemove', charPosition('Invert Mouse Y', 'M'));
            overlayCanvas.dispatch('mousemove', charPosition('Back', 'B'));

            expect(input.pointer.mock.calls).toEqual([
                [{ index: 1, clicked: false }],
                [{ index: 2, clicked: false }],
            ]);
        });

        it('ignores clicks outside the items', () => {
            overlayCanvas.dispatch('click', { clientX: 400, clientY: 590 });

            expect(input.pointer).not.toHaveBeenCalled();
        });

        it('right-click is back, without the browser menu', () => {
            const preventDefault = vi.fn();

            overlayCanvas.dispatch('contextmenu', { preventDefault });

            expect(input.back).toHaveBeenCalledOnce();
            expect(preventDefault).toHaveBeenCalled();
        });
    });

    describe('scrolling a list that does not fit', () => {
        const longView = (selected: number): MenuView => ({
            title: 'Settings',
            items: Array.from({ length: 30 }, (_, i) => item(`Item ${i}`)),
            selected,
            textScale: 1,
        });

        it('draws only the rows that fit, with a marker for the rest', () => {
            overlay.render(longView(0));
            const texts = drawn().map((d) => d.text);

            expect(texts).toContain('> Item 0');
            expect(texts).not.toContain('  Item 29');
            expect(texts).toContain('  ...');
        });

        it('scrolls to keep the selection on screen', () => {
            overlay.render(longView(29));
            const texts = drawn().map((d) => d.text);

            expect(texts).toContain('> Item 29');
            expect(texts).not.toContain('  Item 0');
        });

        it('hidden rows cannot be clicked', () => {
            overlay.render(longView(29));
            const first = drawn().find((d) => d.text.includes('Item'));

            overlayCanvas.dispatch('click', { clientX: (first?.x ?? 0) + 20, clientY: (first?.y ?? 0) + 5 });

            // Whatever was clicked is a visible row, never item 0
            expect(input.pointer).not.toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
        });
    });
});
