import type { Renderer } from './renderer';
import type { Chunk, StaticMesh } from '../core/world';
import type { Vec3 } from '../types/common';
import { createAABB } from '../core/math/aabb';
import { createTranslationMatrix } from '../core/math/mathHelpers';
import { CHUNK_SIZE } from '../core/world';

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
 * JSON representation of a chunk (from file)
 */
export interface ChunkJSON {
    version: number;
    id: string;
    bounds: [number, number, number, number, number, number]; // [minX, minY, minZ, maxX, maxY, maxZ]
    meshes: MeshJSON[];
    template?: string; // Phase 2: template reference (future)
}

const EXPECTED_SCHEMA_VERSION = 1;

/**
 * Chunk loader service - converts JSON chunk data into Chunk objects with mesh handles.
 *
 * Key requirements:
 * - Batch mesh creation per chunk (all meshes created together, not individually)
 * - Mesh creation only during chunk load/unload (not per-frame)
 * - Validate version field for schema evolution
 * - Cache loaded chunks to avoid re-parsing
 */
export class ChunkLoader {
    private cache: Map<string, ChunkJSON> = new Map();

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

        if (!Array.isArray(data.bounds) || data.bounds.length !== 6) {
            throw new Error('Chunk JSON \'bounds\' must be array of 6 numbers [minX, minY, minZ, maxX, maxY, maxZ]');
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
    ): StaticMesh[] {
        const meshes: StaticMesh[] = [];

        // Batch creation: iterate through all meshes and create them together
        meshesJSON.forEach((meshJSON) => {
            try {
                const staticMesh = this.createMeshFromJSON(meshJSON, chunkCenterX, chunkCenterZ, renderer);
                if (staticMesh) {
                    meshes.push(staticMesh);
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
                    const staticMesh = this.createMeshFromJSON(fallbackMesh, chunkCenterX, chunkCenterZ, renderer);
                    if (staticMesh) {
                        meshes.push(staticMesh);
                    }
                } catch (fallbackError) {
                    console.error('Fallback mesh creation also failed:', fallbackError);
                }
            }
        });

        return meshes;
    }

    /**
     * Create a single StaticMesh from JSON mesh data
     */
    private createMeshFromJSON(
        meshJSON: MeshJSON,
        chunkCenterX: number,
        chunkCenterZ: number,
        renderer: Renderer,
    ): StaticMesh | null {
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
                meshHandle = renderer.createCubeMesh(scaleX);
                yPos = worldY + scaleY / 2; // Center cube on Y
                break;

            case 'pyramid':
                meshHandle = renderer.createPyramidMesh(scaleX);
                yPos = worldY + scaleY * 0.6; // Adjust for pyramid center
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

        return {
            mesh: meshHandle,
            transform,
            color,
        };
    }

    /**
     * Load chunk from JSON data
     * Returns Chunk object with mesh handles ready for rendering
     */
    loadChunkFromJSON(
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
        const meshes = this.createMeshesFromJSON(chunkJSON.meshes, chunkCenterX, chunkCenterZ, renderer);

        // Debug: Check what meshes were created
        console.log(`Chunk ${chunkX},${chunkZ}: Created ${meshes.length} meshes from ${chunkJSON.meshes.length} JSON meshes`);
        meshes.forEach((mesh, i) => {
            const pos = {
                x: mesh.transform.elements[12],
                y: mesh.transform.elements[13],
                z: mesh.transform.elements[14],
            };
            console.log(`  Mesh ${i}: type=${chunkJSON.meshes[i]?.type}, pos=(${pos.x}, ${pos.y}, ${pos.z}), color=(${mesh.color.x}, ${mesh.color.y}, ${mesh.color.z})`);
        });
        // Create bounds AABB from JSON bounds array
        // Create bounds AABB from JSON bounds array
        const bounds = createAABB(
            { x: chunkJSON.bounds[0], y: chunkJSON.bounds[1], z: chunkJSON.bounds[2] },
            { x: chunkJSON.bounds[3], y: chunkJSON.bounds[4], z: chunkJSON.bounds[5] },
        );

        return {
            id: chunkJSON.id,
            bounds,
            meshes,
        };
    }

    /**
     * Create empty chunk (fallback for missing chunks)
     * Contains only a floor plane
     */
    createEmptyChunk(chunkX: number, chunkZ: number, renderer: Renderer): Chunk {
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
        };
    }

    /**
     * Cache JSON text for a chunk (avoids re-parsing)
     */
    cacheJSON(chunkId: string, jsonText: string): void {
        this.cache.set(chunkId, JSON.parse(jsonText) as ChunkJSON);
    }

    /**
     * Get cached JSON for a chunk (if available)
     */
    getCachedJSON(chunkId: string): ChunkJSON | undefined {
        return this.cache.get(chunkId);
    }

    /**
     * Clear cache (useful for testing or memory management)
     */
    clearCache(): void {
        this.cache.clear();
    }
}
