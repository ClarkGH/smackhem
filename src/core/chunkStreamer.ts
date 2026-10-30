import type { Renderer } from '../services/renderer';
import type { Vec3 } from '../types/common';
import {
    World,
    type Chunk,
    CHUNK_LOAD_RADIUS,
} from './world';

// Loads and unloads world chunks around a position.
// Only called when the player enters another chunk, see createGame.
export type ChunkUpdater = (
    world: World,
    playerPosition: Vec3,
    renderer: Renderer,
) => Promise<void>;

// One chunk, however the platform gets it: core's ChunkLoader from files on the web, generated on the stub
export type LoadChunk = (chunkX: number, chunkZ: number, renderer: Renderer) => Promise<Chunk>;

/**
 * The chunk updater every platform uses: loads what's missing in the radius, in parallel, and unloads
 * what's outside it. A factory, so each game tracks its own pending loads.
 */
export const createChunkStreamer = (loadChunk: LoadChunk): ChunkUpdater => {
    // Track chunks currently being loaded to avoid duplicate requests
    const pendingChunkLoads = new Set<string>();

    // The latest update's chunks. Loads and unloads finish out of order, so both check
    // this rather than their own update's list, which may be out of date by then.
    let wantedChunks = new Set<string>();

    return async (
        world: World,
        playerPosition: Vec3,
        renderer: Renderer,
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
        wantedChunks = shouldBeLoaded;

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
            const loadPromise = loadChunk(chunk.x, chunk.z, renderer)
                .then((newChunk) => {
                    // Dropped if the player has moved on since it was asked for
                    if (wantedChunks.has(chunkId)) world.addChunk(newChunk);
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

        // Unload chunks outside the latest update's radius
        const chunksToUnload: string[] = [];
        Array.from(world.activeChunks.keys()).forEach((chunkId) => {
            if (!wantedChunks.has(chunkId)) {
                chunksToUnload.push(chunkId);
            }
        });

        chunksToUnload.forEach((chunkId) => {
            world.removeChunk(chunkId);
        });
    };
};
