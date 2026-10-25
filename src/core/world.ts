import { MeshHandle } from '../services/renderer';
import { Mat4, Vec3 } from '../types/common';
import { type AABB, createAABB } from './math/aabb';

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

export interface Npc {
    id: string;
    textureId: string;
    position: Vec3;
    size: number;
    collisionAABB: AABB;
    line: string;
}

export interface Chunk {
    id: ChunkID;
    bounds: AABB;
    collisionAABBs: AABB[];
    meshes: StaticMesh[];
    hasContent: boolean; // Either there's map data or a tech demo without boundaries.
    npcs: Npc[];
}

export class World {
    public activeChunks: Map<ChunkID, Chunk> = new Map();

    private _visibleMeshesBuffer: StaticMesh[] = [];

    private _collidableAABBsBuffer: AABB[] = [];

    private _visibleNpcsBuffer: Npc[] = [];

    public static getChunkID(x: number, z: number): ChunkID {
        return `${x},${z}`;
    }

    public addChunk(chunk: Chunk) {
        this.activeChunks.set(chunk.id, chunk);
    }

    public removeChunk(chunkId: ChunkID) {
        const chunk = this.activeChunks.get(chunkId);
        if (!chunk) return;

        this.activeChunks.delete(chunkId);
    }

    public getVisibleMeshes(): StaticMesh[] {
        this._visibleMeshesBuffer.length = 0;

        this.activeChunks.forEach((chunk) => {
            this._visibleMeshesBuffer.push(...chunk.meshes);
        });

        return this._visibleMeshesBuffer;
    }

    public getVisibleNpcs(): Npc[] {
        this._visibleNpcsBuffer.length = 0;

        this.activeChunks.forEach((chunk) => {
            this._visibleNpcsBuffer.push(...chunk.npcs);
        });

        return this._visibleNpcsBuffer;
    }

    // Undefined once its chunk has unloaded
    public findNpc(npcId: string): Npc | undefined {
        let found: Npc | undefined;
        this.activeChunks.forEach((chunk) => {
            for (let i = 0; i < chunk.npcs.length && !found; i += 1) {
                if (chunk.npcs[i].id === npcId) found = chunk.npcs[i];
            }
        });
        return found;
    }

    // Chunk index along one axis, a plain number so per-frame checks don't allocate (M-1)
    public static getChunkIndex(coordinate: number): number {
        return Math.floor((coordinate + CHUNK_SIZE / 2) / CHUNK_SIZE);
    }

    public static getChunkCoords(position: Vec3): { x: number; z: number } {
        return { x: World.getChunkIndex(position.x), z: World.getChunkIndex(position.z) };
    }

    public static getChunksInRadius(
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
    public getCollidableAABBs(): AABB[] {
        this._collidableAABBsBuffer.length = 0;

        this.activeChunks.forEach((chunk) => {
            this._collidableAABBsBuffer.push(...chunk.collisionAABBs);
        });

        const boundaryAABBs = this.getBoundaryWallAABBs();
        this._collidableAABBsBuffer.push(...boundaryAABBs);

        return this._collidableAABBsBuffer;
    }

    // Expose wall AABBs
    // TODO: Consider making private for non-debug version
    public getBoundaryWallAABBs(): AABB[] {
        const walls: AABB[] = [];

        this.activeChunks.forEach((chunk) => {
            if (!chunk.hasContent) return;

            const [chunkX, chunkZ] = chunk.id.split(',').map(Number);
            // North is -z (the camera's forward at yaw 0, as the debug HUD's compass reads), east +x
            const neighbors: Array<[number, number, 'north' | 'south' | 'east' | 'west']> = [
                [chunkX, chunkZ - 1, 'north'],
                [chunkX, chunkZ + 1, 'south'],
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
                return createAABB({ x: min.x, y: -1, z: min.z - t }, { x: max.x, y: h, z: min.z + t });
            case 'south':
                return createAABB({ x: min.x, y: -1, z: max.z - t }, { x: max.x, y: h, z: max.z + t });
            case 'east':
                return createAABB({ x: max.x - t, y: -1, z: min.z }, { x: max.x + t, y: h, z: max.z });
            default: // 'west'
                return createAABB({ x: min.x - t, y: -1, z: min.z }, { x: min.x + t, y: h, z: max.z });
        }
    }
}
