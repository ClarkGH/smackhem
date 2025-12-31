import { Mat4, Vec3 } from '../types/common';

export interface MeshHandle {
    // Placeholder type for mesh references
    id: string;
}

export interface Renderer {
    beginFrame(): void;
    // eslint-disable-next-line no-unused-vars
    drawMesh(_mesh: MeshHandle, _transform: Mat4, _color: Vec3): void;
    endFrame(): void;
    // eslint-disable-next-line no-unused-vars
    setWireframe(_enabled: boolean): void;
    // eslint-disable-next-line no-unused-vars
    createPlaneMesh(_size: number): MeshHandle;
    // eslint-disable-next-line no-unused-vars
    createCubeMesh(_size: number): MeshHandle;
    // eslint-disable-next-line no-unused-vars
    createPyramidMesh(_size: number): MeshHandle;
    // eslint-disable-next-line no-unused-vars
    createPrismMesh(_width: number, _height: number, _depth: number): MeshHandle;
    // eslint-disable-next-line no-unused-vars
    createSphereMesh(_radius: number, _segments: number): MeshHandle;
    // eslint-disable-next-line no-unused-vars
    setLightDirection?(_direction: Vec3): void;
}
