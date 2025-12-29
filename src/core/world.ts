import { MeshHandle, Renderer } from "src/services/renderer";
import { Mat4, Vec3 } from "src/types/common";

// TODO: We may want to move this and other typing/interface namespaces to common classes down the line.
export type ChunkID = string;

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

export class AABB {
    constructor(
        public min: Vec3 = {x: 0, y : 0, z: 0},
        public max: Vec3 = {x: 0, y : 0, z: 0}
    ) {}
  
    // Check if a point is inside this chunk
    contains(point: Vec3): boolean {
        return (
            point.x >= this.min.x && point.x <= this.max.x &&
            point.y >= this.min.y && point.y <= this.max.y &&
            point.z >= this.min.z && point.z <= this.max.z
        );
    }
}

export class World {
    activeChunks: Map<ChunkID, Chunk> = new Map();
  
    // Helper to generate a coordinate-based ID (e.g., "0,0")
    getChunkID(x: number, z: number): ChunkID {
        return `${x},${z}`;
    }
  
    addChunk(chunk: Chunk) {
        this.activeChunks.set(chunk.id, chunk);
    }
  
    render(renderer: Renderer) {
        for (const chunk of this.activeChunks.values()) {
            for (const sm of chunk.meshes) {
            renderer.drawMesh(sm.mesh, sm.transform, sm.color);
            }
        }
    }
}
