/* eslint-disable no-unused-vars */
import { Mat4, Vec3 } from '../types/common';

export interface MeshHandle {
    // Placeholder type for mesh references
    id: string;
}

export interface TextureHandle {
    // Opaque identifier, FFI-friendly
    id: string;
}

export interface Renderer {
    beginFrame(): void;
    drawMesh(_mesh: MeshHandle, _transform: Mat4, _color: Vec3): void;
    endFrame(): void;
    setWireframe(_enabled: boolean): void;
    createPlaneMesh(_size: number): MeshHandle;
    createCubeMesh(_size: number): MeshHandle;
    createPyramidMesh(_size: number): MeshHandle;
    createPrismMesh(_width: number, _height: number, _depth: number): MeshHandle;
    createSphereMesh(_radius: number, _segments: number): MeshHandle;
    setLightDirection?(_direction: Vec3): void;
    setLightColor?(_color: Vec3): void;
    setAmbientIntensity?(_intensity: number): void;
    setCelestialLighting?(
        _sun: { direction: Vec3; color: Vec3 },
        _moon: { direction: Vec3; color: Vec3 },
    ): void;
    loadTexture(_assetId: string): Promise<TextureHandle>;
    drawTexturedQuad(_texture: TextureHandle, _transform: Mat4, _size: number, _normal?: Vec3): void;
    clear?(_r: number, _g: number, _b: number, _a: number): void;
    getViewportWidth?(): number;
    getViewportHeight?(): number;
}
