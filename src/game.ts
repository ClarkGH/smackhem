import { World } from './core/world';
import { GameLoop, type DebugHUD } from './core/gameLoop';
import { TypeSafeEventBus } from './core/events';
import AudioSystem from './core/audio/audioSystem';
import { AMBIENT_SOUND, MODE_CHANGE_SOUND, subscribeModeAudio } from './core/audio/modeAudio';
import { MENU_SELECT_SOUND } from './core/menu/menuSystem';
import { createGameState, type GameState } from './core/gameState';
import {
    parseSettings,
    serializeSettings,
    SETTINGS_STORAGE_KEY,
    type Settings,
} from './core/settings/settings';
import { bindDisplay } from './core/settings/displaySettings';
import { createCamera } from './core/camera';
import type { DebugSettings } from './core/settings/debugSettings';
import type { AudioCategory } from './services/audio';
import type { PlatformServices } from './services/platform';
import type { ChunkUpdater } from './core/chunkStreamer';

export interface GameSetup {
    platform: PlatformServices;
    updateChunks: ChunkUpdater;
    debugHUD?: DebugHUD;
    // Adds the pause menu's Debug screen
    debugSettings?: DebugSettings;
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
    debugHUD,
    debugSettings,
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
    const start = createCamera().position;
    await updateChunks(world, start, platform.renderer);
    // The chunk streamed around last, compared as plain numbers every frame (M-1)
    let streamedChunkX = World.getChunkIndex(start.x);
    let streamedChunkZ = World.getChunkIndex(start.z);

    const gameLoop = new GameLoop({
        renderer: platform.renderer,
        input: platform.input,
        world,
        getAspectRatio: platform.getAspectRatio,
        eventBus,
        gameState,
        debugHUD,
        menuOverlay: platform.menu,
        speechOverlay: platform.speech,
        promptOverlay: platform.prompt,
        battleOverlay: platform.battle,
        settings,
        displayCapabilities: platform.display.capabilities(),
        debugSettings,
    });

    const frame = (): void => {
        platform.clock.update();
        platform.input.update();
        gameLoop.update(platform.clock.getDeltaTime());

        // Chunk streaming follows the player, only when they enter another chunk.
        // Nothing is allocated on the frames in between (no call, no Promise).
        const position = gameLoop.getCameraPosition();
        const chunkX = World.getChunkIndex(position.x);
        const chunkZ = World.getChunkIndex(position.z);
        if (chunkX !== streamedChunkX || chunkZ !== streamedChunkZ) {
            streamedChunkX = chunkX;
            streamedChunkZ = chunkZ;
            updateChunks(world, position, platform.renderer).catch((error) => {
                console.error('Error updating chunks:', error);
            });
        }

        gameLoop.render();
    };

    return {
        frame, gameLoop, gameState, eventBus, settings, world,
    };
};

export default createGame;
