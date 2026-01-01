/* eslint-disable no-unused-vars */
import type { Renderer, MeshHandle } from '../../services/renderer';
import type { Mat4, Vec3 } from '../../types/common';

export default class NullRenderer implements Renderer {
    beginFrame(): void {
        // No-op: stub implementation
    }

    drawMesh(_mesh: MeshHandle, _transform: Mat4, _color: Vec3): void {
        // No-op: stub implementation
    }

    endFrame(): void {
        // No-op: stub implementation
    }

    setWireframe(_enabled: boolean): void {
        // No-op: stub implementation
    }

    createPlaneMesh(_size: number): MeshHandle {
        return { id: 'stub-plane' };
    }

    createCubeMesh(_size: number): MeshHandle {
        return { id: 'stub-cube' };
    }

    createPyramidMesh(_size: number): MeshHandle {
        return { id: 'stub-pyramid' };
    }

    createPrismMesh(_width: number, _height: number, _depth: number): MeshHandle {
        return { id: 'stub-prism' };
    }

    createSphereMesh(_radius: number, _segments: number): MeshHandle {
        return { id: 'stub-sphere' };
    }
}
