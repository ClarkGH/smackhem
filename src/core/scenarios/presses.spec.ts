import { describe, it, expect } from 'vitest';
import { createScenario, FIXED_DT } from '../../testing/scenario';

// Keeps float error from dropping the tick a frame completes
const EPSILON = 1e-9;

// Above 60Hz some frames run no tick: half a tick, then the frame that completes it
describe('presses on a frame that runs no tick - scenario (stub platform)', () => {
    it('still open the pause menu', () => {
        const { input, gameState, frame } = createScenario({ mode: 'world_3d' });

        input.setIntent({ menu: true });
        frame(FIXED_DT / 2);
        frame(FIXED_DT / 2 + EPSILON);

        expect(gameState.discrete.isPaused).toBe(true);
    });

    it('still choose in a menu', () => {
        const { input, gameState, frame } = createScenario({ mode: 'main_menu' });

        // New Game
        input.setIntent({ interact: true });
        frame(FIXED_DT / 2);
        frame(FIXED_DT / 2 + EPSILON);

        expect(gameState.discrete.gameMode).toBe('world_3d');
    });

    it('are used once, not again on the next tick', () => {
        const {
            input, gameState, frame, tick,
        } = createScenario({ mode: 'world_3d' });

        input.setIntent({ menu: true });
        frame(FIXED_DT / 2);
        frame(FIXED_DT / 2 + EPSILON);
        // A second menu press would resume
        tick(2);

        expect(gameState.discrete.isPaused).toBe(true);
    });

    it('keep a menu step when the next frame steps nowhere, as the web sends every frame', () => {
        const { input, overlay, frame } = createScenario({ mode: 'main_menu' });
        const start = overlay.lastView?.selected;

        input.setIntent({ navigate: { x: 0, y: -1 } });
        frame(FIXED_DT / 2);
        input.setIntent({ navigate: { x: 0, y: 0 } });
        frame(FIXED_DT / 2 + EPSILON);

        expect(overlay.lastView?.selected).not.toBe(start);
    });

    it('keep a click when the next frame only hovers', () => {
        const {
            input, overlay, gameState, frame,
        } = createScenario({ mode: 'main_menu' });
        const newGame = overlay.lastView?.items.findIndex((item) => item.label === 'New Game') ?? -1;

        input.setIntent({ menuPointer: { index: newGame, clicked: true } });
        frame(FIXED_DT / 2);
        input.setIntent({ menuPointer: { index: newGame + 1, clicked: false } });
        frame(FIXED_DT / 2 + EPSILON);

        expect(gameState.discrete.gameMode).toBe('world_3d');
    });
});
