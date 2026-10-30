import NullRenderer from './nullRenderer';
import StubClock from './stubClock';
import StubInput from './stubInput';
import StubAudioService from './stubAudioService';
import NullMenuOverlay from './nullMenuOverlay';
import NullSpeechOverlay from './nullSpeechOverlay';
import NullPromptOverlay from './nullPromptOverlay';
import NullBattleOverlay from './nullBattleOverlay';
import MemoryStore from './memoryStore';
import StubDisplay from './stubDisplay';
import type { PlatformServices } from '../../services/platform';
import type { Renderer } from '../../services/renderer';
import { World, type Chunk, CHUNK_SIZE } from '../../core/world';
import { createAABB } from '../../core/math/aabb';
import { createTranslationMatrix } from '../../core/math/mathHelpers';
import { createChunkStreamer, type ChunkUpdater } from '../../core/chunkStreamer';

// Simple seeded random number generator for deterministic chunk generation (stub version)
// Uses same algorithm as web platform for consistency
export const seededRandom = (seed: number): number => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};

export const chunkSeed = (chunkX: number, chunkZ: number): number => (chunkX * 73856093) ^ (chunkZ * 19349663);

/**
 * Create a chunk procedurally (stub version)
 * Uses same generation logic as web platform for deterministic testing
 */
export const createChunk = (chunkX: number, chunkZ: number, renderer: Renderer): Chunk => {
    const chunkCenterX = chunkX * CHUNK_SIZE;
    const chunkCenterZ = chunkZ * CHUNK_SIZE;

    const floorTransform = createTranslationMatrix(chunkCenterX, 0, chunkCenterZ);
    const floorMesh = renderer.createPlaneMesh(10);

    const meshes: Chunk['meshes'] = [
        // Floor (grayscale for lighting)
        {
            mesh: floorMesh,
            transform: floorTransform,
            color: { x: 0.4, y: 0.4, z: 0.4 },
        },
    ];

    // Deterministic generation based on chunk coordinates
    const seed = chunkSeed(chunkX, chunkZ);
    const objectCount = Math.floor(seededRandom(seed) * 5) + 2; // 2-6 objects per chunk
    for (let i = 0; i < objectCount; i += 1) {
        const itemSeed = chunkSeed(chunkX + i, chunkZ + i * 7);
        const offsetX = (seededRandom(itemSeed) - 0.5) * 8;
        const offsetZSeed = chunkSeed(chunkX + i * 3, chunkZ + i * 11);
        const offsetZ = (seededRandom(offsetZSeed) - 0.5) * 8;
        const typeSeed = chunkSeed(chunkX + i * 5, chunkZ + i * 13);
        const type = Math.floor(seededRandom(typeSeed) * 4);
        const sizeSeed = chunkSeed(chunkX + i * 7, chunkZ + i * 17);
        const size = 0.3 + seededRandom(sizeSeed) * 1.5; // 0.3 to 1.8

        let mesh;
        let yPos = size / 2;

        switch (type) {
            case 0: // Cube
                mesh = renderer.createCubeMesh(size);
                break;
            case 1: // Pyramid
                mesh = renderer.createPyramidMesh(size);
                yPos = size * 0.6;
                break;
            case 2: // Prism
                mesh = renderer.createPrismMesh(size, size * 1.5, size * 0.8);
                yPos = (size * 1.5) / 2;
                break;
            case 3: // Sphere
                mesh = renderer.createSphereMesh(size / 2, 12);
                break;
            default: // Cube for now, TODO: consider error block
                mesh = renderer.createCubeMesh(size);
        }

        const transform = createTranslationMatrix(
            chunkCenterX + offsetX,
            yPos,
            chunkCenterZ + offsetZ,
        );

        const graySeed = chunkSeed(chunkX + i * 19, chunkZ + i * 23);
        const gray = 0.3 + seededRandom(graySeed) * 0.4; // 0.3 to 0.7
        meshes.push({
            mesh,
            transform,
            color: { x: gray, y: gray, z: gray },
        });
    }

    const chunkId = World.getChunkID(chunkX, chunkZ);

    return {
        id: chunkId,
        bounds: createAABB({ x: chunkCenterX - 5, y: -1, z: chunkCenterZ - 5 }, { x: chunkCenterX + 5, y: 5, z: chunkCenterZ + 5 }),
        collisionAABBs: [],
        meshes,
        hasContent: true,
        npcs: [],
    };
};

// Generated chunks, through core's streamer like the web's. A factory, so each game tracks its own loads.
export const createChunkUpdater = (): ChunkUpdater => createChunkStreamer(
    async (chunkX, chunkZ, renderer) => createChunk(chunkX, chunkZ, renderer),
);

const createStubPlatform = async (): Promise<PlatformServices> => ({
    renderer: new NullRenderer(),
    clock: new StubClock(),
    input: new StubInput(),
    audio: new StubAudioService(),
    menu: new NullMenuOverlay(),
    speech: new NullSpeechOverlay(),
    prompt: new NullPromptOverlay(),
    battle: new NullBattleOverlay(),
    storage: new MemoryStore(),
    display: new StubDisplay(),
    getAspectRatio: () => 16 / 9,
});

export default createStubPlatform;
