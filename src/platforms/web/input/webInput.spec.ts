import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
} from 'vitest';
import { createInputState, type InputState } from '../../../core/input';
import { createWebInputState, syncWebInput, type WebInputState } from './webInput';

// Browser "standard" layout: axes [leftX, leftY, rightX, rightY], 17 buttons
interface FakePad {
    axes: number[];
    buttons: { pressed: boolean }[];
}

const createPad = (): FakePad => ({
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
});

describe('web gamepad mapping', () => {
    let pad: FakePad;
    let core: InputState;
    let web: WebInputState;

    // One frame: sync, then clear the edge flags the way getIntent does
    const frame = (): InputState => {
        syncWebInput(core, web);
        const snapshot = JSON.parse(JSON.stringify(core)) as InputState;
        core.actions.Interact = false;
        core.actions.Back = false;
        core.actions.Pause = false;
        core.actions.Menu = false;
        core.navigate.x = 0;
        core.navigate.y = 0;
        return snapshot;
    };

    beforeEach(() => {
        pad = createPad();
        core = createInputState();
        web = createWebInputState();
        vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('maps A to interact, B to back and Y to the instance toggle', () => {
        pad.buttons[0].pressed = true;
        pad.buttons[1].pressed = true;
        pad.buttons[3].pressed = true;

        const state = frame();

        expect(state.actions.Interact).toBe(true);
        expect(state.actions.Back).toBe(true);
        expect(state.actions.Pause).toBe(true);
    });

    it('maps Start to the menu button', () => {
        pad.buttons[9].pressed = true;

        expect(frame().actions.Menu).toBe(true);
        expect(frame().actions.Menu).toBe(false);
    });

    it('acts on the press, not while the button is held', () => {
        pad.buttons[0].pressed = true;
        expect(frame().actions.Interact).toBe(true);
        expect(frame().actions.Interact).toBe(false);

        pad.buttons[0].pressed = false;
        frame();
        pad.buttons[0].pressed = true;
        expect(frame().actions.Interact).toBe(true);
    });

    it('steps menus with the D-pad, up is +1', () => {
        pad.buttons[12].pressed = true;
        expect(frame().navigate.y).toBe(1);

        pad.buttons[12].pressed = false;
        pad.buttons[15].pressed = true;
        expect(frame().navigate.x).toBe(1);
    });

    it('steps menus once per left stick push', () => {
        // Stick up is negative on the axis
        pad.axes[1] = -0.9;
        expect(frame().navigate.y).toBe(1);
        expect(frame().navigate.y).toBe(0);

        pad.axes[1] = 0;
        frame();
        pad.axes[1] = 0.9;
        expect(frame().navigate.y).toBe(-1);
    });

    it('sends the right stick as a turn rate, not as mouse movement', () => {
        pad.axes[2] = 0.8;
        web.axes.mouseLookX = 12;

        const state = frame();

        expect(state.axes.lookRateX).toBeCloseTo(0.8);
        expect(state.axes.lookX).toBe(12);
    });

    it('ignores stick drift inside the deadzone', () => {
        pad.axes[2] = 0.1;
        pad.axes[0] = 0.1;

        const state = frame();

        expect(state.axes.lookRateX).toBe(0);
        expect(state.axes.moveX).toBe(0);
    });
});
