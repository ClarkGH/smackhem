import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import { TypeSafeEventBus, type GameEvent } from './events';
import { createGameState, type GameState } from './gameState';
import { GameLoop } from './gameLoop';
import { World } from './world';
import NullRenderer from '../platforms/stub/nullRenderer';
import StubInput from '../platforms/stub/stubInput';
import type { PlayerIntent } from '../services/input';
import { createDefaultSettings } from './settings';

const FIXED_DT = 1 / 60;

type ModeChange = Extract<GameEvent, { type: 'game_mode_changed' }>;

describe('game_mode_changed - scenario (stub platform)', () => {
    let input: StubInput;
    let gameState: GameState;
    let gameLoop: GameLoop;
    let modeChanges: Array<Pick<ModeChange, 'previousMode' | 'currentMode'>>;

    // One fixed tick with a single-press intent, released afterwards
    const press = (intent: Partial<PlayerIntent>): void => {
        input.setIntent(intent);
        gameLoop.update(FIXED_DT);
        input.reset();
    };

    const tick = (count: number): void => {
        for (let i = 0; i < count; i += 1) {
            gameLoop.update(FIXED_DT);
        }
    };

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});

        input = new StubInput();
        gameState = createGameState();
        const eventBus = new TypeSafeEventBus();
        gameLoop = new GameLoop(
            new NullRenderer(),
            input,
            new World(),
            () => 16 / 9,
            eventBus,
            gameState,
        );

        modeChanges = [];
        eventBus.subscribe('game_mode_changed', (event) => {
            modeChanges.push({ previousMode: event.previousMode, currentMode: event.currentMode });
        });
    });

    it('publishes entering and leaving the 2D scene', () => {
        press({ interact: true });
        expect(gameState.discrete.gameMode).toBe('scene_2d');

        press({ interact: true });
        expect(gameState.discrete.gameMode).toBe('world_3d');

        expect(modeChanges).toEqual([
            { previousMode: 'world_3d', currentMode: 'scene_2d' },
            { previousMode: 'scene_2d', currentMode: 'world_3d' },
        ]);
    });

    it('publishes entering and leaving the 3D instance', () => {
        press({ pause: true });
        expect(gameState.discrete.gameMode).toBe('instance_3d');

        press({ pause: true });
        // Let the reverse transition finish
        tick(120);
        expect(gameState.discrete.gameMode).toBe('world_3d');

        expect(modeChanges).toEqual([
            { previousMode: 'world_3d', currentMode: 'instance_3d' },
            { previousMode: 'instance_3d', currentMode: 'world_3d' },
        ]);
    });

    it('stays in the instance until the exit transition finishes', () => {
        press({ pause: true });
        tick(120);

        press({ pause: true });
        expect(gameState.discrete.instanceIsTransitioning).toBe(true);
        expect(gameState.discrete.gameMode).toBe('instance_3d');
        expect(modeChanges).toHaveLength(1);
    });

    it('cannot enter the 2D scene while leaving the instance', () => {
        press({ pause: true });
        tick(120);

        press({ pause: true });
        press({ interact: true });

        expect(gameState.discrete.gameMode).not.toBe('scene_2d');
    });
});

describe('reduced motion - scenario (stub platform)', () => {
    const createLoop = (reducedMotion: boolean) => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const input = new StubInput();
        const gameState = createGameState();
        const settings = createDefaultSettings();
        settings.reducedMotion = reducedMotion;
        const gameLoop = new GameLoop(
            new NullRenderer(),
            input,
            new World(),
            () => 16 / 9,
            new TypeSafeEventBus(),
            gameState,
            undefined,
            undefined,
            settings,
        );
        const press = (intent: Partial<PlayerIntent>): void => {
            input.setIntent(intent);
            gameLoop.update(FIXED_DT);
            input.reset();
        };
        const tick = (count: number): void => {
            for (let i = 0; i < count; i += 1) gameLoop.update(FIXED_DT);
        };
        return {
            input, gameState, gameLoop, press, tick,
        };
    };

    it('enters and leaves the instance within a couple of ticks', () => {
        const { gameState, press, tick } = createLoop(true);

        press({ pause: true });
        tick(1);
        expect(gameState.discrete.instanceIsActive).toBe(true);

        press({ pause: true });
        tick(1);
        expect(gameState.discrete.gameMode).toBe('world_3d');
    });

    it('takes most of a second without it', () => {
        const { gameState, press, tick } = createLoop(false);

        press({ pause: true });
        tick(1);
        expect(gameState.discrete.instanceIsActive).toBe(false);
    });

    it('levels the camera at once on entering the instance', () => {
        const {
            input, gameState, gameLoop, press,
        } = createLoop(true);

        // Look down a little first
        input.setIntent({ lookRate: { yaw: 0, pitch: 1 } });
        gameLoop.update(FIXED_DT * 10);
        input.reset();
        expect(gameState.interpolated.cameraPitch).not.toBe(0);

        press({ pause: true });

        expect(gameState.interpolated.cameraPitch).toBe(0);
        expect(gameState.discrete.isTransitioningPitch).toBe(false);
    });

    it('opens the 2D scene in one tick', () => {
        const { gameState, press } = createLoop(true);

        press({ interact: true });

        expect(gameState.discrete.gameMode).toBe('scene_2d');
        expect(gameState.discrete.sceneIsActive).toBe(true);
    });
});
