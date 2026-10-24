import { vi } from 'vitest';
import { TypeSafeEventBus } from '../core/events';
import { createGameState, type GameMode, type GameState } from '../core/gameState';
import { FIXED_DT, GameLoop } from '../core/gameLoop';
import { createDefaultSettings, type Settings } from '../core/settings/settings';
import type { DebugSettings } from '../core/settings/debugSettings';
import { World } from '../core/world';
import NullRenderer from '../platforms/stub/nullRenderer';
import NullMenuOverlay from '../platforms/stub/nullMenuOverlay';
import StubInput from '../platforms/stub/stubInput';
import type { DisplayCapabilities } from '../services/display';
import type { PlayerIntent } from '../services/input';

export { FIXED_DT };

/**
 * Scenario harness: the real GameLoop on the stub platform, stepped one fixed tick per frame.
 *
 * Timing rules worth knowing:
 * - A frame runs update() then render(), like main.ts.
 * - Events are flushed once, at the end of update(). Requests published while handling an event
 *   (e.g. modeAudio reacting to game_mode_changed) are handled on the next frame's flush.
 * - StubInput clears edge actions (interact, back, menu, ...) once read, like the web input service,
 *   so press() is a single press.
 */
export interface Scenario {
    input: StubInput;
    gameState: GameState;
    gameLoop: GameLoop;
    eventBus: TypeSafeEventBus;
    overlay: NullMenuOverlay;
    renderer: NullRenderer;
    settings: Settings;
    // One frame with these inputs. Edge actions are pressed once, held ones (move, lookRate) stay set.
    press: (intent: Partial<PlayerIntent>) => void;
    // Frames of exactly one fixed tick each
    tick: (count?: number) => void;
    // One frame of any length, for testing frames that run zero or several ticks
    frame: (seconds: number) => void;
    // Clicks a visible menu item by its label, as the overlay's hit-test would
    click: (label: string) => void;
}

export interface ScenarioOptions {
    mode?: GameMode;
    settings?: Settings;
    displayCapabilities?: DisplayCapabilities;
    debugSettings?: DebugSettings;
}

export const createScenario = (options: ScenarioOptions = {}): Scenario => {
    // GameLoop logs every mode change
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const input = new StubInput();
    const gameState = createGameState(options.mode);
    const eventBus = new TypeSafeEventBus();
    const overlay = new NullMenuOverlay();
    const settings = options.settings ?? createDefaultSettings();
    const renderer = new NullRenderer();
    const gameLoop = new GameLoop({
        renderer,
        input,
        world: new World(),
        getAspectRatio: () => 16 / 9,
        eventBus,
        gameState,
        menuOverlay: overlay,
        settings,
        displayCapabilities: options.displayCapabilities,
        debugSettings: options.debugSettings,
    });
    // Like the first frame in main.ts, so the overlay starts with the menu (if any)
    gameLoop.render();

    const frame = (seconds: number): void => {
        gameLoop.update(seconds);
        gameLoop.render();
    };

    const tick = (count = 1): void => {
        for (let i = 0; i < count; i += 1) frame(FIXED_DT);
    };

    const press = (intent: Partial<PlayerIntent>): void => {
        input.setIntent(intent);
        tick();
    };

    const click = (label: string): void => {
        const index = overlay.lastView?.items.findIndex((item) => item.label === label) ?? -1;
        if (index < 0) throw new Error(`No menu item "${label}" on screen`);
        press({ menuPointer: { index, clicked: true } });
    };

    return {
        input, gameState, gameLoop, eventBus, overlay, renderer, settings, press, tick, frame, click,
    };
};
