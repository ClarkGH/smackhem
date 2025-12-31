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

    // Initialize world with initial camera position
    const initialCamera = createCamera();
    world.updateActiveChunks(initialCamera.position, platform.renderer);

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
        gameLoop.render();
        requestAnimationFrame(loop);
    };

    loop();
};

main().catch(console.error);
