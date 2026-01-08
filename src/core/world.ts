import { MeshHandle } from '../services/renderer';
import { Mat4, Vec3 } from '../types/common';
import AABB from './math/aabb';
import { extractPosition } from './math/mathHelpers';
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

    private _visibleMeshesBuffer: StaticMesh[] = [];

    private _collidableAABBsBuffer: AABB[] = [];

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
        // Clear buffer and reuse
        this._visibleMeshesBuffer.length = 0;

        // Use forEach instead of for...of to avoid regenerator-runtime dependency (RULE M-3)
        this.activeChunks.forEach((chunk) => {
            this._visibleMeshesBuffer.push(...chunk.meshes);
        });

        // Return buffer reference (callers must not mutate)
        return this._visibleMeshesBuffer;
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

    // TODO: Add other mesh types to the collision system
    // Get collidable AABBs from active chunks
    // Filter meshes to only include cubes (not planes/floors)
    getCollidableAABBs(): AABB[] {
        // Clear buffer and reuse
        this._collidableAABBsBuffer.length = 0;

        // Use forEach instead of for...of to avoid regenerator-runtime dependency (RULE M-3)
        this.activeChunks.forEach((chunk) => {
            chunk.meshes.forEach((mesh) => {
                // Filter out floor meshes - cubes are at y > 0.1, floors are at y = 0
                const position = extractPosition(mesh.transform);
                if (position.y > 0.1) {
                    // This is a cube mesh (size 1)
                    const meshAABB = getMeshAABB(mesh, 1);
                    this._collidableAABBsBuffer.push(meshAABB);
                }
            });
        });

        // Return buffer reference (callers must not mutate)
        return this._collidableAABBsBuffer;
    }
}
