// Abstract Renderer service

export interface MeshHandle {
    // Placeholder type for mesh references
    id: string;
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
  
export interface Renderer {
    beginFrame(): void;
    drawMesh(mesh: MeshHandle, transform: Mat4, color: Vec3): void;
    endFrame(): void;
}
