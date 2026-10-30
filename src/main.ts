import { createGame, type GameSetup } from './game';
import { createDebugHUD } from './platforms/web/debugHUD';
import { createDebugSettings } from './core/settings/debugSettings';

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
        updateChunks: createChunkUpdater(platform.chunkSource),
        debugHUD: createDebugHUD(platform.canvas),
        // Dev server only, so released builds have no Debug screen
        debugSettings: import.meta.env.DEV ? createDebugSettings() : undefined,
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
