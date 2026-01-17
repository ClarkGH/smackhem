/* eslint-disable no-unused-vars */
import type { Renderer, MeshHandle, TextureHandle } from '../../services/renderer';
import type { Mat4, Vec3 } from '../../types/common';

/**
 * Null renderer stub implementation
 * Provides a fully functional stub that implements all Renderer methods
 * Useful for testing and validating portability (RULE P-1: Deletion Test)
 */
export default class NullRenderer implements Renderer {
    private meshCounter = 0;

    private textureCounter = 0;

    private lightDirection: Vec3 = { x: -1, y: 0, z: 0 };

    private lightColor: Vec3 = { x: 1, y: 1, z: 1 };

    private ambientIntensity: number = 0.3;

    private wireframeEnabled = false;

    private frameCount = 0;

    beginFrame(): void {
        this.frameCount += 1;
        // Stub implementation - could track frame stats here
    }

    drawMesh(_mesh: MeshHandle, _transform: Mat4, _color: Vec3): void {
        // Stub implementation - could validate mesh handle here
        // Could track draw calls for testing
    }

    endFrame(): void {
        // Stub implementation - frame complete
    }

    setWireframe(_enabled: boolean): void {
        this.wireframeEnabled = _enabled;
        // Stub implementation - state is tracked but not used
    }

    createPlaneMesh(_size: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-plane-${this.meshCounter}` };
    }

    createCubeMesh(_size: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-cube-${this.meshCounter}` };
    }

    createPyramidMesh(_size: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-pyramid-${this.meshCounter}` };
    }

    createPrismMesh(_width: number, _height: number, _depth: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-prism-${this.meshCounter}` };
    }

    createSphereMesh(_radius: number, _segments: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-sphere-${this.meshCounter}` };
    }

    async loadTexture(_assetId: string): Promise<TextureHandle> {
        // Stub implementation - returns immediately with unique ID
        this.textureCounter += 1;
        return { id: `stub_texture_${_assetId}_${this.textureCounter}` };
    }

    drawTexturedQuad(_texture: TextureHandle, _transform: Mat4, _size: number): void {
        // Stub implementation - validates texture handle exists
        if (!_texture.id.startsWith('stub_texture_')) {
            throw new Error(`Invalid texture handle: ${_texture.id}`);
        }
    }

    // Optional lighting methods (Renderer interface extension)
    setLightDirection(_direction: Vec3): void {
        this.lightDirection = { ..._direction };
    }

    setLightColor(_color: Vec3): void {
        this.lightColor = { ..._color };
    }

    setAmbientIntensity(_intensity: number): void {
        this.ambientIntensity = _intensity;
    }

    // Stub-specific utility methods for testing
    getFrameCount(): number {
        return this.frameCount;
    }

    getMeshCount(): number {
        return this.meshCounter;
    }

    getTextureCount(): number {
        return this.textureCounter;
    }

    getLightingState(): { direction: Vec3; color: Vec3; ambient: number } {
        return {
            direction: { ...this.lightDirection },
            color: { ...this.lightColor },
            ambient: this.ambientIntensity,
        };
    }

    reset(): void {
        this.meshCounter = 0;
        this.textureCounter = 0;
        this.frameCount = 0;
        this.wireframeEnabled = false;
        this.lightDirection = { x: -1, y: 0, z: 0 };
        this.lightColor = { x: 1, y: 1, z: 1 };
        this.ambientIntensity = 0.3;
    }
}
