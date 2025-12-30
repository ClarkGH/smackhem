import { Mat4, Vec3 } from "../types/common";

export interface MeshHandle {
    // Placeholder type for mesh references
    id: string;
}

export interface Renderer {
    beginFrame(): void;
    drawMesh(mesh: MeshHandle, transform: Mat4, color: Vec3): void;
    endFrame(): void;
    setWireframe(enabled: boolean): void;
}
