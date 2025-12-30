export interface MapData {
    id: string;
    chunks: Chunk[];
    // ... other map properties
}

export interface Mat4 {
    // Placeholder 4x4 matrix type
    elements: Float32Array;
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
