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
} from './camera';
import { resolveCollision, createCollisionContext } from './collision';
import {
    matrixMultiplyInto,
    identity,
    quaternionFromYawPitch,
    quaternionApplyToVector,
} from './math/mathHelpers';
import { World } from './world';
import type { Vec3, Mat4 } from '../types/common';

const FIXED_DT = 1 / 60;

const createGameLoop = (
    renderer: Renderer,
    input: Input,
    world: World,
    getAspectRatio: () => number,
    debugHUD?: {
        render: (_info: {
            cameraPosition: Vec3;
            cameraForward: Vec3;
            sunPosition?: Vec3;
            moonPosition?: Vec3;
            timeOfDay?: number;
        }) => void;
        toggle: () => void;
        isVisible: () => boolean;
    },
) => {
    // State variables
    let simulationTime = 0;
    let debugHUDVisible = false;
    let accumulator = 0;

    // Core objects
    const camera = createCamera();
    const collisionContext = createCollisionContext();

    // Constants
    const DAY_LENGTH_SECONDS = 120; // 2 minutes per full cycle (configurable)
    const HORIZON_THRESHOLD = 0.0; // Elevation threshold for horizon (radians)
    const DECLINATION_OFFSET = 0.0; // Seasonal tilt offset (for future use, currently 0)
    const CELESTIAL_DISTANCE = camera.far - 1.0; // Very large distance (effectively infinite, must be < camera.far)
    const SUN_SIZE = 0.5; // Radius of sun orb (sphere)
    const MOON_SIZE = 0.4; // Radius of moon orb (sphere)
    const SUN_COLOR: Vec3 = { x: 1.0, y: 0.85, z: 0.2 }; // Golden yellow
    const MOON_COLOR: Vec3 = { x: 0.4, y: 0.6, z: 0.9 }; // Cool blue

    /* 
     * PERFORMANCE:
     * All objects are pre-allocated and reused every frame.
     * This avoids allocation overhead and improves performance.
     * This is a performance optimization, not a design principle.
     */

    // Pre-allocated lighting calculation objects
    const lightColor = { x: 0, y: 0, z: 0 }; // TODO: Review. Sun light color?
    const lightDirection = { x: 0, y: 0, z: 0 }; // TODO: Review. Sun light direction?
    const sunAzimuth = { value: 0 }; // For spherical coordinate calculations
    const sunElevation = { value: 0 }; // For spherical coordinate calculations

    // Pre-allocated sun objects
    const sunPosition = { x: 0, y: 0, z: 0 };
    const sunColorWithVisibility = { x: 0, y: 0, z: 0 };
    const sunDirectionForPosition = { x: 0, y: 0, z: 0 }; // Negated light direction for sun positioning
    const sunTransform = identity(); // 4x4 matrix

    // Pre-allocated moon objects
    const moonPosition = { x: 0, y: 0, z: 0 };
    const moonLightDirection = { x: 0, y: 0, z: 0 }; // For moon (opposite of sun)
    const moonColorWithVisibility = { x: 0, y: 0, z: 0 };
    const moonDirectionForPosition = { x: 0, y: 0, z: 0 }; // Negated moon direction for moon positioning
    const moonTransform = identity(); // 4x4 matrix

    // Pre-allocated MVP matrices
    const sunMVP = identity();
    const moonMVP = identity();
    const meshMVP = identity();

    // Mesh objects
    const sunMesh = renderer.createSphereMesh(SUN_SIZE, 16);
    const moonMesh = renderer.createSphereMesh(MOON_SIZE, 16);

    const getTimeOfDay = (simTime: number): number => (simTime % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;

    // PERFORMANCE: Writes into existing objects to avoid allocation
    const computeSunSpherical = (
        timeOfDay: number,
        outAzimuth: { value: number },
        outElevation: { value: number },
    ): void => {
        const angle = timeOfDay * Math.PI * 2;

        const elevation = Math.sin(angle) + DECLINATION_OFFSET;
        const azimuth = Math.PI / 2 + angle;

        // eslint-disable-next-line no-param-reassign
        outAzimuth.value = azimuth;
        // eslint-disable-next-line no-param-reassign
        outElevation.value = elevation;
    };

    // PERFORMANCE: Writes into existing object to avoid allocation
    const sphericalToDirection = (
        azimuth: number,
        elevation: number,
        out: Vec3,
    ): void => {
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
    };

    // PERFORMANCE: Writes into existing object to avoid allocation
    const computeSunDirection = (timeOfDay: number, out: Vec3): void => {
        const azimuth = { value: 0 };
        const elevation = { value: 0 };

        computeSunSpherical(timeOfDay, azimuth, elevation);
        sphericalToDirection(azimuth.value, elevation.value, out);
        if (elevation.value < HORIZON_THRESHOLD) {
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
    };

    // PERFORMANCE: Writes into existing object to avoid allocation
    const computeLightColor = (
        timeOfDay: number,
        elevation: number,
        out: Vec3,
    ): void => {
        const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));

        if (elevation < HORIZON_THRESHOLD) {
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
    };

    // PERFORMANCE: Pure function, no allocations
    const computeAmbientIntensity = (elevation: number): number => {
        if (elevation < HORIZON_THRESHOLD) {
            return 0.1; // Dark night ambient
        }

        const normalizedElev = (elevation + 1) / 2;

        const cosElev = Math.cos((normalizedElev * Math.PI) / 2);
        const intensity = cosElev * cosElev * cosElev * cosElev; // cos^4

        return 0.1 + 0.4 * intensity;
    };

    // PERFORMANCE: Pure function, no allocations
    const computeSunVisibility = (timeOfDay: number): number => {
        const dayCenter = 0.5; // Noon is center of day
        const dayWidth = 0.5; // Day spans 0.25 to 0.75 (half the cycle)
        const dist = Math.abs(timeOfDay - dayCenter) * 2; // Distance from center, scaled
        return Math.max(0, 1 - (dist / dayWidth)); // Fade from 1 at center to 0 at edges
    };

    // PERFORMANCE: Pure function, no allocations
    const computeMoonVisibility = (timeOfDay: number): number => 1 - computeSunVisibility(timeOfDay);

    // PERFORMANCE: Writes into existing object to avoid allocation (complies with RULE M-1)
    const computeCelestialPosition = (
        dirVec: Vec3,
        distance: number,
        playerPosition: Vec3,
        out: Vec3,
    ): void => {
        out.x = playerPosition.x + dirVec.x * distance;
        out.y = playerPosition.y + dirVec.y * distance;
        out.z = playerPosition.z + dirVec.z * distance;
    };

    // PERFORMANCE: Writes into existing matrix to avoid allocation
    const computeCelestialTransform = (
        position: Vec3,
        size: number,
        out: Mat4,
    ): void => {
        const o = out.elements;

        o[0] = size; o[1] = 0; o[2] = 0; o[3] = 0;
        o[4] = 0; o[5] = size; o[6] = 0; o[7] = 0;
        o[8] = 0; o[9] = 0; o[10] = size; o[11] = 0;
        o[12] = position.x; o[13] = position.y; o[14] = position.z; o[15] = 1;
    };

    const updateSimulation = (dt: number) => {
        simulationTime += dt;
        const intent = input.getIntent();

        if (intent.toggleDebugHUD) {
            if (debugHUD) {
                debugHUD.toggle();
                debugHUDVisible = debugHUD.isVisible();
            } else {
                console.warn('Debug HUD toggle requested but debugHUD not available');
            }
        }
        const sensitivity = 0.005;
        camera.yaw += intent.look.yaw * sensitivity;
        camera.pitch -= intent.look.pitch * sensitivity;

        // Clamp pitch to prevent flipping
        const limit = Math.PI / 2 - 0.01;
        camera.pitch = Math.max(-limit, Math.min(limit, camera.pitch));

        const { x: moveX, y: moveY } = intent.move;

        if (moveX !== 0 || moveY !== 0) {
            const forward = getCameraForward(camera.yaw, camera.pitch);
            const right = getCameraRight(camera.yaw);

            const proposedMovement = {
                x: (forward.x * moveY + right.x * moveX) * PLAYER_SPEED * dt,
                y: 0,
                z: (forward.z * moveY + right.z * moveX) * PLAYER_SPEED * dt,
            };

            const worldAABBs = world.getCollidableAABBs();

            const resolvedMovement = resolveCollision(
                camera.position,
                proposedMovement,
                worldAABBs,
                PLAYER_HEIGHT,
                PLAYER_RADIUS,
                collisionContext,
            );

            camera.position.x += resolvedMovement.x;
            camera.position.z += resolvedMovement.z;
            camera.position.y = PLAYER_HEIGHT;
        }
    };

    const update = (deltaTime: number) => {
        accumulator += deltaTime;
        while (accumulator >= FIXED_DT) {
            updateSimulation(FIXED_DT);
            accumulator -= FIXED_DT;
        }
    };

    const render = () => {
        renderer.beginFrame();

        const aspect = getAspectRatio();
        const viewProj = getCameraMatrix(camera, aspect);

        // PERFORMANCE: Reuse pre-allocated objects, zero allocations per frame
        const timeOfDay = getTimeOfDay(simulationTime);

        computeSunSpherical(timeOfDay, sunAzimuth, sunElevation);
        computeSunDirection(timeOfDay, lightDirection);
        computeLightColor(timeOfDay, sunElevation.value, lightColor);

        const ambientIntensity = computeAmbientIntensity(sunElevation.value);
        const moonAzimuth = { value: sunAzimuth.value + Math.PI };
        const moonElevation = { value: -sunElevation.value };
        sphericalToDirection(moonAzimuth.value, moonElevation.value, moonLightDirection);

        const sunVisibility = computeSunVisibility(timeOfDay);
        const moonVisibility = computeMoonVisibility(timeOfDay);
        const activeLightDirection = moonVisibility > sunVisibility ? moonLightDirection : lightDirection;

        if (renderer.setLightDirection) {
            renderer.setLightDirection(activeLightDirection);
        }
        if (renderer.setLightColor) {
            renderer.setLightColor(lightColor);
        }
        if (renderer.setAmbientIntensity) {
            renderer.setAmbientIntensity(ambientIntensity);
        }

        sunDirectionForPosition.x = lightDirection.x;
        sunDirectionForPosition.y = lightDirection.y;
        sunDirectionForPosition.z = lightDirection.z;

        computeCelestialPosition(sunDirectionForPosition, CELESTIAL_DISTANCE, camera.position, sunPosition);

        moonDirectionForPosition.x = moonLightDirection.x;
        moonDirectionForPosition.y = moonLightDirection.y;
        moonDirectionForPosition.z = moonLightDirection.z;

        computeCelestialPosition(moonDirectionForPosition, CELESTIAL_DISTANCE, camera.position, moonPosition);
        computeCelestialTransform(sunPosition, SUN_SIZE, sunTransform);
        computeCelestialTransform(moonPosition, MOON_SIZE, moonTransform);

        if (sunVisibility > 0) {
            sunColorWithVisibility.x = SUN_COLOR.x * sunVisibility;
            sunColorWithVisibility.y = SUN_COLOR.y * sunVisibility;
            sunColorWithVisibility.z = SUN_COLOR.z * sunVisibility;

            matrixMultiplyInto(viewProj, sunTransform, sunMVP);
            renderer.drawMesh(sunMesh, sunMVP, sunColorWithVisibility);
        }

        if (moonVisibility > 0) {
            moonColorWithVisibility.x = MOON_COLOR.x * moonVisibility;
            moonColorWithVisibility.y = MOON_COLOR.y * moonVisibility;
            moonColorWithVisibility.z = MOON_COLOR.z * moonVisibility;

            matrixMultiplyInto(viewProj, moonTransform, moonMVP);
            renderer.drawMesh(moonMesh, moonMVP, moonColorWithVisibility);
        }

        const visibleMeshes = world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            matrixMultiplyInto(viewProj, sm.transform, meshMVP);
            renderer.drawMesh(sm.mesh, meshMVP, sm.color);
        });

        if (debugHUD && debugHUDVisible) {
            const rotation = quaternionFromYawPitch(camera.yaw, camera.pitch);
            const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

            debugHUD.render({
                cameraPosition: camera.position,
                cameraForward: forward,
                sunPosition,
                moonPosition,
                timeOfDay,
            });
        }

        renderer.endFrame();
    };

    const getCameraPosition = (): Vec3 => camera.position;
    const getTimeOfDayExported = (): number => getTimeOfDay(simulationTime);

    return {
        update,
        render,
        getCameraPosition,
        getTimeOfDay: getTimeOfDayExported,
    };
};

export default createGameLoop;
