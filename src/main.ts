import { World } from './core/world';
import { GameLoop } from './core/gameLoop';
import { TypeSafeEventBus } from './core/events';
import AudioSystem from './core/audioSystem';
import {
    AMBIENT_SOUND,
    MODE_CHANGE_SOUND,
    playAmbience,
    subscribeModeAudio,
} from './core/modeAudio';
import { createGameState, GameState } from './core/gameState';
import { createCamera } from './core/camera';
import type { PlatformServices } from './services/platform';
import { createDebugHUD } from './platforms/web/debugHUD';

// Platform factory - will be replaced at build time
const createPlatform = async (): Promise<PlatformServices> => {
    // This will be tree-shaken based on build config
    if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'stub') {
        const { default: createStubPlatform } = await import('./platforms/stub/stubBootstrap.js');
        return createStubPlatform();
    }

    // Default to web
    const { createWebPlatform } = await import('./platforms/web/webBootstrap.js');
    return createWebPlatform();
};

const main = async () => {
    const platform = await createPlatform();
    const world = new World();
    const eventBus = new TypeSafeEventBus();
    const audioSystem = new AudioSystem(platform.audio, eventBus);

    // Missing audio files are not fatal, the game runs silent (see README)
    const preloads = await Promise.allSettled([
        audioSystem.preload(AMBIENT_SOUND, 'ambient'),
        audioSystem.preload(MODE_CHANGE_SOUND, 'sfx'),
    ]);
    preloads.forEach((result) => {
        if (result.status === 'rejected') console.error('Failed to preload audio:', result.reason);
    });

    subscribeModeAudio(eventBus);
    // Played on the first flush
    playAmbience(eventBus);

    const gameState : GameState = createGameState();

    // Type parameters are intentionally unused (they're for type checking only)
    let updateActiveChunks: (
        _w: World,
        _pos: { x: number; y: number; z: number },
        _r: PlatformServices['renderer'],
        _assetLoader?: any,
    ) => Promise<void>;

    if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'stub') {
        // Stub platform chunk management (deterministic, same as web)
        const { updateActiveChunks: stubUpdateActiveChunks } = await import('./platforms/stub/stubBootstrap.js');
        updateActiveChunks = stubUpdateActiveChunks;
    } else {
        // Default to web platform chunk management
        const { updateActiveChunks: webUpdateActiveChunks } = await import('./platforms/web/webBootstrap.js');
        updateActiveChunks = webUpdateActiveChunks;
    }

    // Initialize world with initial camera position
    const initialCamera = createCamera();
    // Get assetLoader from platform if available (web platform)
    const assetLoader = 'assetLoader' in platform ? (platform as { assetLoader: any }).assetLoader : undefined;
    await updateActiveChunks(world, initialCamera.position, platform.renderer, assetLoader);

    // Create debug HUD
    let debugHUD: {
        render: (_info: {
            cameraPosition: { x: number; y: number; z: number };
            cameraForward: { x: number; y: number; z: number };
            sunPosition?: { x: number; y: number; z: number };
            moonPosition?: { x: number; y: number; z: number };
            timeOfDay?: number;
        }) => void;
        toggle: () => void;
        isVisible: () => boolean;
    } | undefined;

    // Check if platform has canvas property (web platform only)
    if ('canvas' in platform && platform.canvas instanceof HTMLCanvasElement) {
        debugHUD = createDebugHUD(platform.canvas as HTMLCanvasElement);
    }

    const gameLoop = new GameLoop(
        platform.renderer,
        platform.input,
        world,
        platform.getAspectRatio,
        eventBus,
        gameState,
        debugHUD,
    );

    const loop = () => {
        platform.clock.update();
        platform.input.update();
        gameLoop.update(platform.clock.getDeltaTime());

        // Update chunk loading/unloading based on player position
        const cameraPosition = gameLoop.getCameraPosition();
        updateActiveChunks(world, cameraPosition, platform.renderer, assetLoader).catch((error) => {
            console.error('Error in updateActiveChunks:', error);
        });

        gameLoop.render();
        requestAnimationFrame(loop);
    };

    loop();
};

main().catch(console.error);
