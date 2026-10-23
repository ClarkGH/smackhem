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
import NullMenuOverlay from '../platforms/stub/nullMenuOverlay';
import StubInput from '../platforms/stub/stubInput';
import type { PlayerIntent } from '../services/input';

const FIXED_DT = 1 / 60;

describe('pause menu - scenario (stub platform)', () => {
    let input: StubInput;
    let gameState: GameState;
    let gameLoop: GameLoop;
    let overlay: NullMenuOverlay;
    let modeChanges: GameEvent[];

    // One frame: a single press, then render so the overlay sees changes
    const press = (intent: Partial<PlayerIntent>): void => {
        input.setIntent(intent);
        gameLoop.update(FIXED_DT);
        input.reset();
        gameLoop.render();
    };

    const tick = (count: number): void => {
        for (let i = 0; i < count; i += 1) {
            gameLoop.update(FIXED_DT);
        }
        gameLoop.render();
    };

    // Clicks a menu item by its label, as the overlay's hit-test would
    const click = (label: string): void => {
        const index = overlay.lastView?.items.findIndex((item) => item.label === label) ?? -1;
        press({ menuPointer: { index, clicked: true } });
    };

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        globalThis.requestAnimationFrame = () => 0;

        input = new StubInput();
        gameState = createGameState('main_menu');
        overlay = new NullMenuOverlay();
        const eventBus = new TypeSafeEventBus();
        gameLoop = new GameLoop(
            new NullRenderer(),
            input,
            new World(),
            () => 16 / 9,
            eventBus,
            gameState,
            undefined,
            overlay,
        );
        modeChanges = [];
        eventBus.subscribe('game_mode_changed', (e) => { modeChanges.push(e); });

        gameLoop.render();
        // New Game
        press({ interact: true });
    });

    it('opens the pause menu during play', () => {
        press({ menu: true });

        expect(gameState.discrete.isPaused).toBe(true);
        expect(overlay.lastView?.title).toBe('Paused');
    });

    it('freezes the simulation while paused', () => {
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
        press({ menu: true });
        press({ pause: true });

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(gameState.discrete.isTimeFrozen).toBe(false);
    });

    it('resumes into the mode it paused from', () => {
        // The 2D scene
        press({ interact: true });
        expect(gameState.discrete.gameMode).toBe('scene_2d');

        press({ menu: true });
        click('Resume');

        expect(gameState.discrete.isPaused).toBe(false);
        expect(gameState.discrete.gameMode).toBe('scene_2d');
        expect(overlay.lastView).toBeNull();
    });

    it('holds a transition where it was', () => {
        press({ pause: true });
        tick(10);
        const progress = gameState.interpolated.instanceTransitionProgress;

        press({ menu: true });
        tick(30);

        expect(gameState.interpolated.instanceTransitionProgress).toBe(progress);
    });

    describe('quitting', () => {
        const quit = (): void => {
            press({ menu: true });
            click('Quit to Main Menu');
            click('Yes, quit');
            // The reset's mode change is published during a flush and handled on the next
            tick(1);
        };

        it('goes back to the main menu with a fresh game', () => {
            // Walk somewhere and turn first
            input.setIntent({ move: { x: 0, y: 1 }, lookRate: { yaw: 1, pitch: 0 } });
            tick(30);
            input.reset();
            const fresh = createGameState('main_menu');

            quit();

            expect(gameState.discrete).toEqual(fresh.discrete);
            expect(gameState.interpolated).toEqual(fresh.interpolated);
            expect(gameLoop.getRenderCamera().position).toEqual(fresh.interpolated.cameraPosition);
            expect(overlay.lastView?.title).toBe('Smackhem');
            expect(modeChanges.at(-1)).toEqual({
                type: 'game_mode_changed',
                previousMode: 'world_3d',
                currentMode: 'main_menu',
            });
        });

        it('starts the next New Game fresh', () => {
            press({ interact: true }); // Into the 2D scene
            quit();

            press({ interact: true }); // New Game

            expect(gameState.discrete.gameMode).toBe('world_3d');
            expect(gameState.discrete.isPaused).toBe(false);
            expect(gameState.discrete.sceneIsActive).toBe(false);
        });

        it('does not quit on No', () => {
            press({ menu: true });
            click('Quit to Main Menu');
            click('No');

            expect(gameState.discrete.isPaused).toBe(true);
            expect(gameState.discrete.gameMode).toBe('world_3d');
            expect(overlay.lastView?.title).toBe('Paused');
        });
    });
});
