import type { Renderer } from '../../services/renderer';
import type { Clock } from '../../services/clock';
import type { Input } from '../../services/input';
import createGameLoop from '../../core/gameLoop';
import WebGLRenderer from './webGLRenderer';
import {
    World,
    type Chunk,
    CHUNK_SIZE,
    CHUNK_LOAD_RADIUS,
} from '../../core/world';
import AABB from '../../core/math/aabb';
import { createTranslationMatrix } from '../../core/math/mathHelpers';
import WebClock from './webClock';
import { createCamera } from '../../core/camera';
import { WebInputService } from './webInputService';
import type { Vec3 } from '../../types/common';

export interface PlatformServices {
    renderer: Renderer;
    clock: Clock;
    input: Input;
    getAspectRatio: () => number;
}

// Simple seeded random number generator for deterministic chunk generation
export const seededRandom = (seed: number): number => {
    // Simple hash-based PRNG
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};

// Generate a seed from chunk coordinates
/* eslint-disable-next-line no-bitwise */
export const chunkSeed = (chunkX: number, chunkZ: number): number => (chunkX * 73856093) ^ (chunkZ * 19349663);

// Create a chunk procedurally (platform-specific implementation)
// This will eventually be replaced by asset loading
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
                yPos = size * 0.6; // Adjust for pyramid height
                break;
            case 2: // Prism
                mesh = renderer.createPrismMesh(size, size * 1.5, size * 0.8);
                yPos = (size * 1.5) / 2;
                break;
            case 3: // Sphere
                mesh = renderer.createSphereMesh(size / 2, 12);
                break;
            default:
                mesh = renderer.createCubeMesh(size);
        }

        const transform = createTranslationMatrix(
            chunkCenterX + offsetX,
            yPos,
            chunkCenterZ + offsetZ,
        );

        // Grayscale colors (will be lit by lighting system)
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
        bounds: new AABB(
            { x: chunkCenterX - 5, y: -1, z: chunkCenterZ - 5 },
            { x: chunkCenterX + 5, y: 5, z: chunkCenterZ + 5 },
        ),
        meshes,
    };
};

// Update active chunks based on player position (platform-specific chunk management)
export const updateActiveChunks = (
    world: World,
    playerPosition: Vec3,
    renderer: Renderer,
): void => {
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

    // Load missing chunks
    chunksToLoad.forEach((chunk) => {
        const chunkId = World.getChunkID(chunk.x, chunk.z);
        if (!world.activeChunks.has(chunkId)) {
            const newChunk = createChunk(chunk.x, chunk.z, renderer);
            world.addChunk(newChunk);
        }
    });

    // Unload chunks outside radius
    const chunksToUnload: string[] = [];
    Array.from(world.activeChunks.keys()).forEach((chunkId) => {
        if (!shouldBeLoaded.has(chunkId)) {
            chunksToUnload.push(chunkId);
        }
    });

    chunksToUnload.forEach((chunkId) => {
        world.removeChunk(chunkId);
    });
};

export const createWebPlatform = async (): Promise<PlatformServices> => {
    // DOM setup
    const canvas = document.createElement('canvas');
    canvas.width = 800; // TODO: Variable width
    canvas.height = 600; // TODO: Variable height
    document.body.appendChild(canvas);

    const renderer = new WebGLRenderer(canvas);
    const input = new WebInputService(canvas);
    const clock = new WebClock();

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
        getAspectRatio: () => canvas.width / canvas.height,
    };
};

// Legacy bootstrap function for direct import (will be removed)
export const bootstrapWeb = (): void => {
    createWebPlatform().then((platform) => {
        const world = new World();
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
    }).catch(console.error);
};
