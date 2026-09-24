// Platform-agnostic entry point
import { World } from './core/world';
import { GameLoop } from './core/gameLoop';
import { TypeSafeEventBus } from './core/events';
import { createGameState, GameState } from './core/gameState';
import { createCamera } from './core/camera';
import type { PlatformServices } from './services/platform';
import { createDebugHUD } from './platforms/web/debugHUD';

// Platform factory - will be replaced at build time
const createPlatform = async (): Promise<PlatformServices> => {
    // This will be tree-shaken based on build config
    // __PLATFORM__ is a build-time define from Vite, not available at ESLint parse time
    // eslint-disable-next-line no-undef
    if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'stub') {
        const { default: createStubPlatform } = (await import('./platforms/stub/stubBootstrap.js')).default;
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

    const gameState : GameState = createGameState();

    // Import chunk management function (platform-specific)
    // Type parameters are intentionally unused (they're for type checking only)
    // eslint-disable-next-line no-shadow
    let updateActiveChunks: (
        // eslint-disable-next-line no-unused-vars
        _w: World,
        // eslint-disable-next-line no-unused-vars
        _pos: { x: number; y: number; z: number },
        // eslint-disable-next-line no-unused-vars
        _r: PlatformServices['renderer'],
        // eslint-disable-next-line no-unused-vars
        _assetLoader?: any,
    ) => Promise<void>;

    // __PLATFORM__ is a build-time define from Vite, not available at ESLint parse time
    // eslint-disable-next-line no-undef
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

    // Create debug HUD (only for web platform)
    let debugHUD: {
        // eslint-disable-next-line no-unused-vars
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

    // Event Subscriptions
    eventBus.subscribe('game_mode_changed', (event) => {
        // TODO: Do the logic in the subscriptions in the main loop, might not live in this file.
        console.log('📣 [EventBus Test] Game Mode Has Swapped!');
        console.log(`   └─ Previous Mode: ${event.previousMode}`);
        console.log(`   └─ Current Mode:  ${event.currentMode}`);
    });

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
        eventBus.flush();

        // Update chunk loading/unloading based on player position
        // Fire and forget - chunks will populate as they load (non-blocking)
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
