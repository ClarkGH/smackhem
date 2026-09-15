import { MeshHandle, Renderer } from '../services/renderer';
import { Mat4, Vec3 } from '../types/common';
import { type AABB, createAABB } from './math/aabb';
import { extractPosition } from './math/mathHelpers';
import { getMeshAABB } from './collision';

export type ChunkID = string;

export const CHUNK_SIZE = 10; // Size of each chunk in world units
export const CHUNK_LOAD_RADIUS = 6; // Load chunks within this radius

const WORLD_WALL_HEIGHT = 20;
const WORLD_WALL_THICKNESS = 1;

export interface StaticMesh {
    mesh: MeshHandle;
    transform: Mat4;
    color: Vec3;
}

export interface Chunk {
    id: ChunkID;
    bounds: AABB;
    collisionAABBs: AABB[];
    meshes: StaticMesh[];
    hasContent: boolean; // Either there's map data or a tech demo without boundaries.
}

export class World {
    activeChunks: Map<ChunkID, Chunk> = new Map();

    private _visibleMeshesBuffer: StaticMesh[] = [];

    private _collidableAABBsBuffer: AABB[] = [];

    static getChunkID(x: number, z: number): ChunkID {
        return `${x},${z}`;
    }

    addChunk(chunk: Chunk) {
        this.activeChunks.set(chunk.id, chunk);
    }

    removeChunk(chunkId: ChunkID, renderer?: Renderer) {
        const chunk = this.activeChunks.get(chunkId);
        if (!chunk) return;

        this.activeChunks.delete(chunkId);
    }

    getVisibleMeshes(): StaticMesh[] {
        this._visibleMeshesBuffer.length = 0;

        this.activeChunks.forEach((chunk) => {
            this._visibleMeshesBuffer.push(...chunk.meshes);
        });

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
    getCollidableAABBs(): AABB[] {
        this._collidableAABBsBuffer.length = 0;

        this.activeChunks.forEach((chunk) => {
            chunk.meshes.forEach((mesh) => {
                const position = extractPosition(mesh.transform);
                if (position.y > 0.1) {
                    const meshAABB = getMeshAABB(mesh, 1);
                    this._collidableAABBsBuffer.push(meshAABB);
                }
            });
        });

        // Boundary walls: only real chunks project an edge (invisible wall). If nothing has
        // loaded, or everything loaded is a createEmptyChunk fallback, this
        // loop contributes nothing and the world is open in every direction.
        this.activeChunks.forEach((chunk) => {
            if (!chunk.hasContent) return;

            const [chunkX, chunkZ] = chunk.id.split(',').map(Number);
            const neighbors: Array<[number, number, 'north' | 'south' | 'east' | 'west']> = [
                [chunkX, chunkZ + 1, 'north'],
                [chunkX, chunkZ - 1, 'south'],
                [chunkX + 1, chunkZ, 'east'],
                [chunkX - 1, chunkZ, 'west'],
            ];

            neighbors.forEach(([nx, nz, side]) => {
                const neighbor = this.activeChunks.get(World.getChunkID(nx, nz));
                const neighborIsReal = neighbor?.hasContent ?? false;
                if (!neighborIsReal) {
                    this._collidableAABBsBuffer.push(this.getEdgeWall(chunk, side));
                }
            });
        });

        return this._collidableAABBsBuffer;
    }

    // Expose wall AABBs
    getBoundaryWallAABBs(): AABB[] {
        const walls: AABB[] = [];

        this.activeChunks.forEach((chunk) => {
            if (!chunk.hasContent) return;

            const [chunkX, chunkZ] = chunk.id.split(',').map(Number);
            const neighbors: Array<[number, number, 'north' | 'south' | 'east' | 'west']> = [
                [chunkX, chunkZ + 1, 'north'],
                [chunkX, chunkZ - 1, 'south'],
                [chunkX + 1, chunkZ, 'east'],
                [chunkX - 1, chunkZ, 'west'],
            ];

            neighbors.forEach(([nx, nz, side]) => {
                const neighbor = this.activeChunks.get(World.getChunkID(nx, nz));
                if (!(neighbor?.hasContent ?? false)) {
                    walls.push(this.getEdgeWall(chunk, side));
                }
            });
        });

        return walls;
    }

    private getEdgeWall(chunk: Chunk, side: 'north' | 'south' | 'east' | 'west'): AABB {
        const t = WORLD_WALL_THICKNESS;
        const h = WORLD_WALL_HEIGHT;
        const { min, max } = chunk.bounds;

        switch (side) {
            case 'north':
                return createAABB({ x: min.x, y: -1, z: max.z - t }, { x: max.x, y: h, z: max.z + t });
            case 'south':
                return createAABB({ x: min.x, y: -1, z: min.z - t }, { x: max.x, y: h, z: min.z + t });
            case 'east':
                return createAABB({ x: max.x - t, y: -1, z: min.z }, { x: max.x + t, y: h, z: max.z });
            default: // 'west'
                return createAABB({ x: min.x - t, y: -1, z: min.z }, { x: min.x + t, y: h, z: max.z });
        }
    }
}
