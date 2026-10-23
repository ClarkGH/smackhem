import { World } from './core/world';
import { GameLoop, type DebugHUD } from './core/gameLoop';
import { TypeSafeEventBus } from './core/events';
import AudioSystem from './core/audioSystem';
import { AMBIENT_SOUND, MODE_CHANGE_SOUND, subscribeModeAudio } from './core/modeAudio';
import { MENU_SELECT_SOUND } from './core/menuSystem';
import { createGameState, type GameState } from './core/gameState';
import {
    parseSettings,
    serializeSettings,
    SETTINGS_STORAGE_KEY,
    type Settings,
} from './core/settings';
import { bindDisplay } from './core/displaySettings';
import { createCamera } from './core/camera';
import type { AudioCategory } from './services/audio';
import type { PlatformServices } from './services/platform';
import type { Renderer } from './services/renderer';
import type { Vec3 } from './types/common';

// Loads and unloads world chunks around the player, provided by each platform
export type ChunkUpdater = (
    world: World,
    playerPosition: Vec3,
    renderer: Renderer,
    assetLoader?: any,
) => Promise<void>;

export interface GameSetup {
    platform: PlatformServices;
    updateChunks: ChunkUpdater;
    // Web only, where chunks come from JSON files
    assetLoader?: unknown;
    debugHUD?: DebugHUD;
}

export interface Game {
    // One turn of the main loop: input, simulation, chunk streaming, render
    frame: () => void;
    gameLoop: GameLoop;
    gameState: GameState;
    eventBus: TypeSafeEventBus;
    settings: Settings;
    world: World;
}

/**
 * Wires a game together on any platform. main.ts runs it on the web every animation frame,
 * and tests run it on the stub platform, so the wiring itself is tested.
 */
export const createGame = async ({
    platform,
    updateChunks,
    assetLoader,
    debugHUD,
}: GameSetup): Promise<Game> => {
    const world = new World();
    const eventBus = new TypeSafeEventBus();
    const audioSystem = new AudioSystem(platform.audio, eventBus);

    // Saved settings over the defaults, saved again whenever the menu changes one
    const settings = parseSettings(platform.storage.get(SETTINGS_STORAGE_KEY));
    eventBus.subscribe('settings_changed', () => {
        platform.storage.set(SETTINGS_STORAGE_KEY, serializeSettings(settings));
    });
    // Render scale and window size apply now, fullscreen follows the platform
    bindDisplay(eventBus, settings, platform.display);
    // Saved volumes reach the mix buses on the first flush
    (Object.keys(settings.volume) as AudioCategory[]).forEach((category) => {
        eventBus.publish({ type: 'audio_bus_volume_changed', category, volume: settings.volume[category] });
    });

    // Missing audio files are not fatal, the game runs silent (see README)
    const preloads = await Promise.allSettled([
        audioSystem.preload(AMBIENT_SOUND, 'ambient'),
        audioSystem.preload(MODE_CHANGE_SOUND, 'sfx'),
        audioSystem.preload(MENU_SELECT_SOUND, 'ui'),
    ]);
    preloads.forEach((result) => {
        if (result.status === 'rejected') console.error('Failed to preload audio:', result.reason);
    });

    // The ambience starts on New Game, when the mode changes to world_3d
    subscribeModeAudio(eventBus);

    // Boots into the start-up menu, the world renders frozen behind it
    const gameState = createGameState('main_menu');

    // Chunks around the starting position, before the first frame
    await updateChunks(world, createCamera().position, platform.renderer, assetLoader);

    const gameLoop = new GameLoop({
        renderer: platform.renderer,
        input: platform.input,
        world,
        getAspectRatio: platform.getAspectRatio,
        eventBus,
        gameState,
        debugHUD,
        menuOverlay: platform.menu,
        settings,
        displayCapabilities: platform.display.capabilities(),
    });

    const frame = (): void => {
        platform.clock.update();
        platform.input.update();
        gameLoop.update(platform.clock.getDeltaTime());

        // Chunk loading/unloading follows the player
        updateChunks(world, gameLoop.getCameraPosition(), platform.renderer, assetLoader).catch((error) => {
            console.error('Error updating chunks:', error);
        });

        gameLoop.render();
    };

    return {
        frame, gameLoop, gameState, eventBus, settings, world,
    };
};

export default createGame;
