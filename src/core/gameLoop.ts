import type { Renderer, TextureHandle } from '../services/renderer';
import type { Input } from '../services/input';
import {
    createCamera,
    getCameraMatrix,
    PLAYER_SPEED,
    PLAYER_HEIGHT,
    PLAYER_RADIUS,
    getCameraForward,
    getCameraRight,
    type Camera,
} from './camera';
import {
    resolveCollision,
    createCollisionContext,
    type CollisionContext,
} from './collision';
import {
    matrixMultiplyInto,
    identity,
    quaternionFromYawPitch,
    quaternionApplyToVector,
    smoothstep,
    lerpVec3,
} from './math/mathHelpers';
import { World } from './world';
import type { Vec3, Mat4 } from '../types/common';
import {
    createInstance,
    TRANSITION_DURATION,
    type Instance,
} from './instance';
import {
    createInstanceCharacter,
    type InstanceCharacter,
} from './instanceCharacter';

const FIXED_DT = 1 / 60;

export interface DebugHUD {
    // eslint-disable-next-line no-unused-vars
    render: (_info: {
        cameraPosition: Vec3;
        cameraForward: Vec3;
        sunPosition?: Vec3;
        moonPosition?: Vec3;
        timeOfDay?: number;
        yaw?: number;
        pitch?: number;
    }) => void;
    toggle: () => void;
    isVisible: () => boolean;
}

export class GameLoop {
    // State variables
    private simulationTime = 0;

    private debugHUDVisible = false;

    private accumulator = 0;

    private isPaused = false;

    private savedPitch = 0; // Store camera pitch before pause to restore on unpause

    private targetPitch = 0; // Target pitch for smooth transition

    private isTransitioningPitch = false;

    private instance: Instance;

    private instanceCharacter: InstanceCharacter;

    private circleTexture: TextureHandle | null = null;

    // Core objects
    private camera: Camera;

    private collisionContext: CollisionContext;

    // Dependencies
    private renderer: Renderer;

    private input: Input;

    private world: World;

    private getAspectRatio: () => number;

    private debugHUD?: DebugHUD;

    // Constants
    private readonly DAY_LENGTH_SECONDS = 120; // 2 minutes per full cycle (configurable)

    private readonly HORIZON_THRESHOLD = 0.0; // Elevation threshold for horizon (radians)

    private readonly DECLINATION_OFFSET = 0.0; // Seasonal tilt offset (for future use, currently 0)

    private readonly SUN_SIZE = 0.5; // Radius of sun orb (sphere)

    private readonly MOON_SIZE = 0.4; // Radius of moon orb (sphere)

    private readonly SUN_COLOR: Vec3 = { x: 1.0, y: 0.85, z: 0.2 }; // Golden yellow

    private readonly MOON_COLOR: Vec3 = { x: 0.4, y: 0.6, z: 0.9 }; // Cool blue

    private readonly CELESTIAL_DISTANCE: number; // Computed from camera.far

    /*
     * PERFORMANCE:
     * All objects are pre-allocated and reused every frame.
     * This avoids allocation overhead and improves performance.
     * This is a performance optimization, not a design principle.
     */

    // Pre-allocated lighting calculation objects
    private readonly lightColor: Vec3 = { x: 0, y: 0, z: 0 }; // TODO: Review. Sun light color?

    private readonly lightDirection: Vec3 = { x: 0, y: 0, z: 0 }; // TODO: Review. Sun light direction?

    private readonly sunAzimuth = { value: 0 }; // For spherical coordinate calculations

    private readonly sunElevation = { value: 0 }; // For spherical coordinate calculations

    // Pre-allocated sun objects
    private readonly sunPosition: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly sunColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly sunDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 }; // Negated light direction for sun positioning

    private readonly sunTransform: Mat4;

    // Pre-allocated moon objects
    private readonly moonPosition: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly moonLightDirection: Vec3 = { x: 0, y: 0, z: 0 }; // For moon (opposite of sun)

    private readonly moonColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly moonDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 }; // Negated moon direction for moon positioning

    private readonly moonTransform: Mat4;

    // Pre-allocated MVP matrices
    private readonly sunMVP: Mat4;

    private readonly moonMVP: Mat4;

    private readonly meshMVP: Mat4;

    private readonly circleTransform: Mat4; // Pre-allocated for circle rendering

    // Mesh objects
    private readonly sunMesh;

    private readonly moonMesh;

    // Pre-allocated Vec3 objects for transition calculations
    private readonly transitionStartPos: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly transitionEndPos: Vec3 = { x: 0, y: 0, z: 0 };

    constructor(
        renderer: Renderer,
        input: Input,
        world: World,
        getAspectRatio: () => number,
        debugHUD?: DebugHUD,
    ) {
        this.renderer = renderer;
        this.input = input;
        this.world = world;
        this.getAspectRatio = getAspectRatio;
        this.debugHUD = debugHUD;

        // Core objects
        this.camera = createCamera();
        this.collisionContext = createCollisionContext();

        // Compute CELESTIAL_DISTANCE from camera.far
        this.CELESTIAL_DISTANCE = this.camera.far - 1.0; // Very large distance (effectively infinite, must be < camera.far)

        // Pre-allocated matrices
        this.sunTransform = identity();
        this.moonTransform = identity();
        this.sunMVP = identity();
        this.moonMVP = identity();
        this.meshMVP = identity();
        this.circleTransform = identity();

        // Mesh objects
        this.sunMesh = renderer.createSphereMesh(this.SUN_SIZE, 16);
        this.moonMesh = renderer.createSphereMesh(this.MOON_SIZE, 16);

        // Instance system
        this.instance = createInstance();
        this.instanceCharacter = createInstanceCharacter({ x: 0, y: 0, z: 0 });

        // Load circle texture asynchronously
        this.loadCircleTexture();
    }

    private async loadCircleTexture(): Promise<void> {
        try {
            this.circleTexture = await this.renderer.loadTexture('circle-sleep00');
        } catch (error) {
            console.error('Failed to load circle texture:', error);
        }
    }

    private pause(): void {
        this.isPaused = true;
        this.savedPitch = this.camera.pitch;
        this.targetPitch = 0; // Reset to horizontal view
        this.isTransitioningPitch = true;

        // Start transition
        this.instance.isTransitioning = true;
        this.instance.transitionDirection = 1.0; // Forward
        this.instance.transitionProgress = 0.0;
        this.instance.isActive = false;

        // Calculate start and end positions for circle
        this.calculateTransitionPositions();

        // Initialize character position to start position (so it's visible from the beginning)
        this.instanceCharacter.position.x = this.transitionStartPos.x;
        this.instanceCharacter.position.y = this.transitionStartPos.y;
        this.instanceCharacter.position.z = this.transitionStartPos.z;
    }

    private unpause(): void {
        // Start reverse transition
        this.instance.isTransitioning = true;
        this.instance.transitionDirection = -1.0; // Reverse
        // Don't restore camera pitch - leave it at 0 degrees

        // For reverse transition, swap start and end positions
        // We want to go from current position (floor) back to below camera
        // Since lerp goes from startPos (t=0) to endPos (t=1), and we're going backwards (t=1 to t=0),
        // we need: startPos = below camera, endPos = current position (floor)

        // Set end to current position (floor where circle is now)
        this.transitionEndPos.x = this.instanceCharacter.position.x;
        this.transitionEndPos.y = this.instanceCharacter.position.y;
        this.transitionEndPos.z = this.instanceCharacter.position.z;

        // Set start to below camera (where we want to end up)
        this.transitionStartPos.x = this.camera.position.x;
        this.transitionStartPos.y = this.camera.position.y - 5.0; // Below camera
        this.transitionStartPos.z = this.camera.position.z;

        // After reverse transition completes, unpause will happen in updateSimulation
        // Keep isPaused = true until transition completes
    }

    private calculateTransitionPositions(): void {
        // When pitch is 0, camera looks horizontally
        // To place circle at bottom of screen, we need to go forward and down
        // in view space, then transform to world space

        // Use target pitch (0) for calculation since we're transitioning to it
        const forward = getCameraForward(this.camera.yaw, this.targetPitch);

        // In view space with pitch=0: forward is forward, down is -Y (world up is view down when pitch=0)
        // Place circle at bottom-center of screen:
        // - Forward some distance (far enough to be in front, e.g., 3-5 units)
        // - Down based on FOV to hit bottom edge of view frustum
        const forwardDistance = 5.0; // Distance forward from camera
        const fovHalf = this.camera.fov / 2; // Half of vertical FOV
        // At distance d, bottom edge is at d * tan(fov/2) below center
        const downDistance = forwardDistance * Math.tan(fovHalf) * 1.5; // 1.5x to ensure it's off-screen initially

        // Transform from view space to world space
        // Down in view space = -world Y (when pitch=0)
        this.transitionStartPos.x = this.camera.position.x + forward.x * forwardDistance;
        this.transitionStartPos.y = this.camera.position.y - downDistance; // Down in world space
        this.transitionStartPos.z = this.camera.position.z + forward.z * forwardDistance;

        // End position: floor plane at fixed offset from camera (further forward for visibility)
        const offsetDistance = 5.0; // Increased from 2.0 to make circle more visible on floor
        const circleSize = 0.5; // Circle radius
        this.transitionEndPos.x = this.camera.position.x + forward.x * offsetDistance;
        this.transitionEndPos.y = circleSize / 2; // Half circle size above floor (quad is centered at Y=0)
        this.transitionEndPos.z = this.camera.position.z + forward.z * offsetDistance;
    }

    private computeTimeOfDay(simTime: number): number {
        return (simTime % this.DAY_LENGTH_SECONDS) / this.DAY_LENGTH_SECONDS;
    }

    // PERFORMANCE: Writes into existing objects to avoid allocation
    private computeSunSpherical(
        timeOfDay: number,
        outAzimuth: { value: number },
        outElevation: { value: number },
    ): void {
        const angle = (timeOfDay - 0.25) * Math.PI * 2;

        const elevation = Math.sin(angle) + this.DECLINATION_OFFSET;
        const azimuth = Math.PI / 2 + angle;

        // eslint-disable-next-line no-param-reassign
        outAzimuth.value = azimuth;
        // eslint-disable-next-line no-param-reassign
        outElevation.value = elevation;
    }

    // PERFORMANCE: Writes into existing object to avoid allocation
    private sphericalToDirection(
        azimuth: number,
        elevation: number,
        out: Vec3,
    ): void {
        const cosElev = Math.cos(elevation);
        out.x = cosElev * Math.sin(azimuth);
        out.y = Math.sin(elevation);
        out.z = cosElev * Math.cos(azimuth);

        // Normalize even if already normalized
        // Prevents NaN errors from dividing by zero.
        const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
        if (len > 0.0001) {
            out.x /= len;
            out.y /= len;
            out.z /= len;
        }
    }

    // PERFORMANCE: Writes into existing object to avoid allocation
    private computeSunDirection(timeOfDay: number, out: Vec3): void {
        const azimuth = { value: 0 };
        const elevation = { value: 0 };

        this.computeSunSpherical(timeOfDay, azimuth, elevation);
        this.sphericalToDirection(azimuth.value, elevation.value, out);
    }

    // PERFORMANCE: Writes into existing object to avoid allocation
    private computeLightColor(
        timeOfDay: number,
        elevation: number,
        out: Vec3,
    ): void {
        const sunVisibility = this.computeSunVisibility(timeOfDay);
        const moonVisibility = this.computeMoonVisibility(timeOfDay);

        // Compute sun color (elevation-based: white at zenith, red/orange at horizon)
        const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));
        const t = normalizedElev;
        let smoothT = 0;
        if (t <= 0) {
            smoothT = 0;
        } else if (t >= 1) {
            smoothT = 1;
        } else {
            smoothT = t * t * (3 - 2 * t); // Smoothstep function
        }

        const sunColorX = 0.8 + 0.2 * smoothT; // Red component: 1.0 at zenith, 0.8 at horizon
        const sunColorY = 0.7 + 0.3 * smoothT; // Green component: 1.0 at zenith, 0.7 at horizon
        const sunColorZ = 0.5 + 0.5 * smoothT; // Blue component: 1.0 at zenith, 0.5 at horizon (warmer)

        // Moon color (cool blue)
        const moonColorX = this.MOON_COLOR.x;
        const moonColorY = this.MOON_COLOR.y;
        const moonColorZ = this.MOON_COLOR.z;

        // Blend between sun and moon colors based on visibility
        const totalVisibility = sunVisibility + moonVisibility;
        if (totalVisibility > 0) {
            const sunWeight = sunVisibility / totalVisibility;
            const moonWeight = moonVisibility / totalVisibility;
            out.x = sunColorX * sunWeight + moonColorX * moonWeight;
            out.y = sunColorY * sunWeight + moonColorY * moonWeight;
            out.z = sunColorZ * sunWeight + moonColorZ * moonWeight;
        } else {
            // Fallback to moon color if no visibility
            out.x = moonColorX;
            out.y = moonColorY;
            out.z = moonColorZ;
        }
    }

    // PERFORMANCE: Pure function, no allocations
    private computeAmbientIntensity(elevation: number): number {
        // Normalize elevation from [-1, 1] to [0, 1]
        const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));

        // Elevation-based ambient transition
        const t = normalizedElev;
        let smoothT = 0;
        if (t <= 0) {
            smoothT = 0;
        } else if (t >= 1) {
            smoothT = 1;
        } else {
            smoothT = t * t * (3 - 2 * t); // Smoothstep function
        }

        // Interpolate between 0.1 (night) and 0.5 (day)
        return 0.1 + (0.5 - 0.1) * smoothT;
    }

    // PERFORMANCE: Pure function, no allocations
    private computeSunVisibility(timeOfDay: number): number {
        const dayCenter = 0.5; // Noon is center of day
        const dayWidth = 0.5; // Day spans 0.25 to 0.75 (half the cycle)
        const dist = Math.abs(timeOfDay - dayCenter) * 2; // Distance from center, scaled
        return Math.max(0, 1 - (dist / dayWidth)); // Fade from 1 at center to 0 at edges
    }

    // PERFORMANCE: Pure function, no allocations
    private computeMoonVisibility(timeOfDay: number): number {
        return 1 - this.computeSunVisibility(timeOfDay);
    }

    // PERFORMANCE: Writes into existing object to avoid allocation (complies with RULE M-1)
    private computeCelestialPosition(
        dirVec: Vec3,
        distance: number,
        playerPosition: Vec3,
        out: Vec3,
    ): void {
        out.x = playerPosition.x + dirVec.x * distance;
        out.y = playerPosition.y + dirVec.y * distance;
        out.z = playerPosition.z + dirVec.z * distance;
    }

    // PERFORMANCE: Writes into existing matrix to avoid allocation
    private computeCelestialTransform(
        position: Vec3,
        size: number,
        out: Mat4,
    ): void {
        const o = out.elements;

        o[0] = size; o[1] = 0; o[2] = 0; o[3] = 0;
        o[4] = 0; o[5] = size; o[6] = 0; o[7] = 0;
        o[8] = 0; o[9] = 0; o[10] = size; o[11] = 0;
        o[12] = position.x; o[13] = position.y; o[14] = position.z; o[15] = 1;
    }

    private updateSimulation(dt: number): void {
        const intent = this.input.getIntent();

        // Handle pause toggle
        if (intent.pause) {
            if (this.isPaused) {
                this.unpause();
            } else {
                this.pause();
            }
        }

        // Handle debug HUD toggle
        if (intent.toggleDebugHUD) {
            if (this.debugHUD) {
                this.debugHUD.toggle();
                this.debugHUDVisible = this.debugHUD.isVisible();
            } else {
                console.warn('Debug HUD toggle requested but debugHUD not available');
            }
        }

        // Update instance state transition (only when paused)
        if (this.isPaused && this.instance.isTransitioning) {
            // Update transition progress using fixed timestep
            this.instance.transitionProgress += (dt * this.instance.transitionDirection) / TRANSITION_DURATION;

            // Clamp to [0, 1]
            if (this.instance.transitionProgress >= 1.0) {
                this.instance.transitionProgress = 1.0;
                this.instance.isTransitioning = false;
                if (this.instance.transitionDirection > 0) {
                    this.instance.isActive = true;
                }
            } else if (this.instance.transitionProgress <= 0.0) {
                this.instance.transitionProgress = 0.0;
                this.instance.isTransitioning = false;
                if (this.instance.transitionDirection < 0) {
                    this.instance.isActive = false;
                    // Reverse transition complete, actually unpause now
                    this.isPaused = false;
                }
            }

            // Calculate current position via interpolation
            const smoothT = smoothstep(this.instance.transitionProgress);
            lerpVec3(
                this.transitionStartPos,
                this.transitionEndPos,
                smoothT,
                this.instanceCharacter.position,
            );
        }

        // Update camera pitch transition (only when paused, going to 0)
        if (this.isPaused && this.isTransitioningPitch) {
            const pitchTransitionSpeed = 2.0; // radians per second
            const pitchDelta = (this.targetPitch - this.camera.pitch) * pitchTransitionSpeed * dt;

            if (Math.abs(pitchDelta) < 0.001) {
                // Close enough, snap to target
                this.camera.pitch = this.targetPitch;
                this.isTransitioningPitch = false;
            } else {
                this.camera.pitch += pitchDelta;
            }
        }

        // Skip normal simulation updates when paused (except instance state above)
        if (this.isPaused) {
            return;
        }

        // Normal simulation updates
        this.simulationTime += dt;

        const sensitivity = 0.005;
        this.camera.yaw += intent.look.yaw * sensitivity;
        this.camera.pitch -= intent.look.pitch * sensitivity;

        // Clamp pitch to prevent flipping
        const limit = Math.PI / 2 - 0.01;
        this.camera.pitch = Math.max(-limit, Math.min(limit, this.camera.pitch));

        const { x: moveX, y: moveY } = intent.move;

        if (moveX !== 0 || moveY !== 0) {
            const forward = getCameraForward(this.camera.yaw, this.camera.pitch);
            const right = getCameraRight(this.camera.yaw);

            const proposedMovement = {
                x: (forward.x * moveY + right.x * moveX) * PLAYER_SPEED * dt,
                y: 0,
                z: (forward.z * moveY + right.z * moveX) * PLAYER_SPEED * dt,
            };

            const worldAABBs = this.world.getCollidableAABBs();

            const resolvedMovement = resolveCollision(
                this.camera.position,
                proposedMovement,
                worldAABBs,
                PLAYER_HEIGHT,
                PLAYER_RADIUS,
                this.collisionContext,
            );

            this.camera.position.x += resolvedMovement.x;
            this.camera.position.z += resolvedMovement.z;
            this.camera.position.y = PLAYER_HEIGHT;
        }
    }

    update(deltaTime: number): void {
        this.accumulator += deltaTime;
        while (this.accumulator >= FIXED_DT) {
            this.updateSimulation(FIXED_DT);
            this.accumulator -= FIXED_DT;
        }
    }

    render(): void {
        this.renderer.beginFrame();

        const aspect = this.getAspectRatio();
        const viewProj = getCameraMatrix(this.camera, aspect);

        // PERFORMANCE: Reuse pre-allocated objects, zero allocations per frame
        // When paused, use last timeOfDay (frozen)
        const timeOfDay = this.isPaused
            ? this.computeTimeOfDay(this.simulationTime)
            : this.computeTimeOfDay(this.simulationTime);

        this.computeSunSpherical(timeOfDay, this.sunAzimuth, this.sunElevation);
        this.computeSunDirection(timeOfDay, this.lightDirection);
        this.computeLightColor(timeOfDay, this.sunElevation.value, this.lightColor);

        const ambientIntensity = this.computeAmbientIntensity(this.sunElevation.value);
        const moonAzimuth = { value: this.sunAzimuth.value + Math.PI };
        const moonElevation = { value: -this.sunElevation.value };
        this.sphericalToDirection(moonAzimuth.value, moonElevation.value, this.moonLightDirection);

        const sunVisibility = this.computeSunVisibility(timeOfDay);
        const moonVisibility = this.computeMoonVisibility(timeOfDay);
        const activeLightDirection = moonVisibility > sunVisibility ? this.moonLightDirection : this.lightDirection;

        if (this.renderer.setLightDirection) {
            this.renderer.setLightDirection(activeLightDirection);
        }
        if (this.renderer.setLightColor) {
            this.renderer.setLightColor(this.lightColor);
        }
        if (this.renderer.setAmbientIntensity) {
            this.renderer.setAmbientIntensity(ambientIntensity);
        }

        this.sunDirectionForPosition.x = this.lightDirection.x;
        this.sunDirectionForPosition.y = this.lightDirection.y;
        this.sunDirectionForPosition.z = this.lightDirection.z;

        this.computeCelestialPosition(
            this.sunDirectionForPosition,
            this.CELESTIAL_DISTANCE,
            this.camera.position,
            this.sunPosition,
        );

        this.moonDirectionForPosition.x = this.moonLightDirection.x;
        this.moonDirectionForPosition.y = this.moonLightDirection.y;
        this.moonDirectionForPosition.z = this.moonLightDirection.z;

        this.computeCelestialPosition(
            this.moonDirectionForPosition,
            this.CELESTIAL_DISTANCE,
            this.camera.position,
            this.moonPosition,
        );
        this.computeCelestialTransform(this.sunPosition, this.SUN_SIZE, this.sunTransform);
        this.computeCelestialTransform(this.moonPosition, this.MOON_SIZE, this.moonTransform);

        if (sunVisibility > 0) {
            this.sunColorWithVisibility.x = this.SUN_COLOR.x * sunVisibility;
            this.sunColorWithVisibility.y = this.SUN_COLOR.y * sunVisibility;
            this.sunColorWithVisibility.z = this.SUN_COLOR.z * sunVisibility;

            matrixMultiplyInto(viewProj, this.sunTransform, this.sunMVP);
            this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.sunColorWithVisibility);
        }

        if (moonVisibility > 0) {
            this.moonColorWithVisibility.x = this.MOON_COLOR.x * moonVisibility;
            this.moonColorWithVisibility.y = this.MOON_COLOR.y * moonVisibility;
            this.moonColorWithVisibility.z = this.MOON_COLOR.z * moonVisibility;

            matrixMultiplyInto(viewProj, this.moonTransform, this.moonMVP);
            this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.moonColorWithVisibility);
        }

        const visibleMeshes = this.world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
            this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
        });

        // Render circle character when paused and active/transitioning
        if (this.isPaused && (this.instance.isTransitioning || this.instance.isActive)) {
            if (this.circleTexture) {
                // Calculate transform for circle (billboard at character position)
                const pos = this.instanceCharacter.position;
                const circleSize = 0.5; // Small size as specified

                // Calculate billboard orientation (face camera, stay vertical)
                const toCamera = {
                    x: this.camera.position.x - pos.x,
                    y: 0, // Keep vertical
                    z: this.camera.position.z - pos.z,
                };
                const dist = Math.sqrt(toCamera.x * toCamera.x + toCamera.z * toCamera.z);
                if (dist > 0.001) {
                    toCamera.x /= dist;
                    toCamera.z /= dist;
                } else {
                    toCamera.x = 0;
                    toCamera.z = 1;
                }

                // Right vector (perpendicular to toCamera in XZ plane)
                const right = { x: -toCamera.z, y: 0, z: toCamera.x };
                const up = { x: 0, y: 1, z: 0 };

                // Create billboard transform matrix (rotation + translation)
                // Matrix columns: [right*size, ?, up*size, position]
                // Shader uses a_position.x -> column 0, a_position.z -> column 2
                // Scale right and up by circleSize
                const m = this.circleTransform.elements;
                // Column 0: right vector (for a_position.x)
                m[0] = right.x * circleSize; m[1] = right.y * circleSize; m[2] = right.z * circleSize; m[3] = 0;
                // Column 1: unused (shader uses a_position.y = 0)
                m[4] = 0; m[5] = 0; m[6] = 0; m[7] = 0;
                // Column 2: up vector (for a_position.z)
                m[8] = up.x * circleSize; m[9] = up.y * circleSize; m[10] = up.z * circleSize; m[11] = 0;
                // Column 3: position
                m[12] = pos.x; m[13] = pos.y; m[14] = pos.z; m[15] = 1;

                // Multiply by view-projection matrix (use meshMVP as temporary, already rendered world meshes)
                matrixMultiplyInto(viewProj, this.circleTransform, this.meshMVP);
                // Render textured quad (no camera position needed - billboard calculated on CPU)
                this.renderer.drawTexturedQuad(this.circleTexture, this.meshMVP, 1.0);
            }
            // Texture not loaded yet - could render placeholder here if needed
        }

        if (this.debugHUD && this.debugHUDVisible) {
            const rotation = quaternionFromYawPitch(this.camera.yaw, this.camera.pitch);
            const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

            this.debugHUD.render({
                cameraPosition: this.camera.position,
                cameraForward: forward,
                sunPosition: this.sunPosition,
                moonPosition: this.moonPosition,
                timeOfDay,
                yaw: this.camera.yaw,
                pitch: this.camera.pitch,
            });
        }

        this.renderer.endFrame();
    }

    getCameraPosition(): Vec3 {
        return this.camera.position;
    }

    getTimeOfDay(): number {
        return (this.simulationTime % this.DAY_LENGTH_SECONDS) / this.DAY_LENGTH_SECONDS;
    }
}

export default GameLoop;
