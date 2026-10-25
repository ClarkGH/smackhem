import type {
    Renderer, MeshHandle, SkyState, TextureHandle,
} from '../../services/renderer';
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

    private sunDirection: Vec3 = { x: -1, y: 0, z: 0 };

    private sunColor: Vec3 = { x: 0, y: 0, z: 0 };

    private moonDirection: Vec3 = { x: 1, y: 0, z: 0 };

    private moonColor: Vec3 = { x: 0, y: 0, z: 0 };

    private wireframeEnabled = false;

    private frameCount = 0;

    private readonly viewProj = new Float32Array(16);

    // Models drawn since beginFrame, by reference, so tests can tell a model from an MVP
    private readonly meshModels: Mat4[] = [];

    private readonly sky: SkyState = {
        horizon: { x: 0, y: 0, z: 0 },
        upper: { x: 0, y: 0, z: 0 },
        zenith: { x: 0, y: 0, z: 0 },
        glow: { x: 0, y: 0, z: 0 },
        sunDirection: { x: 0, y: 0, z: 0 },
        stars: 0,
    };

    // Whether setSky came between the last endFrame and this beginFrame, for the ordering contract.
    // Reset at endFrame, not beginFrame: otherwise a late setSky in one frame counts for the next.
    private skySetBetweenFrames = false;

    private skySetBeforeBegin = false;

    public beginFrame(): void {
        this.frameCount += 1;
        this.meshModels.length = 0;
        this.lightSourceDraws.length = 0;
        this.skySetBeforeBegin = this.skySetBetweenFrames;
    }

    public setSky(_sky: SkyState): void {
        (['horizon', 'upper', 'zenith', 'glow', 'sunDirection'] as const).forEach((field) => {
            this.sky[field].x = _sky[field].x; this.sky[field].y = _sky[field].y; this.sky[field].z = _sky[field].z;
        });
        this.sky.stars = _sky.stars;
        this.skySetBetweenFrames = true;
    }

    public getSky(): SkyState {
        return {
            horizon: { ...this.sky.horizon },
            upper: { ...this.sky.upper },
            zenith: { ...this.sky.zenith },
            glow: { ...this.sky.glow },
            sunDirection: { ...this.sky.sunDirection },
            stars: this.sky.stars,
        };
    }

    public wasSkySetBeforeBeginFrame(): boolean {
        return this.skySetBeforeBegin;
    }

    private readonly shadowCaster = { direction: { x: 0, y: 1, z: 0 }, strength: 0, focus: { x: 0, y: 0, z: 0 } };

    public setShadowCaster(_direction: Vec3, _strength: number, _focus: Vec3): void {
        const caster = this.shadowCaster;
        caster.direction.x = _direction.x; caster.direction.y = _direction.y; caster.direction.z = _direction.z;
        caster.strength = _strength;
        caster.focus.x = _focus.x; caster.focus.y = _focus.y; caster.focus.z = _focus.z;
    }

    private shadowBiasScale = 1;

    public setShadowBias(_scale: number): void {
        this.shadowBiasScale = _scale;
    }

    public getShadowBias(): number {
        return this.shadowBiasScale;
    }

    private readonly eye = { x: 0, y: 0, z: 0 };

    public setViewPosition(_eye: Vec3): void {
        this.eye.x = _eye.x; this.eye.y = _eye.y; this.eye.z = _eye.z;
    }

    public getViewPosition(): Vec3 {
        return { ...this.eye };
    }

    public setViewProjection(_viewProj: Mat4): void {
        this.viewProj.set(_viewProj.elements);
    }

    // Light sources drawn this frame (sun, moon, debug walls), copied
    private readonly lightSourceDraws: Array<{ color: Vec3; opacity: number }> = [];

    public drawMesh(_mesh: MeshHandle, _model: Mat4, _color: Vec3, _isLightSource?: boolean, _opacity?: number): void {
        this.meshModels.push(_model);
        if (_isLightSource) {
            this.lightSourceDraws.push({ color: { ..._color }, opacity: _opacity ?? 1 });
        }
    }

    public getLightSourceDraws(): ReadonlyArray<{ color: Vec3; opacity: number }> {
        return this.lightSourceDraws;
    }

    public endFrame(): void {
        this.skySetBetweenFrames = false;
    }

    public setWireframe(_enabled: boolean): void {
        this.wireframeEnabled = _enabled;
        // Stub implementation - state is tracked but not used
    }

    public createPlaneMesh(_size: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-plane-${this.meshCounter}` };
    }

    public createCubeMesh(_size: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-cube-${this.meshCounter}` };
    }

    public createPyramidMesh(_size: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-pyramid-${this.meshCounter}` };
    }

    public createPrismMesh(_width: number, _height: number, _depth: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-prism-${this.meshCounter}` };
    }

    public createSphereMesh(_radius: number, _segments: number): MeshHandle {
        this.meshCounter += 1;
        return { id: `stub-sphere-${this.meshCounter}` };
    }

    public async loadTexture(_assetId: string): Promise<TextureHandle> {
        // Stub implementation - returns immediately with unique ID
        this.textureCounter += 1;
        return { id: `stub_texture_${_assetId}_${this.textureCounter}` };
    }

    public drawTexturedQuad(_texture: TextureHandle, _model: Mat4, _size: number, _normal?: Vec3): void {
        // Stub implementation - validates texture handle exists
        if (!_texture.id.startsWith('stub_texture_')) {
            throw new Error(`Invalid texture handle: ${_texture.id}`);
        }
    }

    public drawScreenQuad(_texture: TextureHandle, _transform: Mat4): void {
        // Stub implementation - no rendering
    }

    // Optional lighting methods (Renderer interface extension)
    public setLightDirection(_direction: Vec3): void {
        this.lightDirection = { ..._direction };
    }

    public setLightColor(_color: Vec3): void {
        this.lightColor = { ..._color };
    }

    public setAmbientIntensity(_intensity: number): void {
        this.ambientIntensity = _intensity;
    }

    public setCelestialLighting(
        _sun: { direction: Vec3; color: Vec3 },
        _moon: { direction: Vec3; color: Vec3 },
    ): void {
        this.sunDirection = _sun.direction;
        this.sunColor = _sun.color;
        this.moonDirection = _moon.direction;
        this.moonColor = _moon.color;
    }

    // Stub-specific utility methods for testing
    public getFrameCount(): number {
        return this.frameCount;
    }

    public getMeshCount(): number {
        return this.meshCounter;
    }

    public getTextureCount(): number {
        return this.textureCounter;
    }

    public getViewProjection(): Float32Array {
        return this.viewProj.slice();
    }

    public getShadowCaster(): { direction: Vec3; strength: number; focus: Vec3 } {
        const { direction, strength, focus } = this.shadowCaster;
        return { direction: { ...direction }, strength, focus: { ...focus } };
    }

    public getMeshModels(): readonly Mat4[] {
        return this.meshModels;
    }

    public getLightingState(): { direction: Vec3; color: Vec3; ambient: number } {
        return {
            direction: { ...this.lightDirection },
            color: { ...this.lightColor },
            ambient: this.ambientIntensity,
        };
    }

    public getCelestialLightingState(): { ambientIntensity: number, sunDirection: Vec3, sunColor: Vec3, moonDirection: Vec3, moonColor: Vec3} {
        return {
            ambientIntensity: this.ambientIntensity,
            sunDirection: { ...this.sunDirection },
            sunColor: { ...this.sunColor },
            moonDirection: { ...this.moonDirection },
            moonColor: { ...this.moonColor },
        };
    }

    public getWireframeEnabled(): boolean {
        return this.wireframeEnabled;
    }

    public reset(): void {
        this.meshCounter = 0;
        this.textureCounter = 0;
        this.frameCount = 0;
        this.wireframeEnabled = false;
        this.lightDirection = { x: -1, y: 0, z: 0 };
        this.lightColor = { x: 1, y: 1, z: 1 };
        this.ambientIntensity = 0.3;
    }

    // Optional renderer extension methods
    public clear(_r: number, _g: number, _b: number, _a: number): void {
        // Stub implementation - could track clear color state here
    }

    public getViewportWidth(): number {
        // Stub implementation - return default canvas width
        return 800;
    }

    public getViewportHeight(): number {
        // Stub implementation - return default canvas height
        return 600;
    }
}
