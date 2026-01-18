import type { AssetLoader } from '../../services/assetLoader';
import type { MapData } from '../../types/common';
import { ChunkLoader } from '../../services/chunkLoader';
import type { Renderer } from '../../services/renderer';
import type { Chunk } from '../../core/world';

/**
 * Web platform implementation of AssetLoader
 * Handles loading chunk JSON files via fetch()
 */
// eslint-disable-next-line import/prefer-default-export
export class WebAssetLoader implements AssetLoader {
    /**
     * Offset applied to chunk coordinates for filename generation.
     * Prevents negative coordinates in filenames (e.g., -1_0.json -> 9999_10000.json).
     * Supports world range from -10000 to +10000 chunks in each direction.
     */
    private static readonly CHUNK_COORD_OFFSET = 10000;

    private chunkLoader: ChunkLoader = new ChunkLoader();

    private chunkCache: Map<string, Chunk> = new Map();

    private basePath: string;

    constructor(basePath: string = '/chunks/') {
        this.basePath = basePath;
    }

    /**
     * Load map data (legacy interface - for future use)
     */
    // eslint-disable-next-line no-unused-vars
    async loadMap(_id: string): Promise<MapData> {
        // Not implemented yet - maps may contain multiple chunks
        // For now, we load chunks individually
        throw new Error('loadMap not implemented - use loadChunk instead');
    }

    /**
     * Load texture asset
     */
    async loadTexture(assetId: string): Promise<ImageBitmap> {
        const response = await fetch(`/assets/${assetId}.png`);
        if (!response.ok) {
            throw new Error(`Failed to load texture: ${assetId}`);
        }
        const blob = await response.blob();
        return createImageBitmap(blob);
    }

    /**
     * Load a single chunk from JSON file
     * File path format: /chunks/{fileX}_{fileZ}.json
     * Where fileX = chunkX + CHUNK_COORD_OFFSET, fileZ = chunkZ + CHUNK_COORD_OFFSET
     * This ensures all filenames are non-negative (e.g., chunk -1,0 becomes file 9999_10000.json)
     *
     * For now, all chunks load from 0_0.json file (same file reused for all chunks).
     * Chunks are positioned at their correct world coordinates even though they use the same mesh data.
     *
     * @param chunkId - Chunk ID in format "{chunkX},{chunkZ}" (e.g., "0,0", "-1,2")
     * @param chunkX - Chunk X coordinate (can be negative)
     * @param chunkZ - Chunk Z coordinate (can be negative)
     * @param renderer - Renderer instance for mesh creation
     * @returns Promise<Chunk> - Loaded chunk with mesh handles
     */
    async loadChunk(
        chunkId: string,
        chunkX: number,
        chunkZ: number,
        renderer: Renderer,
    ): Promise<Chunk> {
        // Check cache first
        if (this.chunkCache.has(chunkId)) {
            return this.chunkCache.get(chunkId)!;
        }

        // Apply offset to chunk coordinates to generate non-negative filenames
        // This prevents negative coordinates in filenames (e.g., chunk -1,0 becomes file 9999_10000.json)
        // For now, all chunks load from the same file (chunk 0,0's offset file: 10000_10000.json)
        // Future: remove the temporary override below to load per-chunk files
        // eslint-disable-next-line no-unused-vars
        const fileX = chunkX + WebAssetLoader.CHUNK_COORD_OFFSET;
        // eslint-disable-next-line no-unused-vars
        const fileZ = chunkZ + WebAssetLoader.CHUNK_COORD_OFFSET;
        // Temporary: override to use chunk 0,0's offset file for all chunks
        // TODO: Remove these two lines and use fileX/fileZ above when implementing per-chunk file loading
        const tempFileX = 0 + WebAssetLoader.CHUNK_COORD_OFFSET;
        const tempFileZ = 0 + WebAssetLoader.CHUNK_COORD_OFFSET;
        const path = `${this.basePath}${tempFileX}_${tempFileZ}.json`;

        try {
            const response = await fetch(path);

            if (!response.ok) {
                // Chunk file not found - create empty fallback chunk
                const emptyChunk = this.chunkLoader.createEmptyChunk(chunkX, chunkZ, renderer);
                this.chunkCache.set(chunkId, emptyChunk);
                return emptyChunk;
            }

            const jsonText = await response.text();

            // Load and parse chunk - chunkX/chunkZ are used for positioning meshes at correct world coords
            const chunk = this.chunkLoader.loadChunkFromJSON(jsonText, chunkX, chunkZ, renderer);

            // Update chunk ID to match the actual chunk coordinates (not "0,0" from file)
            chunk.id = chunkId;

            // Cache the loaded chunk
            this.chunkCache.set(chunkId, chunk);

            return chunk;
        } catch (error) {
            // Error loading chunk - create empty fallback
            console.error(`Failed to load chunk ${chunkId} from ${path}:`, error);
            const emptyChunk = this.chunkLoader.createEmptyChunk(chunkX, chunkZ, renderer);
            this.chunkCache.set(chunkId, emptyChunk);
            return emptyChunk;
        }
    }

    /**
     * Clear chunk cache (useful for testing or memory management)
     */
    clearCache(): void {
        this.chunkCache.clear();
        this.chunkLoader.clearCache();
    }

    /**
     * Get the chunk loader instance (for advanced usage)
     */
    getChunkLoader(): ChunkLoader {
        return this.chunkLoader;
    }
}
