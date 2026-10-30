import { Mat4, Vec3 } from '../types/common';

export interface MeshHandle {
    // Placeholder type for mesh references
    id: string;
}

export interface TextureHandle {
    // Opaque identifier, FFI-friendly
    id: string;
}

// What's drawn behind the world, as plain data (R-3)
export interface SkyState {
    horizon: Vec3;
    upper: Vec3;
    glow: Vec3;
    sunDirection: Vec3;
    zenith: Vec3;
    stars: number;
    cloudLight: Vec3;
    cloudMid: Vec3;
    cloudShadow: Vec3;
    cloudTime: number;
    starTime: number;
    moonDirection: Vec3;
    sunDisc: Vec3;
    moonDisc: Vec3;
    sunVisibility: number;
    moonVisibility: number;
}

export interface Renderer {
    setSky?(_sky: SkyState): void;
    beginFrame(): void;
    setViewProjection(_viewProj: Mat4): void;
    setViewPosition?(_eye: Vec3): void;
    setShadowCaster?(_direction: Vec3, _strength: number, _focus: Vec3): void;
    setShadowBias?(_scale: number): void;
    drawMesh(_mesh: MeshHandle, _model: Mat4, _color: Vec3, _isLightSource?: boolean): void;
    endFrame(): void;
    createPlaneMesh(_size: number): MeshHandle;
    createCubeMesh(_size: number): MeshHandle;
    createPyramidMesh(_size: number): MeshHandle;
    createPrismMesh(_width: number, _height: number, _depth: number): MeshHandle;
    createSphereMesh(_radius: number, _segments: number): MeshHandle;
    drawScreenQuad(_texture: TextureHandle, _transform: Mat4): void;
    setLightDirection?(_direction: Vec3): void;
    setLightColor?(_color: Vec3): void;
    setAmbientIntensity?(_intensity: number): void;
    setCelestialLighting?(
        _sun: { direction: Vec3; color: Vec3 },
        _moon: { direction: Vec3; color: Vec3 },
    ): void;
    loadTexture(_assetId: string): Promise<TextureHandle>;
    drawTexturedQuad(_texture: TextureHandle, _model: Mat4, _normal?: Vec3): void;
    clear?(_r: number, _g: number, _b: number, _a: number): void;
    getViewportWidth?(): number;
    getViewportHeight?(): number;
    setWireframe(_enabled: boolean): void;
    getWireframeEnabled?(): boolean;
}
