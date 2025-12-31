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

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    createPlaneMesh(_size: number): MeshHandle {
        return { id: 'stub-plane' };
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    createCubeMesh(_size: number): MeshHandle {
        return { id: 'stub-cube' };
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    createPyramidMesh(_size: number): MeshHandle {
        return { id: 'stub-pyramid' };
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    createPrismMesh(_width: number, _height: number, _depth: number): MeshHandle {
        return { id: 'stub-prism' };
    }

    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    createSphereMesh(_radius: number, _segments: number): MeshHandle {
        return { id: 'stub-sphere' };
    }
}
