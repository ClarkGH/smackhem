import { describe, it, expect } from 'vitest';
import { createChunkStreamer, type LoadChunk } from './chunkStreamer';
import NullRenderer from '../platforms/stub/nullRenderer';
import { World, CHUNK_SIZE, type Chunk } from './world';
import { createAABB } from './math/aabb';

const emptyChunk = (id: string): Chunk => ({
    id,
    bounds: createAABB({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    collisionAABBs: [],
    meshes: [],
    hasContent: false,
    npcs: [],
});

type FinishLoad = () => void;

// Loads that finish only when the test says so, in whatever order it picks
const createDeferredLoad = () => {
    const pending = new Map<string, FinishLoad>();
    const load: LoadChunk = (chunkX, chunkZ) => new Promise<Chunk>((resolve) => {
        const chunkId = World.getChunkID(chunkX, chunkZ);
        pending.set(chunkId, () => resolve(emptyChunk(chunkId)));
    });
    // Finishes the waiting loads that match, then lets their callbacks run
    const resolveWhere = async (matches: (chunkId: string) => boolean): Promise<void> => {
        Array.from(pending.keys()).forEach((chunkId) => {
            if (!matches(chunkId)) return;
            pending.get(chunkId)!();
            pending.delete(chunkId);
        });
        await new Promise((done) => { setTimeout(done, 0); });
    };
    const resolveAll = () => resolveWhere(() => true);
    return { load, resolveWhere, resolveAll };
};

// A position in the middle of chunk (x, 0)
const inChunk = (x: number) => ({ x: x * CHUNK_SIZE, y: 0, z: 0 });

// Chunks loaded more than radius 6 away from chunk (x, 0)
const loadedOutside = (world: World, x: number): string[] => Array.from(world.activeChunks.keys())
    .filter((id) => Math.abs(Number(id.split(',')[0]) - x) > 6);

describe('createChunkStreamer', () => {
    // Loads around chunk 0 are still in flight when the player reaches chunk 100
    it('keeps the new area when both updates finish together', async () => {
        const world = new World();
        const renderer = new NullRenderer();
        const { load, resolveAll } = createDeferredLoad();
        const updateChunks = createChunkStreamer(load);

        const first = updateChunks(world, inChunk(0), renderer);
        const second = updateChunks(world, inChunk(100), renderer);
        await resolveAll();
        await Promise.all([first, second]);

        expect(loadedOutside(world, 100)).toEqual([]);
        expect(world.activeChunks.has('100,0')).toBe(true);
    });

    it('drops loads for the old area that finish after the new area is in', async () => {
        const world = new World();
        const renderer = new NullRenderer();
        const { load, resolveWhere } = createDeferredLoad();
        const updateChunks = createChunkStreamer(load);
        const nearOld = (chunkId: string) => Math.abs(Number(chunkId.split(',')[0])) <= 6;

        const first = updateChunks(world, inChunk(0), renderer);
        const second = updateChunks(world, inChunk(100), renderer);
        await resolveWhere((chunkId) => !nearOld(chunkId));
        await second;
        await resolveWhere(nearOld);
        await first;

        expect(loadedOutside(world, 100)).toEqual([]);
        expect(world.activeChunks.has('100,0')).toBe(true);
    });
});
