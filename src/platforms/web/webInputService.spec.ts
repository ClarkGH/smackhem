import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import { WebInputService } from './webInputService';
import {
    FakeCanvas,
    installFakeDom,
    type FakeDocument,
    type FakeEventTarget,
} from '../../testing/fakeDom';

describe('WebInputService', () => {
    let document: FakeDocument;
    let window: FakeEventTarget;
    let canvas: FakeCanvas;
    let input: WebInputService;

    // One frame, the way main.ts reads input
    const frame = () => {
        input.update();
        return input.getIntent();
    };

    const key = (name: string): void => window.dispatch('keydown', { key: name });

    beforeEach(() => {
        ({ document, window } = installFakeDom());
        vi.stubGlobal('navigator', { getGamepads: () => [] });
        canvas = new FakeCanvas();
        input = new WebInputService(canvas as unknown as HTMLCanvasElement);
    });

    it('clears one-shot actions after they are read', () => {
        key('e');

        expect(frame().interact).toBe(true);
        expect(frame().interact).toBe(false);
    });

    it('Escape is both back and the menu button', () => {
        key('Escape');

        const intent = frame();
        expect(intent.back).toBe(true);
        expect(intent.menu).toBe(true);
    });

    it('Backspace is only back', () => {
        key('Backspace');

        const intent = frame();
        expect(intent.back).toBe(true);
        expect(intent.menu).toBe(false);
    });

    describe('menu pointer', () => {
        it('a click in a frame is not replaced by a later hover', () => {
            input.pointMenu({ index: 2, clicked: true });
            input.pointMenu({ index: 3, clicked: false });

            expect(frame().menuPointer).toEqual({ index: 2, clicked: true });
        });

        it('a later click replaces an earlier hover', () => {
            input.pointMenu({ index: 3, clicked: false });
            input.pointMenu({ index: 2, clicked: true });

            expect(frame().menuPointer).toEqual({ index: 2, clicked: true });
        });

        it('is handed over once', () => {
            input.pointMenu({ index: 1, clicked: true });
            frame();

            expect(frame().menuPointer).toBeUndefined();
        });

        it('right-click (from the overlay) is back', () => {
            input.pressBack();

            expect(frame().back).toBe(true);
        });
    });

    describe('losing the captured cursor', () => {
        beforeEach(() => {
            // Playing: the world has the cursor
            canvas.dispatch('click');
            expect(document.pointerLockElement).toBe(canvas);
        });

        it('during play counts as the menu button, since the browser may eat that Escape', () => {
            document.exitPointerLock();

            expect(frame().menu).toBe(true);
        });

        it('does not count when a menu released it', () => {
            input.setMenuOpen(true);
            document.exitPointerLock();

            expect(frame().menu).toBe(false);
        });
    });
});
