import type { Renderer, SkyState, TextureHandle } from '../../services/renderer';
import type { Camera } from '../camera';
import type { GameState } from '../gameState';
import type { DebugHUD } from '../gameLoop';
import { World } from '../world';
import EnvironmentSystem from './environment';
import { Vec3, Mat4 } from '../../types/common';
import { getCameraMatrixInto, INSTANCE_CHARACTER_SIZE } from '../camera';
import { SCENE_HEIGHT_PX, SCENE_TILE_SIZE, SCENE_WIDTH_PX } from '../scene';
import {
    matrixMultiplyInto, smoothstep, orthographic, fitLogicalOrtho, quaternionFromYawPitch, quaternionApplyToVector,
} from '../math/mathHelpers';

// The sky colours copied from the palette each frame, listed once rather than every frame (M-1)
const SKY_COLOR_FIELDS = ['horizon', 'upper', 'zenith', 'glow', 'cloudLight', 'cloudMid', 'cloudShadow'] as const;

export default class RenderSystem {
    // PERFORMANCE: Pre-allocated matrices isolated to the drawing context
    private readonly sceneSpriteMVP: Mat4;

    private readonly billboardTransform: Mat4;

    private readonly sceneSpriteTransform: Mat4;

    private readonly sceneOrthoProj: Mat4;

    // Billboard facing, handed to the renderer, which copies it (M-1)
    private readonly billboardNormal: Vec3 = { x: 0, y: 0, z: 1 };

    private readonly billboardCenter: Vec3 = { x: 0, y: 0, z: 0 };

    // The 3D camera's view-projection, rebuilt in place every frame (M-1)
    private readonly viewProj: Mat4 = { elements: new Float32Array(16) };

    private readonly viewProjScratch = { proj: { elements: new Float32Array(16) }, view: { elements: new Float32Array(16) } };

    // Whether a world frame has been drawn, so overlays have a camera to be placed with
    private hasWorldViewProj = false;

    // NPC textures by asset ID. null while loading, or if the load failed.
    private readonly npcTextures: Map<string, TextureHandle | null> = new Map();

    // Handed to the renderer every frame. They point at the environment's vectors, which are
    // filled in place, so they're built once in the constructor (M-1)
    private readonly sunLight: { direction: Vec3; color: Vec3 };

    private readonly moonLight: { direction: Vec3; color: Vec3 };

    // Viewport the scene projection was last built for, rebuilt only when it changes (M-1)
    private sceneOrthoWidth = 0;

    private sceneOrthoHeight = 0;

    // Filled from the palette every frame and handed to the renderer (M-1)
    private readonly sky: SkyState = {
        horizon: { x: 0, y: 0, z: 0 },
        upper: { x: 0, y: 0, z: 0 },
        zenith: { x: 0, y: 0, z: 0 },
        glow: { x: 0, y: 0, z: 0 },
        sunDirection: { x: 0, y: 1, z: 0 },
        stars: 0,
        cloudLight: { x: 0, y: 0, z: 0 },
        cloudMid: { x: 0, y: 0, z: 0 },
        cloudShadow: { x: 0, y: 0, z: 0 },
        cloudTime: 0,
        starTime: 0,
        moonDirection: { x: 0, y: -1, z: 0 },
        sunDisc: { x: 0, y: 0, z: 0 },
        moonDisc: { x: 0, y: 0, z: 0 },
        sunVisibility: 0,
        moonVisibility: 0,
    };

    constructor(
        private renderer: Renderer,
        private world: World,
        private environmentSystem: EnvironmentSystem,
        private getAspectRatio: () => number,
        // Mesh geometries passed down from core asset ownership contexts
        private wallDebugMesh: any,
    ) {
        // Pre-allocate tracking transforms to strictly prevent garbage collection spikes
        this.sceneSpriteMVP = { elements: new Float32Array(16) };
        this.billboardTransform = { elements: new Float32Array(16) };
        this.sceneSpriteTransform = { elements: new Float32Array(16) };
        this.sceneOrthoProj = { elements: new Float32Array(16) };
        this.sunLight = { direction: environmentSystem.lightDirection, color: environmentSystem.sunColorWithVisibility };
        this.moonLight = { direction: environmentSystem.moonLightDirection, color: environmentSystem.moonColorWithVisibility };
    }

    private computeScaledTransform(center: Vec3, scale: Vec3, out: Mat4): void {
        const o = out.elements;
        o[0] = scale.x; o[1] = 0; o[2] = 0; o[3] = 0;
        o[4] = 0; o[5] = scale.y; o[6] = 0; o[7] = 0;
        o[8] = 0; o[9] = 0; o[10] = scale.z; o[11] = 0;
        o[12] = center.x; o[13] = center.y; o[14] = center.z; o[15] = 1;
    }

    private renderBoundaryWireframe(wallDebugTransform: Mat4, WALL_DEBUG_COLOR: Vec3): void {
        if (!this.renderer.getWireframeEnabled?.()) return;

        this.world.getBoundaryWallAABBs().forEach((wall) => {
            const center = {
                x: (wall.min.x + wall.max.x) / 2,
                y: (wall.min.y + wall.max.y) / 2,
                z: (wall.min.z + wall.max.z) / 2,
            };
            const scale = {
                x: wall.max.x - wall.min.x,
                y: wall.max.y - wall.min.y,
                z: wall.max.z - wall.min.z,
            };
            this.computeScaledTransform(center, scale, wallDebugTransform);
            this.renderer.drawMesh(this.wallDebugMesh, wallDebugTransform, WALL_DEBUG_COLOR, true);
        });
    }

    // A quad standing upright at center, turned to face the camera around the vertical axis
    private drawBillboard(texture: TextureHandle, center: Vec3, size: number, camera: Camera): void {
        const toCamera = this.billboardNormal;
        toCamera.x = camera.position.x - center.x;
        toCamera.y = 0;
        toCamera.z = camera.position.z - center.z;
        const dist = Math.sqrt(toCamera.x * toCamera.x + toCamera.z * toCamera.z);
        if (dist > 0.001) {
            toCamera.x /= dist; toCamera.z /= dist;
        } else {
            toCamera.x = 0; toCamera.z = 1;
        }

        // The quad lies on XZ: its x runs along the camera's right, its z stands up
        const m = this.billboardTransform.elements;
        m[0] = -toCamera.z * size; m[1] = 0; m[2] = toCamera.x * size; m[3] = 0;
        m[4] = 0; m[5] = 0; m[6] = 0; m[7] = 0;
        m[8] = 0; m[9] = size; m[10] = 0; m[11] = 0;
        m[12] = center.x; m[13] = center.y; m[14] = center.z; m[15] = 1;

        this.renderer.drawTexturedQuad(texture, this.billboardTransform, 1.0, toCamera);
    }

    // Loads each NPC's texture the first time it's seen, and draws it once loaded
    private renderNpcs(camera: Camera): void {
        const npcs = this.world.getVisibleNpcs();
        for (let i = 0; i < npcs.length; i += 1) {
            const npc = npcs[i];
            if (!this.npcTextures.has(npc.textureId)) {
                this.loadNpcTexture(npc.textureId);
            }
            const texture = this.npcTextures.get(npc.textureId);
            if (texture) {
                // Position is the sprite's base, the quad is centered on its origin
                const center = this.billboardCenter;
                center.x = npc.position.x;
                center.y = npc.position.y + npc.size / 2;
                center.z = npc.position.z;
                this.drawBillboard(texture, center, npc.size, camera);
            }
        }
    }

    // A failed load stays null, so it's tried once and the NPC just isn't drawn
    private loadNpcTexture(textureId: string): void {
        this.npcTextures.set(textureId, null);
        this.renderer.loadTexture(textureId)
            .then((texture) => { this.npcTextures.set(textureId, texture); })
            .catch((error) => { console.error(`Failed to load NPC texture '${textureId}':`, error); });
    }

    /**
     * Where a world point lands on screen, 0..1 across the viewport with y down, using this frame's camera.
     * False when it's behind the camera, or no 3D frame has been drawn yet.
     */
    public projectToViewport(point: Vec3, out: { x: number; y: number }): boolean {
        if (!this.hasWorldViewProj) return false;
        const m = this.viewProj.elements;
        // Column-major, like every Mat4 here
        const clipX = m[0] * point.x + m[4] * point.y + m[8] * point.z + m[12];
        const clipY = m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13];
        const clipW = m[3] * point.x + m[7] * point.y + m[11] * point.z + m[15];
        if (clipW <= 0) return false;
        out.x = (clipX / clipW + 1) / 2;
        out.y = (1 - clipY / clipW) / 2;
        return true;
    }

    private declareLighting(focus: Vec3, shadowsEnabled: boolean): void {
        if (this.renderer.setShadowCaster) {
            this.renderer.setShadowCaster(
                this.environmentSystem.shadowLightDirection,
                shadowsEnabled ? this.environmentSystem.shadowStrength : 0,
                focus,
            );
        }
        if (this.renderer.setCelestialLighting) {
            this.renderer.setCelestialLighting(this.sunLight, this.moonLight);
        }
        if (this.renderer.setAmbientIntensity) {
            this.renderer.setAmbientIntensity(this.environmentSystem.ambientIntensity);
        }
    }

    public render(
        gameState: GameState,
        camera: Camera,
        partyMemberTexture1: TextureHandle | null,
        debugHUD: DebugHUD | undefined,
        WALL_DEBUG_COLOR: Vec3,
        wallDebugTransform: Mat4,
        // Debug menu switch, true without one
        shadowsEnabled: boolean,
    ): void {
        // Before beginFrame, which clears to this frame's sky. Every mode, so the renderer
        // never holds a stale sky (scene_2d's own clear covers it).
        const { palette } = this.environmentSystem;
        for (let i = 0; i < SKY_COLOR_FIELDS.length; i += 1) {
            const field = SKY_COLOR_FIELDS[i];
            this.sky[field].x = palette[field].x; this.sky[field].y = palette[field].y; this.sky[field].z = palette[field].z;
        }
        this.sky.stars = palette.stars;
        this.sky.cloudTime = this.environmentSystem.cloudTime;
        this.sky.starTime = this.environmentSystem.starTime;
        // The sun and moon are part of the sky: drawn in the sky shader, before the clouds, so
        // clouds pass in front of them. Each fades into the sky by its visibility.
        const environment = this.environmentSystem;
        const moon = environment.moonLightDirection;
        this.sky.moonDirection.x = moon.x; this.sky.moonDirection.y = moon.y; this.sky.moonDirection.z = moon.z;
        this.sky.sunDisc.x = palette.sunDisc.x; this.sky.sunDisc.y = palette.sunDisc.y; this.sky.sunDisc.z = palette.sunDisc.z;
        this.sky.moonDisc.x = palette.moonLight.x; this.sky.moonDisc.y = palette.moonLight.y; this.sky.moonDisc.z = palette.moonLight.z;
        this.sky.sunVisibility = environment.sunVisibility;
        this.sky.moonVisibility = environment.moonVisibility;
        // Always the sun, even below the horizon (afterglow), never shadowLightDirection,
        // which switches to the moon at night and would swing the glow across the sky at dawn
        const sun = this.environmentSystem.lightDirection;
        this.sky.sunDirection.x = sun.x; this.sky.sunDirection.y = sun.y; this.sky.sunDirection.z = sun.z;
        this.renderer.setSky?.(this.sky);
        this.renderer.beginFrame();
        const discreteState = gameState.discrete;
        const interpolatedState = gameState.interpolated;

        // 1. Process 2D UI Overlay Pass
        if (discreteState.gameMode === 'scene_2d') {
            const aspect = this.getAspectRatio();
            this.renderer.setViewProjection(getCameraMatrixInto(camera, aspect, this.viewProj, this.viewProjScratch));
            this.renderer.setViewPosition?.(camera.position);

            this.renderBoundaryWireframe(wallDebugTransform, WALL_DEBUG_COLOR);

            this.declareLighting(camera.position, shadowsEnabled);

            this.world.getVisibleMeshes().forEach((sm) => {
                this.renderer.drawMesh(sm.mesh, sm.transform, sm.color);
            });

            const width = this.renderer.getViewportWidth?.() ?? 800;
            const height = this.renderer.getViewportHeight?.() ?? 600;

            if (width !== this.sceneOrthoWidth || height !== this.sceneOrthoHeight) {
                this.sceneOrthoWidth = width;
                this.sceneOrthoHeight = height;
                const bounds = fitLogicalOrtho(width, height, SCENE_WIDTH_PX, SCENE_HEIGHT_PX);
                const orthoProj = orthographic(bounds.left, bounds.right, bounds.bottom, bounds.top, 0.1, 100.0);
                const orthoElements = orthoProj.elements;
                const sceneOrthoElements = this.sceneOrthoProj.elements;
                for (let i = 0; i < 16; i += 1) {
                    sceneOrthoElements[i] = orthoElements[i];
                }
            }

            if (this.renderer.clear) {
                const alpha = smoothstep(interpolatedState.sceneTransitionProgress);
                this.renderer.clear(1.0 * alpha, 0.41 * alpha, 0.71 * alpha, alpha);
            }

            if (partyMemberTexture1) {
                const spriteSize = SCENE_TILE_SIZE;
                const m = this.sceneSpriteTransform.elements;
                m[0] = spriteSize; m[1] = 0; m[2] = 0; m[3] = 0;
                m[4] = 0; m[5] = spriteSize; m[6] = 0; m[7] = 0;
                m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
                m[12] = interpolatedState.sceneCharacterPositionPx.x;
                m[13] = interpolatedState.sceneCharacterPositionPx.y;
                m[14] = -0.5; m[15] = 1;

                matrixMultiplyInto(this.sceneOrthoProj, this.sceneSpriteTransform, this.sceneSpriteMVP);
                this.renderer.drawScreenQuad(partyMemberTexture1, this.sceneSpriteMVP);
            }
        } else {
            const aspect = this.getAspectRatio();
            this.renderer.setViewProjection(getCameraMatrixInto(camera, aspect, this.viewProj, this.viewProjScratch));
            this.hasWorldViewProj = true;
            this.renderer.setViewPosition?.(camera.position);

            this.renderBoundaryWireframe(wallDebugTransform, WALL_DEBUG_COLOR);

            this.declareLighting(camera.position, shadowsEnabled);

            this.world.getVisibleMeshes().forEach((sm) => {
                this.renderer.drawMesh(sm.mesh, sm.transform, sm.color);
            });

            this.renderNpcs(camera);

            if (discreteState.isTimeFrozen && (discreteState.instanceIsTransitioning || discreteState.instanceIsActive) && partyMemberTexture1) {
                this.drawBillboard(partyMemberTexture1, interpolatedState.instanceCharacterPosition, INSTANCE_CHARACTER_SIZE, camera);
            }
        }

        if (debugHUD && discreteState.debugHUDVisible) {
            // Debug only, so the allocations here don't run every frame for everyone (D-1)
            const currentChunkCoords = World.getChunkCoords(camera.position);
            const currentChunkData = this.world.activeChunks.get(World.getChunkID(currentChunkCoords.x, currentChunkCoords.z));
            const rotation = quaternionFromYawPitch(camera.yaw, camera.pitch);
            const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

            debugHUD.render({
                cameraPosition: camera.position,
                cameraForward: forward,
                sunPosition: this.environmentSystem.sunPosition,
                moonPosition: this.environmentSystem.moonPosition,
                timeOfDay: this.environmentSystem.timeOfDay,
                yaw: camera.yaw,
                pitch: camera.pitch,
                gameMode: discreteState.gameMode,
                instancePosition: (discreteState.isTimeFrozen && (discreteState.instanceIsTransitioning || discreteState.instanceIsActive))
                    ? interpolatedState.instanceCharacterPosition
                    : undefined,
                currentChunk: {
                    x: currentChunkCoords.x,
                    z: currentChunkCoords.z,
                    hasContent: currentChunkData?.hasContent ?? false,
                },
            });
        }
        this.renderer.endFrame();
    }
}
