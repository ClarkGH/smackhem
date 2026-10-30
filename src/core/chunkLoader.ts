import type { Renderer } from '../services/renderer';
import type { ChunkSource } from '../services/chunkSource';
import type { Chunk, Npc, StaticMesh } from './world';
import type { Vec3 } from '../types/common';
import { AABB, createAABB } from './math/aabb';
import { createTranslationMatrix } from './math/mathHelpers';
import { CHUNK_SIZE, World } from './world';

/**
 * JSON representation of a mesh (from file)
 */
export interface MeshJSON {
    type: 'plane' | 'cube' | 'pyramid' | 'sphere' | 'prism';
    pos: [number, number, number] | number[];
    scale: [number, number, number] | number[] | number;
    color: [number, number, number] | number[];
    segments?: number; // For sphere mesh
}

/**
 * JSON representation of an NPC (from file)
 */
export interface NpcJSON {
    id: string;
    sprite: string; // asset ID, e.g. "lmao_idle_1"
    pos: number[]; // relative to chunk center, like meshes
    size: number;
    line: string;
    encounterId?: string;
    // What starts a hostile NPC's fight: talking (a Yes/No question) or touching it. Missing means talk.
    startsFightOn?: 'talk' | 'touch';
}

/**
 * JSON representation of a chunk (from file)
 */
export interface ChunkJSON {
    version: number;
    id: string;
    // Deprecated (version 1), bounds are worked out from the chunk's coordinates now. [minX, minY, minZ, maxX, maxY, maxZ]
    bounds?: [number, number, number, number, number, number];
    meshes: MeshJSON[];
    npcs?: NpcJSON[];
    template?: string; // Phase 2: template reference (future)
}

// Version 2: inline meshes, no bounds (see docs/data-formats.md)
const EXPECTED_SCHEMA_VERSION = 2;

/**
 * Chunk loader service - converts JSON chunk data into Chunk objects with mesh handles.
 *
 * Key requirements:
 * - Batch mesh creation per chunk (all meshes created together, not individually)
 * - Mesh creation only during chunk load/unload (not per-frame)
 * - Validate version field for schema evolution
 * - Keep loaded chunks, so walking back into one reuses it (loadChunk)
 */
export class ChunkLoader {
    // Every chunk loadChunk has made, empty stand-ins too, for the whole session
    private readonly chunks: Map<string, Chunk> = new Map();

    /**
     * A chunk by coordinates: from the platform's file, or an empty floor when there's none or it can't be read.
     * A stand-in is kept like a real chunk, so a missing or broken file is only asked for once.
     */
    public async loadChunk(source: ChunkSource, chunkX: number, chunkZ: number, renderer: Renderer): Promise<Chunk> {
        const chunkId = World.getChunkID(chunkX, chunkZ);
        const kept = this.chunks.get(chunkId);
        if (kept) return kept;

        let chunk: Chunk;
        try {
            const jsonText = await source.fetchChunkJSON(chunkX, chunkZ);
            if (jsonText === null) {
                chunk = this.createEmptyChunk(chunkX, chunkZ, renderer);
            } else {
                chunk = this.loadChunkFromJSON(jsonText, chunkX, chunkZ, renderer);
                // The file's own id can be anything ("0,0" in a copied template): the coordinates decide
                chunk.id = chunkId;
            }
        } catch (error) {
            console.error(`Unavailable chunk ${chunkId}:`, error);
            chunk = this.createEmptyChunk(chunkX, chunkZ, renderer);
        }
        this.chunks.set(chunkId, chunk);
        return chunk;
    }

    /**
     * Parse and validate JSON chunk data
     */
    private parseChunkJSON(jsonText: string): ChunkJSON {
        const data = JSON.parse(jsonText) as Partial<ChunkJSON>;

        // Validate version field (required)
        if (typeof data.version !== 'number') {
            throw new Error('Chunk JSON missing required \'version\' field');
        }

        if (data.version !== EXPECTED_SCHEMA_VERSION) {
            console.warn(
                `Chunk JSON version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${data.version}. `
                + 'Attempting to parse, but behavior may be undefined.',
            );
        }

        // Validate required fields
        if (!data.id || typeof data.id !== 'string') {
            throw new Error('Chunk JSON missing required \'id\' field');
        }

        if (!Array.isArray(data.meshes)) {
            throw new Error('Chunk JSON \'meshes\' must be an array');
        }

        return data as ChunkJSON;
    }

    /**
     * Convert JSON mesh data to StaticMesh with mesh handles
     * Batch: Creates all meshes for a chunk at once
     */
    private createMeshesFromJSON(
        meshesJSON: MeshJSON[],
        chunkCenterX: number,
        chunkCenterZ: number,
        renderer: Renderer,
    ): {
        meshes: StaticMesh[];
        collisionAABBs: AABB[];
    } {
        const meshes: StaticMesh[] = [];
        const collisionAABBs: AABB[] = [];

        // Batch creation: iterate through all meshes and create them together
        meshesJSON.forEach((meshJSON) => {
            try {
                const result = this.createMeshFromJSON(meshJSON, chunkCenterX, chunkCenterZ, renderer);
                if (result) {
                    meshes.push(result.mesh);

                    if (result.collisionAABB) {
                        collisionAABBs.push(result.collisionAABB);
                    }
                }
            } catch (error) {
                console.error(`Failed to create mesh of type '${meshJSON.type}':`, error);
                // Fallback: create cube if mesh type is invalid
                const fallbackMesh: MeshJSON = {
                    type: 'cube',
                    pos: meshJSON.pos || [0, 0, 0],
                    scale: meshJSON.scale || [1, 1, 1],
                    color: meshJSON.color || [0.5, 0.5, 0.5],
                };
                try {
                    const result = this.createMeshFromJSON(fallbackMesh, chunkCenterX, chunkCenterZ, renderer);
                    if (result) {
                        meshes.push(result.mesh);

                        if (result.collisionAABB) {
                            collisionAABBs.push(result.collisionAABB);
                        }
                    }
                } catch (fallbackError) {
                    console.error('Fallback mesh creation also failed:', fallbackError);
                }
            }
        });

        return {
            meshes,
            collisionAABBs,
        };
    }

    /**
     * Create a single StaticMesh from JSON mesh data
     */
    private createMeshFromJSON(
        meshJSON: MeshJSON,
        chunkCenterX: number,
        chunkCenterZ: number,
        renderer: Renderer,
    ): { mesh: StaticMesh; collisionAABB: AABB | null } | null {
        // Parse position (relative to chunk center)
        const posArray = Array.isArray(meshJSON.pos) ? meshJSON.pos : [0, 0, 0];
        const worldX = chunkCenterX + (posArray[0] || 0);
        const worldY = posArray[1] || 0;
        const worldZ = chunkCenterZ + (posArray[2] || 0);

        // Parse scale (can be single number or array)
        let scaleX: number;
        let scaleY: number;
        let scaleZ: number;

        if (typeof meshJSON.scale === 'number') {
            scaleX = meshJSON.scale;
            scaleY = meshJSON.scale;
            scaleZ = meshJSON.scale;
        } else if (Array.isArray(meshJSON.scale)) {
            scaleX = meshJSON.scale[0] || 1;
            scaleY = meshJSON.scale[1] || meshJSON.scale[0] || 1;
            scaleZ = meshJSON.scale[2] || meshJSON.scale[0] || 1;
        } else {
            scaleX = 1;
            scaleY = 1;
            scaleZ = 1;
        }

        // Parse color
        const colorArray = Array.isArray(meshJSON.color) ? meshJSON.color : [0.5, 0.5, 0.5];
        const color: Vec3 = {
            x: colorArray[0] ?? 0.5,
            y: colorArray[1] ?? 0.5,
            z: colorArray[2] ?? 0.5,
        };

        // Create mesh handle based on type
        let meshHandle;
        let yPos = worldY;

        switch (meshJSON.type) {
            case 'plane':
                // For plane, scale represents size (typically [size, 1, size])
                meshHandle = renderer.createPlaneMesh(scaleX);
                yPos = worldY; // Plane sits on Y=0
                break;

            case 'cube':
                // A cube has one size, scale[0]. Uneven boxes are prisms.
                if (scaleY !== scaleX || scaleZ !== scaleX) {
                    console.warn(`Cube with uneven scale [${scaleX}, ${scaleY}, ${scaleZ}] uses only ${scaleX}; use a prism for uneven boxes`);
                }
                meshHandle = renderer.createCubeMesh(scaleX);
                yPos = worldY + scaleX / 2; // The mesh is centered on its origin
                break;

            case 'pyramid':
                // The mesh's base is already at its origin, so it sits at pos[1] as is
                meshHandle = renderer.createPyramidMesh(scaleX);
                yPos = worldY;
                break;

            case 'prism':
                meshHandle = renderer.createPrismMesh(scaleX, scaleY, scaleZ);
                yPos = worldY + scaleY / 2; // Center prism on Y
                break;

            case 'sphere': {
                const radius = scaleX / 2;
                const segments = meshJSON.segments ?? 12;
                meshHandle = renderer.createSphereMesh(radius, segments);
                yPos = worldY + radius; // Center sphere on Y
                break;
            }

            default:
                console.error(`Unknown mesh type: ${(meshJSON as { type: string }).type}`);
                return null;
        }

        // Create transform matrix (translation only for now)
        const transform = createTranslationMatrix(worldX, yPos, worldZ);

        const staticMesh: StaticMesh = {
            mesh: meshHandle,
            transform,
            color,
        };

        let collisionAABB: AABB | null = null;

        if (meshJSON.type === 'cube') {
            // One size on every axis, matching what's drawn
            collisionAABB = createAABB(
                { x: worldX - scaleX / 2, y: worldY, z: worldZ - scaleX / 2 },
                { x: worldX + scaleX / 2, y: worldY + scaleX, z: worldZ + scaleX / 2 },
            );
        } else if (meshJSON.type === 'prism') {
            collisionAABB = createAABB(
                {
                    x: worldX - scaleX / 2,
                    y: worldY,
                    z: worldZ - scaleZ / 2,
                },
                {
                    x: worldX + scaleX / 2,
                    y: worldY + scaleY,
                    z: worldZ + scaleZ / 2,
                },
            );
        } else if (meshJSON.type === 'pyramid') {
            collisionAABB = createAABB(
                {
                    x: worldX - scaleX / 2,
                    y: worldY,
                    z: worldZ - scaleX / 2,
                },
                {
                    x: worldX + scaleX / 2,
                    y: worldY + scaleX,
                    z: worldZ + scaleX / 2,
                },
            );
        } else if (meshJSON.type === 'sphere') {
            const radius = scaleX / 2;

            collisionAABB = createAABB(
                {
                    x: worldX - radius,
                    y: worldY,
                    z: worldZ - radius,
                },
                {
                    x: worldX + radius,
                    y: worldY + radius * 2,
                    z: worldZ + radius,
                },
            );
        }

        return {
            mesh: staticMesh,
            collisionAABB,
        };
    }

    /**
     * Load chunk from JSON data
     * Returns Chunk object with mesh handles ready for rendering
     */
    public loadChunkFromJSON(
        jsonText: string,
        chunkX: number,
        chunkZ: number,
        renderer: Renderer,
    ): Chunk {
        // Parse and validate JSON
        const chunkJSON = this.parseChunkJSON(jsonText);

        // Calculate chunk center position
        const chunkCenterX = chunkX * CHUNK_SIZE;
        const chunkCenterZ = chunkZ * CHUNK_SIZE;

        // Batch create all meshes for this chunk
        const { meshes, collisionAABBs } = this.createMeshesFromJSON(chunkJSON.meshes, chunkCenterX, chunkCenterZ, renderer);

        // NPC boxes join the chunk's collision, so the player can't walk through them
        const npcs = this.createNpcsFromJSON(chunkJSON.npcs, chunkCenterX, chunkCenterZ);
        npcs.forEach((npc) => collisionAABBs.push(npc.collisionAABB));

        const bounds = createAABB(
            { x: chunkCenterX - CHUNK_SIZE / 2, y: -1, z: chunkCenterZ - CHUNK_SIZE / 2 },
            { x: chunkCenterX + CHUNK_SIZE / 2, y: 5, z: chunkCenterZ + CHUNK_SIZE / 2 },
        );

        return {
            id: chunkJSON.id,
            bounds,
            meshes,
            collisionAABBs,
            hasContent: true,
            npcs,
        };
    }

    /**
     * NPCs from JSON, optional. A bad entry is skipped with a warning, the rest still load.
     */
    private createNpcsFromJSON(
        npcsJSON: NpcJSON[] | undefined,
        chunkCenterX: number,
        chunkCenterZ: number,
    ): Npc[] {
        const npcs: Npc[] = [];
        if (!Array.isArray(npcsJSON)) return npcs;

        npcsJSON.forEach((npcJSON, i) => {
            const {
                id, sprite, pos, size, line, encounterId, startsFightOn = 'talk',
            } = npcJSON;
            if (typeof id !== 'string' || typeof sprite !== 'string' || typeof line !== 'string'
                // Finite as well: JSON.parse reads 1e999 as Infinity, an endless box nobody could move in
                || typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || !Array.isArray(pos)
                // Optional, but a broken one would make a hostile NPC quietly friendly
                || (encounterId !== undefined && typeof encounterId !== 'string')
                // Optional too. Touch with nothing to fight would be a trigger that can never fire.
                || (startsFightOn !== 'talk' && startsFightOn !== 'touch')
                || (startsFightOn === 'touch' && encounterId === undefined)) {
                console.warn(`Skipping NPC ${i}: needs id, sprite, line, pos, a positive, finite size, a string encounterId if any, `
                    + 'and startsFightOn talk or touch (touch only with an encounterId) if any');
                return;
            }

            // Base of the sprite, like a mesh's pos
            const position: Vec3 = {
                x: chunkCenterX + (pos[0] || 0),
                y: pos[1] || 0,
                z: chunkCenterZ + (pos[2] || 0),
            };
            const half = size / 2;
            npcs.push({
                id,
                textureId: sprite,
                position,
                size,
                collisionAABB: createAABB(
                    { x: position.x - half, y: position.y, z: position.z - half },
                    { x: position.x + half, y: position.y + size, z: position.z + half },
                ),
                line,
                encounterId,
                startsFightOn,
            });
        });

        return npcs;
    }

    /**
     * Create empty chunk (fallback for missing chunks)
     * Contains only a floor plane
     */
    public createEmptyChunk(chunkX: number, chunkZ: number, renderer: Renderer): Chunk {
        const chunkCenterX = chunkX * CHUNK_SIZE;
        const chunkCenterZ = chunkZ * CHUNK_SIZE;
        const chunkId = `${chunkX},${chunkZ}`;

        const floorTransform = createTranslationMatrix(chunkCenterX, 0, chunkCenterZ);
        const floorMesh = renderer.createPlaneMesh(CHUNK_SIZE);

        const bounds = createAABB(
            { x: chunkCenterX - CHUNK_SIZE / 2, y: -1, z: chunkCenterZ - CHUNK_SIZE / 2 },
            { x: chunkCenterX + CHUNK_SIZE / 2, y: 5, z: chunkCenterZ + CHUNK_SIZE / 2 },
        );

        return {
            id: chunkId,
            bounds,
            meshes: [
                {
                    mesh: floorMesh,
                    transform: floorTransform,
                    color: { x: 0.4, y: 0.4, z: 0.4 },
                },
            ],
            collisionAABBs: [],
            hasContent: false,
            npcs: [],
        };
    }
}
