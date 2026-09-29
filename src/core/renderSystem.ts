/* eslint-disable no-unused-vars */
import type { Renderer, TextureHandle } from '../services/renderer';
import type { Camera } from './camera';
import type { GameState } from './gameState';
import type { DebugHUD } from './gameLoop';
import { World } from './world';
import EnvironmentSystem from './environment';
import { Vec3, Mat4 } from '../types/common';
import { getCameraMatrix, INSTANCE_CHARACTER_SIZE } from './camera';
import { SCENE_TILE_SIZE } from './scene';
import {
    matrixMultiplyInto, smoothstep, orthographic, quaternionFromYawPitch, quaternionApplyToVector,
} from './math/mathHelpers';

export default class RenderSystem {
    // PERFORMANCE: Pre-allocated MVP matrices isolated to the drawing context
    private readonly sunMVP: Mat4;

    private readonly moonMVP: Mat4;

    private readonly meshMVP: Mat4;

    private readonly circleTransform: Mat4;

    private readonly sceneSpriteTransform: Mat4;

    private readonly sceneOrthoProj: Mat4;

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
        this.sunMVP = { elements: new Float32Array(16) };
        this.moonMVP = { elements: new Float32Array(16) };
        this.meshMVP = { elements: new Float32Array(16) };
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

    private renderBoundaryWireframe(viewProj: Mat4, wallDebugTransform: Mat4, wallDebugMVP: Mat4, WALL_DEBUG_COLOR: Vec3): void {
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
            matrixMultiplyInto(viewProj, wallDebugTransform, wallDebugMVP);
            this.renderer.drawMesh(this.wallDebugMesh, wallDebugMVP, WALL_DEBUG_COLOR, true);
        });
    }

    public render(
        gameState: GameState,
        camera: Camera,
        partyMemberTexture1: TextureHandle | null,
        debugHUD: DebugHUD | undefined,
        WALL_DEBUG_COLOR: Vec3,
        wallDebugTransform: Mat4,
        wallDebugMVP: Mat4,
    ): void {
        this.renderer.beginFrame();
        const discreteState = gameState.discrete;
        const interpolatedState = gameState.interpolated;

        const currentChunkCoords = World.getChunkCoords(camera.position);
        const currentChunkData = this.world.activeChunks.get(World.getChunkID(currentChunkCoords.x, currentChunkCoords.z));

        // 1. Process 2D UI Overlay Pass
        if (discreteState.gameMode === 'scene_2d') {
            const aspect = this.getAspectRatio();
            const viewProj = getCameraMatrix(camera, aspect);

            this.renderBoundaryWireframe(viewProj, wallDebugTransform, wallDebugMVP, WALL_DEBUG_COLOR);

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
                matrixMultiplyInto(viewProj, this.environmentSystem.sunTransform, this.sunMVP);
                this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.environmentSystem.sunColorWithVisibility, true);
            }

            if (this.environmentSystem.moonVisibility > 0) {
                matrixMultiplyInto(viewProj, this.environmentSystem.moonTransform, this.moonMVP);
                this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.environmentSystem.moonColorWithVisibility, true);
            }

            this.world.getVisibleMeshes().forEach((sm) => {
                matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
                this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
            });

            const width = this.renderer.getViewportWidth?.() ?? 800;
            const height = this.renderer.getViewportHeight?.() ?? 600;

            const orthoProj = orthographic(0, width, height, 0, 0.1, 100.0);
            const orthoElements = orthoProj.elements;
            const sceneOrthoElements = this.sceneOrthoProj.elements;
            for (let i = 0; i < 16; i += 1) {
                sceneOrthoElements[i] = orthoElements[i];
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

                matrixMultiplyInto(this.sceneOrthoProj, this.sceneSpriteTransform, this.meshMVP);
                this.renderer.drawScreenQuad(partyMemberTexture1, this.meshMVP);
            }
        } else {
            const aspect = this.getAspectRatio();
            const viewProj = getCameraMatrix(camera, aspect);

            this.renderBoundaryWireframe(viewProj, wallDebugTransform, wallDebugMVP, WALL_DEBUG_COLOR);

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
                matrixMultiplyInto(viewProj, this.environmentSystem.sunTransform, this.sunMVP);
                this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.environmentSystem.sunColorWithVisibility, true);
            }

            if (this.environmentSystem.moonVisibility > 0) {
                matrixMultiplyInto(viewProj, this.environmentSystem.moonTransform, this.moonMVP);
                this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.environmentSystem.moonColorWithVisibility, true);
            }

            this.world.getVisibleMeshes().forEach((sm) => {
                matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
                this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
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

                matrixMultiplyInto(viewProj, this.circleTransform, this.meshMVP);
                this.renderer.drawTexturedQuad(partyMemberTexture1, this.meshMVP, 1.0, toCamera);
            }
        }

        if (debugHUD && discreteState.debugHUDVisible) {
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
