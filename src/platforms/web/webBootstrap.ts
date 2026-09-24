import type { Renderer } from '../../services/renderer';
import type { PlatformServices } from '../../services/platform';
import WebGLRenderer from './webGLRenderer';
import {
    World,
    CHUNK_LOAD_RADIUS,
} from '../../core/world';
import WebClock from './webClock';
import { WebInputService } from './webInputService';
import type { Vec3 } from '../../types/common';
import { WebAssetLoader } from './webAssetLoader';

// PlatformServices interface moved to src/services/platform.ts
// This export is kept for backward compatibility but should use the shared type

// Track chunks currently being loaded to avoid duplicate requests
const pendingChunkLoads = new Set<string>();
// Keep track of 1pv camera chunk location.
let lastPlayerChunk: { x: number; z: number } | null = null;

// Update active chunks based on player position (platform-specific chunk management)
// Uses async chunk loading from JSON files
export const updateActiveChunks = async (
    world: World,
    playerPosition: Vec3,
    renderer: Renderer,
    assetLoader: WebAssetLoader,
): Promise<void> => {
    const currentChunk = World.getChunkCoords(playerPosition);

    if (
        lastPlayerChunk
        && lastPlayerChunk.x === currentChunk.x
        && lastPlayerChunk.z === currentChunk.z
    ) {
        return;
    }

    lastPlayerChunk = currentChunk;

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

export const createWebPlatform = async (): Promise<PlatformServices & { canvas: HTMLCanvasElement; assetLoader: WebAssetLoader }> => {
    // DOM setup
    const canvas = document.createElement('canvas');
    canvas.width = 800; // TODO: Variable width
    canvas.height = 600; // TODO: Variable height
    document.body.appendChild(canvas);

    const renderer = new WebGLRenderer(canvas);
    const input = new WebInputService(canvas);
    const clock = new WebClock();
    const assetLoader = new WebAssetLoader('/chunks/');

    // Wireframe toggle (press '\' key)
    let wireframeEnabled = false;
    document.addEventListener('keydown', (e) => {
        if (e.key === '\\') {
            wireframeEnabled = !wireframeEnabled;
            renderer.setWireframe(wireframeEnabled);
            console.log(`Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`);
        }
    });

    return {
        renderer,
        clock,
        input,
        canvas,
        assetLoader,
        getAspectRatio: () => canvas.width / canvas.height,
    };
};
