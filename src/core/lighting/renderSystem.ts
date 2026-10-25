import type { Renderer, SkyState, TextureHandle } from '../../services/renderer';
import type { Camera } from '../camera';
import type { GameState } from '../gameState';
import type { DebugHUD } from '../gameLoop';
import { World } from '../world';
import EnvironmentSystem from './environment';
import { skyColorsAt } from './skyPalette';
import { Vec3, Mat4 } from '../../types/common';
import { getCameraMatrix, INSTANCE_CHARACTER_SIZE } from '../camera';
import { SCENE_HEIGHT_PX, SCENE_TILE_SIZE, SCENE_WIDTH_PX } from '../scene';
import {
    matrixMultiplyInto, smoothstep, orthographic, fitLogicalOrtho, quaternionFromYawPitch, quaternionApplyToVector,
} from '../math/mathHelpers';

export default class RenderSystem {
    // PERFORMANCE: Pre-allocated matrices isolated to the drawing context
    private readonly sceneSpriteMVP: Mat4;

    private readonly circleTransform: Mat4;

    private readonly sceneSpriteTransform: Mat4;

    private readonly sceneOrthoProj: Mat4;

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
    };

    constructor(
        private renderer: Renderer,
        private world: World,
        private environmentSystem: EnvironmentSystem,
        private getAspectRatio: () => number,
        // Mesh geometries passed down from core asset ownership contexts
        private sunMesh: any,
        private moonMesh: any,
        private wallDebugMesh: any,
    ) {
        // Pre-allocate tracking transforms to strictly prevent garbage collection spikes
        this.sceneSpriteMVP = { elements: new Float32Array(16) };
        this.circleTransform = { elements: new Float32Array(16) };
        this.sceneSpriteTransform = { elements: new Float32Array(16) };
        this.sceneOrthoProj = { elements: new Float32Array(16) };
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

    private renderCelestialBodies(focus: Vec3, shadowsEnabled: boolean): void {
        if (this.renderer.setShadowCaster) {
            this.renderer.setShadowCaster(
                this.environmentSystem.shadowLightDirection,
                shadowsEnabled ? this.environmentSystem.shadowStrength : 0,
                focus,
            );
        }
        if (this.renderer.setCelestialLighting) {
            this.renderer.setCelestialLighting(
                { direction: this.environmentSystem.lightDirection, color: this.environmentSystem.sunColorWithVisibility },
                { direction: this.environmentSystem.moonLightDirection, color: this.environmentSystem.moonColorWithVisibility },
            );
        }
        if (this.renderer.setAmbientIntensity) {
            this.renderer.setAmbientIntensity(this.environmentSystem.ambientIntensity);
        }
        if (this.environmentSystem.sunVisibility > 0) {
            this.renderer.drawMesh(this.sunMesh, this.environmentSystem.sunTransform, this.environmentSystem.sunColorWithVisibility, true);
        }
        if (this.environmentSystem.moonVisibility > 0) {
            this.renderer.drawMesh(this.moonMesh, this.environmentSystem.moonTransform, this.environmentSystem.moonColorWithVisibility, true);
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
        skyColorsAt(this.environmentSystem.timeOfDay, this.sky);
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
            this.renderer.setViewProjection(getCameraMatrix(camera, aspect));

            this.renderBoundaryWireframe(wallDebugTransform, WALL_DEBUG_COLOR);

            this.renderCelestialBodies(camera.position, shadowsEnabled);

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
            this.renderer.setViewProjection(getCameraMatrix(camera, aspect));

            this.renderBoundaryWireframe(wallDebugTransform, WALL_DEBUG_COLOR);

            this.renderCelestialBodies(camera.position, shadowsEnabled);

            this.world.getVisibleMeshes().forEach((sm) => {
                this.renderer.drawMesh(sm.mesh, sm.transform, sm.color);
            });

            if (discreteState.isTimeFrozen && (discreteState.instanceIsTransitioning || discreteState.instanceIsActive) && partyMemberTexture1) {
                const pos = interpolatedState.instanceCharacterPosition;
                const circleSize = INSTANCE_CHARACTER_SIZE;

                const toCamera = { x: camera.position.x - pos.x, y: 0, z: camera.position.z - pos.z };
                const dist = Math.sqrt(toCamera.x * toCamera.x + toCamera.z * toCamera.z);
                if (dist > 0.001) {
                    toCamera.x /= dist; toCamera.z /= dist;
                } else {
                    toCamera.x = 0; toCamera.z = 1;
                }

                const right = { x: -toCamera.z, y: 0, z: toCamera.x };
                const up = { x: 0, y: 1, z: 0 };

                const m = this.circleTransform.elements;
                m[0] = right.x * circleSize; m[1] = right.y * circleSize; m[2] = right.z * circleSize; m[3] = 0;
                m[4] = 0; m[5] = 0; m[6] = 0; m[7] = 0;
                m[8] = up.x * circleSize; m[9] = up.y * circleSize; m[10] = up.z * circleSize; m[11] = 0;
                m[12] = pos.x; m[13] = pos.y; m[14] = pos.z; m[15] = 1;

                this.renderer.drawTexturedQuad(partyMemberTexture1, this.circleTransform, 1.0, toCamera);
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
