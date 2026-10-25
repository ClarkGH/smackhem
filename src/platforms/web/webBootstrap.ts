import type { Renderer } from '../../services/renderer';
import type { PlatformServices } from '../../services/platform';
import {
    World,
    CHUNK_LOAD_RADIUS,
} from '../../core/world';
import { WebInputService } from './input/webInputService';
import type { Vec3 } from '../../types/common';
import WebAssetLoader from './webAssetLoader';
import WebGLRenderer from './rendering/webGLRenderer';
import WebClock from './webClock';
import WebAudioService from './audio/webAudioService';
import WebMenuOverlay from './menu/webMenuOverlay';
import WebSpeechOverlay from './speech/webSpeechOverlay';
import WebPromptOverlay from './speech/webPromptOverlay';
import LocalStorageStore from './localStorageStore';
import WebDisplay from './webDisplay';

// PlatformServices interface moved to src/services/platform.ts
// This export is kept for backward compatibility but should use the shared type

// Chunk loading around a position, async from JSON files.
// A factory, so each game tracks its own pending loads.
// createGame only calls it when the player enters another chunk.
export const createChunkUpdater = () => {
    // Track chunks currently being loaded to avoid duplicate requests
    const pendingChunkLoads = new Set<string>();

    return async (
        world: World,
        playerPosition: Vec3,
        renderer: Renderer,
        assetLoader: WebAssetLoader,
    ): Promise<void> => {
        const currentChunk = World.getChunkCoords(playerPosition);

        const chunksToLoad = World.getChunksInRadius(
            currentChunk.x,
            currentChunk.z,
            CHUNK_LOAD_RADIUS,
        );

        // Create set of chunk IDs that should be loaded
        const shouldBeLoaded = new Set<string>();
        chunksToLoad.forEach((chunk) => {
            shouldBeLoaded.add(World.getChunkID(chunk.x, chunk.z));
        });

        // Load missing chunks (parallel loading for performance)
        const loadPromises: Promise<void>[] = [];

        chunksToLoad.forEach((chunk) => {
            const chunkId = World.getChunkID(chunk.x, chunk.z);

            // Skip if already loaded or currently loading
            if (world.activeChunks.has(chunkId) || pendingChunkLoads.has(chunkId)) {
                return;
            }

            // Mark as loading
            pendingChunkLoads.add(chunkId);

            // Load chunk asynchronously
            const loadPromise = assetLoader
                .loadChunk(chunkId, chunk.x, chunk.z, renderer)
                .then((newChunk) => {
                    // Add chunk to world when loaded
                    world.addChunk(newChunk);
                    pendingChunkLoads.delete(chunkId);
                })
                .catch((error) => {
                    console.error(`Failed to load chunk ${chunkId}:`, error);
                    pendingChunkLoads.delete(chunkId);
                });

            loadPromises.push(loadPromise);
        });

        // Wait for all chunks to load (non-blocking in game loop, but tracks completion)
        await Promise.all(loadPromises);

        // Unload chunks outside radius
        const chunksToUnload: string[] = [];
        Array.from(world.activeChunks.keys()).forEach((chunkId) => {
            if (!shouldBeLoaded.has(chunkId)) {
                chunksToUnload.push(chunkId);
            }
        });

        chunksToUnload.forEach((chunkId) => {
            world.removeChunk(chunkId);
            // Clean up pending load if chunk is being unloaded before it finishes loading
            pendingChunkLoads.delete(chunkId);
        });
    };
};

export const createWebPlatform = async (): Promise<PlatformServices & { canvas: HTMLCanvasElement; assetLoader: WebAssetLoader }> => {
    // DOM setup: the canvas fills #app, which fills the page (or an itch.io iframe).
    // The menu and debug overlays sit on top of it inside the same container.
    let container = document.getElementById('app');
    if (!container) {
        container = document.createElement('div');
        container.id = 'app';
        document.body.appendChild(container);
    }
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Before the renderer and overlays, so the canvas already has its real size
    const display = new WebDisplay(container, canvas);

    const renderer = new WebGLRenderer(canvas);
    const input = new WebInputService(canvas);
    const clock = new WebClock();
    const assetLoader = new WebAssetLoader('/chunks/');
    const audio = new WebAudioService('/assets/audio/');
    const menu = new WebMenuOverlay(canvas, {
        pointer: (pointer) => input.pointMenu(pointer),
        back: () => input.pressBack(),
        opened: (open) => input.setMenuOpen(open),
    });
    const speech = new WebSpeechOverlay(container);
    const prompt = new WebPromptOverlay(container);

    // Browsers block audio until a user gesture, unlock on the first one
    const unlockAudio = () => {
        audio.resumeContext();
        document.removeEventListener('pointerdown', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return {
        renderer,
        clock,
        input,
        audio,
        menu,
        speech,
        prompt,
        storage: new LocalStorageStore(),
        display,
        canvas,
        assetLoader,
        getAspectRatio: () => canvas.width / canvas.height,
    };
};
