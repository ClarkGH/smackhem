import type { Renderer, MeshHandle } from '../../services/renderer';
import type { Mat4, Vec3 } from '../../types/common';

export class NullRenderer implements Renderer {
    beginFrame(): void {
        // No-op: stub implementation
    }

    drawMesh(mesh: MeshHandle, transform: Mat4, color: Vec3): void {
        // No-op: stub implementation
    }

    endFrame(): void {
        // No-op: stub implementation
    }

    setWireframe(enabled: boolean): void {
        // No-op: stub implementation
    }
}

