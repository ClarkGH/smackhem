import type { Renderer } from '../services/renderer';
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
    type CollisionContext
} from './collision';
import {
    matrixMultiplyInto,
    identity,
    quaternionFromYawPitch,
    quaternionApplyToVector,
} from './math/mathHelpers';
import { World } from './world';
import type { Vec3, Mat4 } from '../types/common';

const FIXED_DT = 1 / 60;

export interface DebugHUD {
    render: (_info: {
        cameraPosition: Vec3;
        cameraForward: Vec3;
        sunPosition?: Vec3;
        // moonPosition?: Vec3;
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

    // private readonly MOON_SIZE = 0.4; // Radius of moon orb (sphere)

    private readonly SUN_COLOR: Vec3 = { x: 1.0, y: 0.85, z: 0.2 }; // Golden yellow

    // private readonly MOON_COLOR: Vec3 = { x: 0.4, y: 0.6, z: 0.9 }; // Cool blue

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
    // private readonly moonPosition: Vec3 = { x: 0, y: 0, z: 0 };

    // private readonly moonLightDirection: Vec3 = { x: 0, y: 0, z: 0 }; // For moon (opposite of sun)

    // private readonly moonColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    // private readonly moonDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 }; // Negated moon direction for moon positioning

    // private readonly moonTransform: Mat4;

    // Pre-allocated MVP matrices
    private readonly sunMVP: Mat4;

    // private readonly moonMVP: Mat4;

    private readonly meshMVP: Mat4;

    // Mesh objects
    private readonly sunMesh;

    // private readonly moonMesh;

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
        // this.moonTransform = identity();
        this.sunMVP = identity();
        // this.moonMVP = identity();
        this.meshMVP = identity();

        // Mesh objects
        this.sunMesh = renderer.createSphereMesh(this.SUN_SIZE, 16);
        // this.moonMesh = renderer.createSphereMesh(this.MOON_SIZE, 16);
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
        const angle = timeOfDay * Math.PI * 2;

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
        if (elevation.value < this.HORIZON_THRESHOLD) {
            const len = Math.sqrt(out.x * out.x + out.z * out.z);
            if (len > 0.0001) {
                out.x /= len;
                out.y = 0;
                out.z /= len;
            } else {
                out.x = 0;
                out.y = 0;
                out.z = -1; // Default: north
            }
        }
    }

    // PERFORMANCE: Writes into existing object to avoid allocation
    private computeLightColor(
        timeOfDay: number,
        elevation: number,
        out: Vec3,
    ): void {
        const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));

        if (elevation < this.HORIZON_THRESHOLD) {
            out.x = 0.3;
            out.y = 0.4;
            out.z = 0.6; // Cool blue
        } else {
            const t = normalizedElev;
            let smoothT = 0;
            if (t <= 0) {
                smoothT = 0;
            } else if (t >= 1) {
                smoothT = 1;
            } else {
                smoothT = t * t * (3 - 2 * t); // Smoothstep function
            }

            // White at zenith, red/orange at horizon
            out.x = 0.8 + 0.2 * smoothT; // Red component: 1.0 at zenith, 0.8 at horizon
            out.y = 0.7 + 0.3 * smoothT; // Green component: 1.0 at zenith, 0.7 at horizon
            out.z = 0.5 + 0.5 * smoothT; // Blue component: 1.0 at zenith, 0.5 at horizon (warmer)
        }
    }

    // PERFORMANCE: Pure function, no allocations
    private computeAmbientIntensity(elevation: number): number {
        if (elevation < this.HORIZON_THRESHOLD) {
            return 0.1; // Dark night ambient
        }

        const normalizedElev = (elevation + 1) / 2;

        const cosElev = Math.cos((normalizedElev * Math.PI) / 2);
        const intensity = cosElev * cosElev * cosElev * cosElev; // cos^4

        return 0.1 + 0.4 * intensity;
    }

    // PERFORMANCE: Pure function, no allocations
    private computeSunVisibility(timeOfDay: number): number {
        const dayCenter = 0.5; // Noon is center of day
        const dayWidth = 0.5; // Day spans 0.25 to 0.75 (half the cycle)
        const dist = Math.abs(timeOfDay - dayCenter) * 2; // Distance from center, scaled
        return Math.max(0, 1 - (dist / dayWidth)); // Fade from 1 at center to 0 at edges
    }

    // PERFORMANCE: Pure function, no allocations
    // private computeMoonVisibility(timeOfDay: number): number {
    //     return 1 - this.computeSunVisibility(timeOfDay);
    // }

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
        this.simulationTime += dt;
        const intent = this.input.getIntent();

        if (intent.toggleDebugHUD) {
            if (this.debugHUD) {
                this.debugHUD.toggle();
                this.debugHUDVisible = this.debugHUD.isVisible();
            } else {
                console.warn('Debug HUD toggle requested but debugHUD not available');
            }
        }
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
        const timeOfDay = this.computeTimeOfDay(this.simulationTime);

        this.computeSunSpherical(timeOfDay, this.sunAzimuth, this.sunElevation);
        this.computeSunDirection(timeOfDay, this.lightDirection);
        this.computeLightColor(timeOfDay, this.sunElevation.value, this.lightColor);

        const ambientIntensity = this.computeAmbientIntensity(this.sunElevation.value);
        // const moonAzimuth = { value: this.sunAzimuth.value + Math.PI };
        // const moonElevation = { value: -this.sunElevation.value };
        // this.sphericalToDirection(moonAzimuth.value, moonElevation.value, this.moonLightDirection);

        const sunVisibility = this.computeSunVisibility(timeOfDay);
        // const moonVisibility = this.computeMoonVisibility(timeOfDay);
        // const activeLightDirection = moonVisibility > sunVisibility ? this.moonLightDirection : this.lightDirection;
        const activeLightDirection = this.lightDirection; // Always use sun light direction

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

        // this.moonDirectionForPosition.x = this.moonLightDirection.x;
        // this.moonDirectionForPosition.y = this.moonLightDirection.y;
        // this.moonDirectionForPosition.z = this.moonLightDirection.z;

        // this.computeCelestialPosition(
        //     this.moonDirectionForPosition,
        //     this.CELESTIAL_DISTANCE,
        //     this.camera.position,
        //     this.moonPosition,
        // );
        this.computeCelestialTransform(this.sunPosition, this.SUN_SIZE, this.sunTransform);
        // this.computeCelestialTransform(this.moonPosition, this.MOON_SIZE, this.moonTransform);

        if (sunVisibility > 0) {
            this.sunColorWithVisibility.x = this.SUN_COLOR.x * sunVisibility;
            this.sunColorWithVisibility.y = this.SUN_COLOR.y * sunVisibility;
            this.sunColorWithVisibility.z = this.SUN_COLOR.z * sunVisibility;

            matrixMultiplyInto(viewProj, this.sunTransform, this.sunMVP);
            this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.sunColorWithVisibility);
        }

        // if (moonVisibility > 0) {
        //     this.moonColorWithVisibility.x = this.MOON_COLOR.x * moonVisibility;
        //     this.moonColorWithVisibility.y = this.MOON_COLOR.y * moonVisibility;
        //     this.moonColorWithVisibility.z = this.MOON_COLOR.z * moonVisibility;

        //     matrixMultiplyInto(viewProj, this.moonTransform, this.moonMVP);
        //     this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.moonColorWithVisibility);
        // }

        const visibleMeshes = this.world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
            this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
        });

        if (this.debugHUD && this.debugHUDVisible) {
            const rotation = quaternionFromYawPitch(this.camera.yaw, this.camera.pitch);
            const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

            this.debugHUD.render({
                cameraPosition: this.camera.position,
                cameraForward: forward,
                sunPosition: this.sunPosition,
                // moonPosition: this.moonPosition,
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
