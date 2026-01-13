// Platform-agnostic entry point
import { World } from './core/world';
import { GameLoop } from './core/gameLoop';
import { createCamera } from './core/camera';
import type { PlatformServices } from './platforms/web/webBootstrap';
import { createDebugHUD } from './platforms/web/debugHUD';

// Platform factory - will be replaced at build time
const createPlatform = async (): Promise<PlatformServices> => {
    // This will be tree-shaken based on build config
    // __PLATFORM__ is a build-time define from Vite, not available at ESLint parse time
    // eslint-disable-next-line no-undef
    if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'stub') {
        const createStubPlatform = (await import('./platforms/stub/stubBootstrap')).default;
        return createStubPlatform();
    }

    // Default to web
    const { createWebPlatform } = await import('./platforms/web/webBootstrap');
    return createWebPlatform();
};

const main = async () => {
    const platform = await createPlatform();
    const world = new World();

    // Import chunk management function (platform-specific)
    // TODO: Refactor to avoid variable shadowing
    // eslint-disable-next-line no-shadow, no-unused-vars
    let updateActiveChunks: (w: World, pos: { x: number; y: number; z: number }, r: PlatformServices['renderer']) => void;

    // __PLATFORM__ is a build-time define from Vite, not available at ESLint parse time
    // eslint-disable-next-line no-undef
    if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'stub') {
        // Stub platform doesn't need chunk management for now
        updateActiveChunks = () => {};
    } else {
        // Default to web platform chunk management
        const { updateActiveChunks: webUpdateActiveChunks } = await import('./platforms/web/webBootstrap');
        updateActiveChunks = webUpdateActiveChunks;
    }

    // Initialize world with initial camera position
    const initialCamera = createCamera();
    updateActiveChunks(world, initialCamera.position, platform.renderer);

    // Create debug HUD (only for web platform)
    let debugHUD: {
        render: (_info: {
            cameraPosition: { x: number; y: number; z: number };
            cameraForward: { x: number; y: number; z: number };
            sunPosition?: { x: number; y: number; z: number };
            // moonPosition?: { x: number; y: number; z: number };
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
        debugHUD,
    );

    const loop = () => {
        platform.clock.update();
        platform.input.update();
        gameLoop.update(platform.clock.getDeltaTime());

        // Update chunk loading/unloading based on player position
        const cameraPosition = gameLoop.getCameraPosition();
        updateActiveChunks(world, cameraPosition, platform.renderer);

        gameLoop.render();
        requestAnimationFrame(loop);
    };

    loop();
};

main().catch(console.error);
