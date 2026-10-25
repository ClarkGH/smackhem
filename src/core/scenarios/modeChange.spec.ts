import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import type { GameEvent } from '../events';
import { createDefaultSettings } from '../settings/settings';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';

type ModeChange = Extract<GameEvent, { type: 'game_mode_changed' }>;

describe('game_mode_changed - scenario (stub platform)', () => {
    let scenario: Scenario;
    let modeChanges: Array<Pick<ModeChange, 'previousMode' | 'currentMode'>>;

    beforeEach(() => {
        scenario = createScenario({ debugSettings: createDebugSettings() });
        modeChanges = [];
        scenario.eventBus.subscribe('game_mode_changed', (event) => {
            modeChanges.push({ previousMode: event.previousMode, currentMode: event.currentMode });
        });
    });

    it('publishes entering and leaving the 2D scene', () => {
        const { gameState, press, enterScene } = scenario;

        enterScene();
        expect(gameState.discrete.gameMode).toBe('scene_2d');

        press({ interact: true });
        expect(gameState.discrete.gameMode).toBe('world_3d');

        expect(modeChanges).toEqual([
            { previousMode: 'world_3d', currentMode: 'scene_2d' },
            { previousMode: 'scene_2d', currentMode: 'world_3d' },
        ]);
    });

    it('publishes entering and leaving the 3D instance', () => {
        const { gameState, press, tick } = scenario;

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
        const { gameState, press, tick } = scenario;

        press({ pause: true });
        tick(120);

        press({ pause: true });
        expect(gameState.discrete.instanceIsTransitioning).toBe(true);
        expect(gameState.discrete.gameMode).toBe('instance_3d');
        expect(modeChanges).toHaveLength(1);
    });

    it('cannot enter the 2D scene while leaving the instance', () => {
        const {
            gameState, press, tick, enterScene,
        } = scenario;

        press({ pause: true });
        tick(120);

        press({ pause: true });
        expect(gameState.discrete.instanceIsTransitioning).toBe(true);
        enterScene();

        expect(gameState.discrete.gameMode).not.toBe('scene_2d');
    });

    it('does not enter the 2D scene on interact', () => {
        const { gameState, press } = scenario;

        press({ interact: true });

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(modeChanges).toEqual([]);
    });
});

describe('reduced motion - scenario (stub platform)', () => {
    const createReducedMotion = (reducedMotion: boolean): Scenario => {
        const settings = createDefaultSettings();
        settings.reducedMotion = reducedMotion;
        return createScenario({ settings, debugSettings: createDebugSettings() });
    };

    it('enters and leaves the instance within a couple of ticks', () => {
        const { gameState, press, tick } = createReducedMotion(true);

        press({ pause: true });
        tick(1);
        expect(gameState.discrete.instanceIsActive).toBe(true);

        press({ pause: true });
        tick(1);
        expect(gameState.discrete.gameMode).toBe('world_3d');
    });

    it('takes most of a second without it', () => {
        const { gameState, press, tick } = createReducedMotion(false);

        press({ pause: true });
        tick(1);
        expect(gameState.discrete.instanceIsActive).toBe(false);
    });

    it('levels the camera at once on entering the instance', () => {
        const {
            input, gameState, press, tick,
        } = createReducedMotion(true);

        // Look down a little first
        input.setIntent({ lookRate: { yaw: 0, pitch: 1 } });
        tick(10);
        input.reset();
        expect(gameState.interpolated.cameraPitch).not.toBe(0);

        press({ pause: true });

        expect(gameState.interpolated.cameraPitch).toBe(0);
        expect(gameState.discrete.isTransitioningPitch).toBe(false);
    });

    it('opens the 2D scene in one tick', () => {
        const { gameState, enterScene } = createReducedMotion(true);

        enterScene();

        expect(gameState.discrete.gameMode).toBe('scene_2d');
        expect(gameState.discrete.sceneIsActive).toBe(true);
    });
});
