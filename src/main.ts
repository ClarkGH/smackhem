import { createGame, type GameSetup } from './game';
import { createDebugHUD } from './platforms/web/debugHUD';

// Platform setup - the other platform is tree-shaken based on build config
const setUpPlatform = async (): Promise<GameSetup> => {
    // __PLATFORM__ is a build-time define from Vite
    if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'stub') {
        const { default: createStubPlatform, createChunkUpdater } = await import('./platforms/stub/stubBootstrap.js');
        return { platform: await createStubPlatform(), updateChunks: createChunkUpdater() };
    }

    // Default to web
    const { createWebPlatform, createChunkUpdater } = await import('./platforms/web/webBootstrap.js');
    const platform = await createWebPlatform();
    return {
        platform,
        updateChunks: createChunkUpdater(),
        assetLoader: platform.assetLoader,
        debugHUD: createDebugHUD(platform.canvas),
    };
};

const main = async () => {
    const game = await createGame(await setUpPlatform());

    const loop = () => {
        game.frame();
        requestAnimationFrame(loop);
    };

    loop();
};

main().catch(console.error);
