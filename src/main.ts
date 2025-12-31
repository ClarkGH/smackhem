// Platform-agnostic entry point
import { World } from './core/world';
import createGameLoop from './core/gameLoop';
import { createCamera } from './core/camera';
import type { PlatformServices } from './platforms/web/webBootstrap';

// Platform factory - will be replaced at build time
const createPlatform = async (): Promise<PlatformServices> => {
    // This will be tree-shaken based on build config
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
    // eslint-disable-next-line no-shadow, no-unused-vars
    let updateActiveChunks: (w: World, pos: { x: number; y: number; z: number }, r: PlatformServices['renderer']) => void;

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

    const gameLoop = createGameLoop(
        platform.renderer,
        platform.input,
        world,
        platform.getAspectRatio,
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
