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
} from '../../../testing/fakeDom';

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

    // A real event carries both: key is the character (Shift and Caps Lock change it), code is the physical key
    const key = (name: string, code: string): void => window.dispatch('keydown', { key: name, code });

    const release = (name: string, code: string): void => window.dispatch('keyup', { key: name, code });

    beforeEach(() => {
        ({ document, window } = installFakeDom());
        vi.stubGlobal('navigator', { getGamepads: () => [] });
        canvas = new FakeCanvas();
        input = new WebInputService(canvas as unknown as HTMLCanvasElement);
    });

    it('clears one-shot actions after they are read', () => {
        key('e', 'KeyE');

        expect(frame().interact).toBe(true);
        expect(frame().interact).toBe(false);
    });

    it('interacts on the E key whatever it types, e.g. у on a Russian layout', () => {
        key('у', 'KeyE');

        expect(frame().interact).toBe(true);
    });

    it('forgets held keys when the window loses focus, whose keyup never arrives', () => {
        key('w', 'KeyW');
        expect(frame().move.y).toBe(1);

        window.dispatch('blur');

        expect(frame().move.y).toBe(0);
    });

    describe('letting go of a movement key', () => {
        it('stops, with Shift pressed while walking (it comes up as W)', () => {
            key('w', 'KeyW');
            key('Shift', 'ShiftLeft');
            release('W', 'KeyW');
            release('Shift', 'ShiftLeft');

            expect(frame().move.y).toBe(0);
        });

        it('stops, with Shift let go first (it went down as W, comes up as w)', () => {
            key('Shift', 'ShiftLeft');
            key('W', 'KeyW');
            release('Shift', 'ShiftLeft');
            release('w', 'KeyW');

            expect(frame().move.y).toBe(0);
        });

        it('stops, with Caps Lock switched on while walking', () => {
            key('d', 'KeyD');
            key('CapsLock', 'CapsLock');
            release('CapsLock', 'CapsLock');
            release('D', 'KeyD');

            expect(frame().move.x).toBe(0);
        });
    });

    describe('last-used device, for on-screen prompts', () => {
        it('starts on the keyboard', () => {
            expect(input.getLastDevice()).toBe('keyboard');
        });

        it('switches to the pad on a button press, and back on a key', () => {
            const pad = {
                axes: [0, 0, 0, 0],
                buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
            };
            vi.stubGlobal('navigator', { getGamepads: () => [pad] });

            pad.buttons[0].pressed = true;
            frame();
            expect(input.getLastDevice()).toBe('gamepad');

            key('w', 'KeyW');
            expect(input.getLastDevice()).toBe('keyboard');
        });

        it('stays on the keyboard when a connected pad only drifts inside its deadzone', () => {
            vi.stubGlobal('navigator', { getGamepads: () => [{ axes: [0.1, 0, 0.1, 0], buttons: [] }] });

            frame();

            expect(input.getLastDevice()).toBe('keyboard');
        });

        describe('the mouse, while on the pad', () => {
            const mouse = (x: number, y = 0): void => canvas.dispatch('mousemove', { movementX: x, movementY: y });
            let pad: { axes: number[]; buttons: { pressed: boolean }[] };

            beforeEach(() => {
                pad = {
                    axes: [0, 0, 0, 0],
                    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 })),
                };
                vi.stubGlobal('navigator', { getGamepads: () => [pad] });
                frame();
                expect(input.getLastDevice()).toBe('gamepad');
            });

            it('stays on the pad after a bump of the desk', () => {
                mouse(1);
                mouse(0, -2);

                expect(input.getLastDevice()).toBe('gamepad');
            });

            it('switches on a deliberate move, even a slow one made of small steps', () => {
                for (let i = 0; i < 6; i += 1) mouse(2);

                expect(input.getLastDevice()).toBe('keyboard');
            });

            it('switches at once on one big move', () => {
                mouse(20);

                expect(input.getLastDevice()).toBe('keyboard');
            });

            it('starts counting again each time the pad is used', () => {
                mouse(6);
                // Using the pad (a stick push; a held button only counts on its press) sets travel back to 0
                pad.axes[0] = 0.8;
                frame();
                mouse(6);

                expect(input.getLastDevice()).toBe('gamepad');
            });
        });
    });

    it('Escape is both back and the menu button', () => {
        key('Escape', 'Escape');

        const intent = frame();
        expect(intent.back).toBe(true);
        expect(intent.menu).toBe(true);
    });

    it('Backspace is only back', () => {
        key('Backspace', 'Backspace');

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
