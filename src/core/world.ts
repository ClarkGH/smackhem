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
    private readonly chunks: Map<ChunkID, Chunk> = new Map();

    // Read-only, so only addChunk and removeChunk change the world and the lists below never go stale
    public readonly activeChunks: ReadonlyMap<ChunkID, Chunk> = this.chunks;

    // Built from the chunks whenever one is added or removed, never per tick (M-1, M-2)
    private readonly visibleMeshes: StaticMesh[] = [];

    private readonly visibleNpcs: Npc[] = [];

    private readonly boundaryWalls: AABB[] = [];

    private readonly collidableAABBs: AABB[] = [];

    public static getChunkID(x: number, z: number): ChunkID {
        return `${x},${z}`;
    }

    public addChunk(chunk: Chunk) {
        this.chunks.set(chunk.id, chunk);
        this.rebuild();
    }

    public removeChunk(chunkId: ChunkID) {
        if (!this.chunks.delete(chunkId)) return;
        this.rebuild();
    }

    public getVisibleMeshes(): readonly StaticMesh[] {
        return this.visibleMeshes;
    }

    public getVisibleNpcs(): readonly Npc[] {
        return this.visibleNpcs;
    }

    // Undefined once its chunk has unloaded
    public findNpc(npcId: string): Npc | undefined {
        const npcs = this.visibleNpcs;
        for (let i = 0; i < npcs.length; i += 1) {
            if (npcs[i].id === npcId) return npcs[i];
        }
        return undefined;
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

    // Chunk boxes (NPCs included) and the boundary walls
    // TODO: Add other mesh types to the collision system
    public getCollidableAABBs(): readonly AABB[] {
        return this.collidableAABBs;
    }

    // Expose wall AABBs
    // TODO: Consider making private for non-debug version
    public getBoundaryWallAABBs(): readonly AABB[] {
        return this.boundaryWalls;
    }

    // Refills every list from the chunks. Runs on chunk add and remove, so its allocations
    // happen at the allocation boundary (M-2), not per tick. Indexed loops, no spread (M-3).
    private rebuild(): void {
        this.visibleMeshes.length = 0;
        this.visibleNpcs.length = 0;
        this.collidableAABBs.length = 0;

        this.chunks.forEach((chunk) => {
            for (let i = 0; i < chunk.meshes.length; i += 1) this.visibleMeshes.push(chunk.meshes[i]);
            for (let i = 0; i < chunk.npcs.length; i += 1) this.visibleNpcs.push(chunk.npcs[i]);
            for (let i = 0; i < chunk.collisionAABBs.length; i += 1) this.collidableAABBs.push(chunk.collisionAABBs[i]);
        });

        // Every chunk's walls, since adding or removing one changes its neighbours' walls too
        this.rebuildBoundaryWalls();
        for (let i = 0; i < this.boundaryWalls.length; i += 1) this.collidableAABBs.push(this.boundaryWalls[i]);
    }

    private rebuildBoundaryWalls(): void {
        const walls = this.boundaryWalls;
        walls.length = 0;

        this.chunks.forEach((chunk) => {
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
                const neighbor = this.chunks.get(World.getChunkID(nx, nz));
                if (!(neighbor?.hasContent ?? false)) {
                    walls.push(this.getEdgeWall(chunk, side));
                }
            });
        });
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
