/* eslint-disable max-classes-per-file */
import { MeshHandle, Renderer } from '../services/renderer';
import { Mat4, Vec3 } from '../types/common';
import AABB from './collision';
import { createTranslationMatrix } from './math';

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
        const cubeTransform = createTranslationMatrix(chunkCenterX, 0.5, chunkCenterZ);

        // TODO: Consider typing more strictly
        const floorMesh = (renderer as any).createPlaneMesh(10);
        const cubeMesh = (renderer as any).createCubeMesh(1);

        const chunkId = World.getChunkID(chunkX, chunkZ);

        return {
            id: chunkId,
            bounds: new AABB(
                { x: chunkCenterX - 5, y: -1, z: chunkCenterZ - 5 },
                { x: chunkCenterX + 5, y: 5, z: chunkCenterZ + 5 },
            ),
            meshes: [
                // Floor (purple)
                {
                    mesh: floorMesh,
                    transform: floorTransform,
                    color: { x: 0.5, y: 0, z: 0.5 },
                },
                // Cube (neon green)
                {
                    mesh: cubeMesh,
                    transform: cubeTransform,
                    color: { x: 0.2, y: 0.8, z: 0.3 },
                },
            ],
        };
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
