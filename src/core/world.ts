import { MeshHandle, Renderer } from '../services/renderer';
import { Mat4, Vec3 } from '../types/common';
import AABB from './math/aabb';
import { createTranslationMatrix, extractPosition } from './math/mathHelpers';
import { getMeshAABB } from './collision';

// TODO: We may want to move this and other typing/interface namespaces
// to common classes down the line.
export type ChunkID = string;

export const CHUNK_SIZE = 10; // Size of each chunk in world units
export const CHUNK_LOAD_RADIUS = 6; // Load chunks within this radius

export interface StaticMesh {
    mesh: MeshHandle;
    transform: Mat4;
    color: Vec3;
}

export interface Chunk {
    id: ChunkID;
    bounds: AABB;
    meshes: StaticMesh[];
}

export class World {
    activeChunks: Map<ChunkID, Chunk> = new Map();

    // Helper to generate a coordinate-based ID (e.g., "0,0")
    static getChunkID(x: number, z: number): ChunkID {
        return `${x},${z}`;
    }

    addChunk(chunk: Chunk) {
        this.activeChunks.set(chunk.id, chunk);
    }

    removeChunk(chunkId: ChunkID) {
        this.activeChunks.delete(chunkId);
    }

    getVisibleMeshes(): StaticMesh[] {
        const visibleMesh: StaticMesh[] = [];

        Array.from(this.activeChunks.values()).forEach((chunk) => {
            visibleMesh.push(...chunk.meshes);
        });

        return visibleMesh;
    }

    static getChunkCoords(position: Vec3): { x: number; z: number } {
        const chunkX = Math.floor((position.x + CHUNK_SIZE / 2) / CHUNK_SIZE);
        const chunkZ = Math.floor((position.z + CHUNK_SIZE / 2) / CHUNK_SIZE);
        return { x: chunkX, z: chunkZ };
    }

    static getChunksInRadius(
        chunkX: number,
        chunkZ: number,
        radius: number,
    ): Array<{ x: number; z: number }> {
        const chunks: Array<{ x: number; z: number }> = [];

        for (let x = chunkX - radius; x <= chunkX + radius; x += 1) {
            for (let z = chunkZ - radius; z <= chunkZ + radius; z += 1) {
                chunks.push({ x, z });
            }
        }

        return chunks;
    }

    // eslint-disable-next-line class-methods-use-this
    createChunk(chunkX: number, chunkZ: number, renderer: Renderer): Chunk {
        const chunkCenterX = chunkX * CHUNK_SIZE;
        const chunkCenterZ = chunkZ * CHUNK_SIZE;

        const floorTransform = createTranslationMatrix(chunkCenterX, 0, chunkCenterZ);
        const floorMesh = renderer.createPlaneMesh(10);

        const meshes: StaticMesh[] = [
            // Floor (grayscale for lighting)
            {
                mesh: floorMesh,
                transform: floorTransform,
                color: { x: 0.4, y: 0.4, z: 0.4 },
            },
        ];

        // Random geometric objects with varying sizes
        const objectCount = Math.floor(Math.random() * 5) + 2; // 2-6 objects per chunk
        for (let i = 0; i < objectCount; i += 1) {
            const offsetX = (Math.random() - 0.5) * 8;
            const offsetZ = (Math.random() - 0.5) * 8;
            const type = Math.floor(Math.random() * 4);
            const size = 0.3 + Math.random() * 1.5; // 0.3 to 1.8

            let mesh: MeshHandle;
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
            const gray = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
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
    }

    // TODO: Add other mesh types to the collision system
    // Get collidable AABBs from active chunks
    // Filter meshes to only include cubes (not planes/floors)
    getCollidableAABBs(): AABB[] {
        const collidableAABBs: AABB[] = [];

        Array.from(this.activeChunks.values()).forEach((chunk) => {
            chunk.meshes.forEach((mesh) => {
                // Filter out floor meshes - cubes are at y > 0.1, floors are at y = 0
                const position = extractPosition(mesh.transform);
                if (position.y > 0.1) {
                    // This is a cube mesh (size 1)
                    const meshAABB = getMeshAABB(mesh, 1);
                    collidableAABBs.push(meshAABB);
                }
            });
        });

        return collidableAABBs;
    }

    // Update active chunks based on player position
    updateActiveChunks(playerPosition: Vec3, renderer: Renderer) {
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
            if (!this.activeChunks.has(chunkId)) {
                const newChunk = this.createChunk(chunk.x, chunk.z, renderer);
                this.addChunk(newChunk);
            }
        });

        // Unload chunks outside radius
        const chunksToUnload: string[] = [];
        Array.from(this.activeChunks.keys()).forEach((chunkId) => {
            if (!shouldBeLoaded.has(chunkId)) {
                chunksToUnload.push(chunkId);
            }
        });

        chunksToUnload.forEach((chunkId) => {
            this.removeChunk(chunkId);
        });
    }
}
