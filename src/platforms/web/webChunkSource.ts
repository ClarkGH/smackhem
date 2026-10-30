import type { ChunkSource } from '../../services/chunkSource';

/**
 * The web's ChunkSource: chunk JSON files fetched from the server.
 * Turning them into chunks, and what to do when one is missing, is core's ChunkLoader.
 */
export default class WebChunkSource implements ChunkSource {
    /**
     * Offset applied to chunk coordinates for filename generation.
     * Prevents negative coordinates in filenames (e.g., -1_0.json -> 9999_10000.json).
     * Supports world range from -10000 to +10000 chunks in each direction.
     */
    private static readonly CHUNK_COORD_OFFSET = 10000;

    private basePath: string;

    constructor(basePath: string = '/chunks/') {
        this.basePath = basePath;
    }

    /**
     * File path format: /chunks/{fileX}_{fileZ}.json
     * Where fileX = chunkX + CHUNK_COORD_OFFSET, fileZ = chunkZ + CHUNK_COORD_OFFSET
     * This ensures all filenames are non-negative (e.g., chunk -1,0 becomes file 9999_10000.json)
     */
    public async fetchChunkJSON(chunkX: number, chunkZ: number): Promise<string | null> {
        const fileX = chunkX + WebChunkSource.CHUNK_COORD_OFFSET;
        const fileZ = chunkZ + WebChunkSource.CHUNK_COORD_OFFSET;
        const path = `${this.basePath}${fileX}_${fileZ}.json`;

        // Pre-flight check: Does the file exist AND is it actually a JSON file?
        const fileExists = await fetch(path, { method: 'HEAD' })
            .then((res) => {
                const isOk = res.ok;
                const contentType = res.headers.get('content-type') || '';
                // If Vite serves an HTML 404 fallback page, the content-type will contain 'text/html'
                return isOk && contentType.includes('application/json');
            })
            .catch(() => false);
        if (!fileExists) return null;

        const response = await fetch(path);
        return response.text();
    }
}
