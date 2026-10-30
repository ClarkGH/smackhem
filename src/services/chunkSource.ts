// Where chunk files come from, and nothing else: the platform finds and reads them,
// core turns the text into a Chunk (data-formats.md). Text in, so this service needs no core types.
export interface ChunkSource {
    // The chunk's JSON text, or null when there's no chunk there.
    // Rejects when a chunk is there but can't be read.
    fetchChunkJSON(_chunkX: number, _chunkZ: number): Promise<string | null>;
}
