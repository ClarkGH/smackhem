import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import type { GameEvent } from '../events';
import { createGameState } from '../gameState';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';

describe('pause menu - scenario (stub platform)', () => {
    let scenario: Scenario;
    let modeChanges: GameEvent[];

    beforeEach(() => {
        scenario = createScenario({ mode: 'main_menu', debugSettings: createDebugSettings() });
        modeChanges = [];
        scenario.eventBus.subscribe('game_mode_changed', (e) => { modeChanges.push(e); });
        // New Game
        scenario.press({ interact: true });
    });

    it('opens the pause menu during play', () => {
        scenario.press({ menu: true });

        expect(scenario.gameState.discrete.isPaused).toBe(true);
        expect(scenario.overlay.lastView?.title).toBe('Paused');
    });

    it('freezes the simulation while paused', () => {
        const {
            input, gameState, press, tick,
        } = scenario;
        press({ menu: true });
        const time = gameState.interpolated.simulationTime;
        const position = { ...gameState.interpolated.cameraPosition };

        input.setIntent({ move: { x: 0, y: 1 }, lookRate: { yaw: 1, pitch: 0 } });
        tick(30);
        input.reset();

        expect(gameState.interpolated.simulationTime).toBe(time);
        expect(gameState.interpolated.cameraPosition).toEqual(position);
        expect(gameState.interpolated.cameraYaw).toBe(0);
    });

    it('ignores the instance toggle while paused', () => {
        scenario.press({ menu: true });
        scenario.press({ pause: true });

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(scenario.gameState.discrete.instanceIsOpen).toBe(false);
    });

    it('resumes into the mode it paused from', () => {
        const {
            gameState, overlay, press, click, enterScene,
        } = scenario;
        enterScene();
        expect(gameState.discrete.gameMode).toBe('scene_2d');

        press({ menu: true });
        click('Resume');

        expect(gameState.discrete.isPaused).toBe(false);
        expect(gameState.discrete.gameMode).toBe('scene_2d');
        expect(overlay.lastView).toBeNull();
    });

    it('holds a transition where it was', () => {
        const { gameState, press, tick } = scenario;
        press({ pause: true });
        tick(10);
        const progress = gameState.interpolated.instanceTransitionProgress;

        press({ menu: true });
        tick(30);

        expect(gameState.interpolated.instanceTransitionProgress).toBe(progress);
    });

    describe('quitting', () => {
        const quit = (): void => {
            scenario.press({ menu: true });
            scenario.click('Quit to Main Menu');
            scenario.click('Yes, quit');
            // The reset's mode change is published during a flush and handled on the next
            scenario.tick();
        };

        it('goes back to the main menu with a fresh game', () => {
            const {
                input, gameState, gameLoop, overlay, tick,
            } = scenario;
            // Walk somewhere and turn first
            input.setIntent({ move: { x: 0, y: 1 }, lookRate: { yaw: 1, pitch: 0 } });
            tick(30);
            input.reset();
            const fresh = createGameState('main_menu');

            quit();

            expect(gameState.discrete).toEqual(fresh.discrete);
            expect(gameState.interpolated).toEqual(fresh.interpolated);
            expect(gameState.timeOfDay).toBe(fresh.timeOfDay);
            expect(gameLoop.getRenderCamera().position).toEqual(fresh.interpolated.cameraPosition);
            expect(overlay.lastView?.title).toBe('Smackhem');
            expect(modeChanges.at(-1)).toEqual({
                type: 'game_mode_changed',
                previousMode: 'world_3d',
                currentMode: 'main_menu',
            });
        });

        it('starts the next New Game fresh', () => {
            const { gameState, press, enterScene } = scenario;
            enterScene();
            expect(gameState.discrete.gameMode).toBe('scene_2d');
            quit();

            press({ interact: true }); // New Game

            expect(gameState.discrete.gameMode).toBe('world_3d');
            expect(gameState.discrete.isPaused).toBe(false);
            expect(gameState.discrete.sceneIsTransitioning).toBe(false);
            expect(gameState.interpolated.sceneTransitionProgress).toBe(0);
        });

        it('does not quit on No', () => {
            const {
                gameState, overlay, press, click,
            } = scenario;
            press({ menu: true });
            click('Quit to Main Menu');
            click('No');

            expect(gameState.discrete.isPaused).toBe(true);
            expect(gameState.discrete.gameMode).toBe('world_3d');
            expect(overlay.lastView?.title).toBe('Paused');
        });
    });
});
