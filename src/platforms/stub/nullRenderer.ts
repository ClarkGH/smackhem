import type { Renderer, MeshHandle } from '../../services/renderer';
import type { Mat4, Vec3 } from '../../types/common';

export default class NullRenderer implements Renderer {
    // eslint-disable-next-line class-methods-use-this
    beginFrame(): void {
        // No-op: stub implementation
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    drawMesh(_mesh: MeshHandle, _transform: Mat4, _color: Vec3): void {
        // No-op: stub implementation
    }

    // eslint-disable-next-line class-methods-use-this
    endFrame(): void {
        // No-op: stub implementation
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    setWireframe(_enabled: boolean): void {
        // No-op: stub implementation
    }
}
