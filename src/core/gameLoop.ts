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
    matrixMultiply,
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
    const camera = createCamera();
    const collisionContext = createCollisionContext();

    // PERFORMANCE: Pre-allocate objects once in gameLoop closure (reused every frame)
    // eslint-disable-next-line
    let simulationTime = 0;
    let accumulator = 0;
    // eslint-disable-next-line
    const DAY_LENGTH_SECONDS = 120; // 2 minutes per full cycle (configurable)
    const HORIZON_THRESHOLD = 0.0; // Elevation threshold for horizon (radians)
    // eslint-disable-next-line
    const DECLINATION_OFFSET = 0.0; // Seasonal tilt offset (for future use, currently 0)

    // Constants for visual celestial objects
    const CELESTIAL_DISTANCE = camera.far - 1.0; // Very large distance (effectively infinite, must be < camera.far)
    const SUN_SIZE = 0.5; // Radius of sun orb (sphere)
    const MOON_SIZE = 0.4; // Radius of moon orb (sphere)

    // Color definitions (RGB values 0-1)
    // Golden yellow sun: warm, bright yellow-orange
    const SUN_COLOR: Vec3 = { x: 1.0, y: 0.85, z: 0.2 }; // Golden yellow

    // Cool blue moon: cool, desaturated blue
    const MOON_COLOR: Vec3 = { x: 0.4, y: 0.6, z: 0.9 }; // Cool blue

    // Pre-allocate objects for lighting calculations (zero allocations per frame)
    const lightDirection = { x: 0, y: 0, z: 0 };
    const lightColor = { x: 0, y: 0, z: 0 };

    // Pre-allocate objects for celestial rendering (zero allocations per frame)
    const sunPosition = { x: 0, y: 0, z: 0 };
    const moonPosition = { x: 0, y: 0, z: 0 };
    const sunTransform = identity(); // 4x4 matrix
    const moonTransform = identity(); // 4x4 matrix
    const moonLightDirection = { x: 0, y: 0, z: 0 }; // For moon (opposite of sun)
    const sunDirectionForPosition = { x: 0, y: 0, z: 0 }; // Negated light direction for sun positioning
    const moonDirectionForPosition = { x: 0, y: 0, z: 0 }; // Negated moon direction for moon positioning
    const sunAzimuth = { value: 0 }; // For spherical coordinate calculations
    const sunElevation = { value: 0 }; // For spherical coordinate calculations

    // Pre-allocate color objects for celestial rendering
    const sunColorWithVisibility = { x: 0, y: 0, z: 0 };
    const moonColorWithVisibility = { x: 0, y: 0, z: 0 };

    // Debug HUD state
    let debugHUDVisible = false;

    // Create meshes once (reused every frame)
    // Sun: sphere mesh (orb)
    const sunMesh = renderer.createSphereMesh(SUN_SIZE, 16); // 16 segments for smooth sphere

    // Moon: sphere mesh (orb)
    const moonMesh = renderer.createSphereMesh(MOON_SIZE, 16); // 16 segments for smooth sphere

    // Convert simulation time to time of day (0-1 cycle)
    // 0.0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk, 1.0 = next midnight
    const getTimeOfDay = (simTime: number): number => (simTime % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;

    // Compute sun azimuth and elevation using spherical coordinates
    // Azimuth: 0 = north, π/2 = east, π = south, 3π/2 = west (compass direction)
    // Elevation: 0 = horizon, π/2 = zenith (height above horizon)
    // PERFORMANCE: Writes into existing objects to avoid allocation
    const computeSunSpherical = (
        timeOfDay: number,
        outAzimuth: { value: number },
        outElevation: { value: number },
    ): void => {
        // Map time of day to full rotation (0 to 2π)
        // Sun rises in east (π/2) at dawn (0.25), sets in west (3π/2) at dusk (0.75)
        const angle = timeOfDay * Math.PI * 2;

        // Elevation: sin curve from -1 (midnight) to 1 (noon) to -1 (next midnight)
        // Add declination offset for seasonal variation (future use)
        const elevation = Math.sin(angle) + DECLINATION_OFFSET;

        // Azimuth: cos curve, adjusted for east-west arc
        // At noon (0.5), azimuth = π (south)
        // At dawn (0.25), azimuth = π/2 (east)
        // At dusk (0.75), azimuth = 3π/2 (west)
        const azimuth = Math.PI / 2 + angle; // Start at east (π/2), rotate clockwise

        // eslint-disable-next-line no-param-reassign
        outAzimuth.value = azimuth;
        // eslint-disable-next-line no-param-reassign
        outElevation.value = elevation;
    };

    // Convert spherical coordinates (azimuth, elevation) to Cartesian direction vector
    // PERFORMANCE: Writes into existing object to avoid allocation
    const sphericalToDirection = (
        azimuth: number,
        elevation: number,
        out: Vec3,
    ): void => {
        // Spherical to Cartesian conversion:
        // x = cos(elevation) * sin(azimuth)  [east-west component]
        // y = sin(elevation)                [up-down component]
        // z = cos(elevation) * cos(azimuth) [north-south component]

        const cosElev = Math.cos(elevation);
        out.x = cosElev * Math.sin(azimuth);
        out.y = Math.sin(elevation);
        out.z = cosElev * Math.cos(azimuth);

        // Normalize (should already be normalized, but safety check)
        const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
        if (len > 0.0001) {
            out.x /= len;
            out.y /= len;
            out.z /= len;
        }
    };

    // Compute sun direction using spherical coordinates
    // Physical behavior: east → overhead → west → below horizon
    // Coordinate system: Y-up world space, light direction points TOWARD the light source (standard graphics convention)
    // PERFORMANCE: Writes into existing object to avoid allocation
    const computeSunDirection = (timeOfDay: number, out: Vec3): void => {
        const azimuth = { value: 0 };
        const elevation = { value: 0 };

        // Compute spherical coordinates
        computeSunSpherical(timeOfDay, azimuth, elevation);

        // Convert to Cartesian direction
        sphericalToDirection(azimuth.value, elevation.value, out);

        // Clamp elevation to horizon: if below horizon, use horizontal light
        // This prevents lighting from below the floor
        if (elevation.value < HORIZON_THRESHOLD) {
            // Use horizontal direction (Y = 0) when below horizon
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

    // Compute light color with elevation-based gradient
    // Color transitions: white at zenith → red/orange near horizon → cool at night
    // Simulates atmospheric scattering (Rayleigh scattering)
    // PERFORMANCE: Writes into existing object to avoid allocation
    const computeLightColor = (
        timeOfDay: number,
        elevation: number,
        out: Vec3,
    ): void => {
        // Normalize elevation to 0-1 range (horizon to zenith)
        const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));

        if (elevation < HORIZON_THRESHOLD) {
            // Below horizon: cool night color
            out.x = 0.3;
            out.y = 0.4;
            out.z = 0.6; // Cool blue
        } else {
            // Above horizon: gradient from white (zenith) to red/orange (horizon)
            // Use smoothstep for smooth transition
            const t = normalizedElev;
            // Safety check: ensure smoothstep bounds are valid (t should be 0-1)
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

    // Compute ambient intensity using sigmoid curve (sharp drop near horizon)
    // Uses high-power cosine for sharp transition, not linear fade
    // PERFORMANCE: Pure function, no allocations
    const computeAmbientIntensity = (elevation: number): number => {
        if (elevation < HORIZON_THRESHOLD) {
            return 0.1; // Dark night ambient
        }

        // Normalize elevation to 0-1 (horizon to zenith)
        const normalizedElev = (elevation + 1) / 2;

        // Use high-power cosine for sharp drop near horizon
        // cos^4 curve: drops sharply near 0, stays high near 1
        const cosElev = Math.cos((normalizedElev * Math.PI) / 2);
        const intensity = cosElev * cosElev * cosElev * cosElev; // cos^4

        // Map to ambient range: 0.1 (horizon) to 0.5 (zenith)
        return 0.1 + 0.4 * intensity;
    };

    // Compute sun visibility (0-1, smooth transition)
    // Sun visible during day (0.25 to 0.75 of cycle), fade at edges
    // PERFORMANCE: Pure function, no allocations
    const computeSunVisibility = (timeOfDay: number): number => {
        const dayCenter = 0.5; // Noon is center of day
        const dayWidth = 0.5; // Day spans 0.25 to 0.75 (half the cycle)
        const dist = Math.abs(timeOfDay - dayCenter) * 2; // Distance from center, scaled
        return Math.max(0, 1 - (dist / dayWidth)); // Fade from 1 at center to 0 at edges
    };

    // Compute moon visibility (0-1, smooth transition)
    // Moon visible during night (opposite of sun)
    // PERFORMANCE: Pure function, no allocations
    const computeMoonVisibility = (timeOfDay: number): number => 1 - computeSunVisibility(timeOfDay);

    // Compute sun/moon position in world space (along light direction, at fixed distance from player)
    // PERFORMANCE: Writes into existing object to avoid allocation (complies with RULE M-1)
    // LEARNING: Vector math: position = start + direction * distance
    const computeCelestialPosition = (
        dirVec: Vec3, // Normalized direction vector (points TOWARD the celestial object from the scene)
        distance: number, // Distance from player to celestial object
        playerPosition: Vec3, // Player/camera position in world space
        out: Vec3, // Output: celestial object position
    ): void => {
        // Position = player position + (direction * distance)
        // dirVec points TOWARD the celestial object, so we use it directly
        out.x = playerPosition.x + dirVec.x * distance;
        out.y = playerPosition.y + dirVec.y * distance;
        out.z = playerPosition.z + dirVec.z * distance;
    };

    // Compute transform matrix for celestial object (sphere/orb)
    // Spheres look correct from any angle, so we only need translation (no rotation)
    // PERFORMANCE: Writes into existing matrix to avoid allocation
    // LEARNING: 4x4 transformation matrix layout (column-major order)
    const computeCelestialTransform = (
        position: Vec3, // World position of celestial object
        size: number, // Size scaling factor (sphere radius)
        out: Mat4, // Output: 4x4 transformation matrix
    ): void => {
        const o = out.elements;

        // Identity matrix with translation and uniform scaling
        // Column 0: X-axis (scaled by size)
        o[0] = size; o[1] = 0; o[2] = 0; o[3] = 0;
        // Column 1: Y-axis (scaled by size)
        o[4] = 0; o[5] = size; o[6] = 0; o[7] = 0;
        // Column 2: Z-axis (scaled by size)
        o[8] = 0; o[9] = 0; o[10] = size; o[11] = 0;
        // Column 3: Translation (position)
        o[12] = position.x; o[13] = position.y; o[14] = position.z; o[15] = 1;
    };

    const updateSimulation = (dt: number) => {
        // Fixed timestep simulation updates
        simulationTime += dt;
        const intent = input.getIntent();

        // Handle debug HUD toggle
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

        // Clamp pitch to prevent flipping (approx 90 degrees)
        const limit = Math.PI / 2 - 0.01;
        camera.pitch = Math.max(-limit, Math.min(limit, camera.pitch));

        // Player movement
        const { x: moveX, y: moveY } = intent.move;

        if (moveX !== 0 || moveY !== 0) {
            const forward = getCameraForward(camera.yaw, camera.pitch);
            const right = getCameraRight(camera.yaw);

            // Combine movement vectors
            const proposedMovement = {
                x: (forward.x * moveY + right.x * moveX) * PLAYER_SPEED * dt,
                y: 0,
                z: (forward.z * moveY + right.z * moveX) * PLAYER_SPEED * dt,
            };

            const worldAABBs = world.getCollidableAABBs();

            // Resolve collision by adjusting movement (worldAABBs is a reused buffer)
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
            // Keep player at ground level
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

        // Compute lighting parameters deterministically from simulation time
        // PERFORMANCE: Reuse pre-allocated objects, zero allocations per frame
        const timeOfDay = getTimeOfDay(simulationTime);

        // Compute spherical coordinates (azimuth, elevation)
        computeSunSpherical(timeOfDay, sunAzimuth, sunElevation);

        // Compute sun direction from spherical coordinates
        computeSunDirection(timeOfDay, lightDirection);

        // Compute light color based on elevation (gradient with atmospheric scattering)
        computeLightColor(timeOfDay, sunElevation.value, lightColor);

        // Compute ambient intensity using sigmoid curve (sharp drop near horizon)
        const ambientIntensity = computeAmbientIntensity(sunElevation.value);

        // Compute moon spherical coordinates (opposite phase) - needed for light direction selection
        const moonAzimuth = { value: sunAzimuth.value + Math.PI };
        const moonElevation = { value: -sunElevation.value };

        // Convert moon spherical to direction
        sphericalToDirection(moonAzimuth.value, moonElevation.value, moonLightDirection);

        // Calculate visibility to determine which light source to use
        const sunVisibility = computeSunVisibility(timeOfDay);
        const moonVisibility = computeMoonVisibility(timeOfDay);

        // Use light direction from whichever celestial body is more visible
        // At night (moon more visible), use moon's light direction; at day (sun more visible), use sun's
        const activeLightDirection = moonVisibility > sunVisibility ? moonLightDirection : lightDirection;

        // Set lighting parameters via renderer interface
        if (renderer.setLightDirection) {
            renderer.setLightDirection(activeLightDirection);
        }
        if (renderer.setLightColor) {
            renderer.setLightColor(lightColor);
        }
        if (renderer.setAmbientIntensity) {
            renderer.setAmbientIntensity(ambientIntensity);
        }

        // Compute celestial positions (at infinite distance)
        // lightDirection points TOWARD the light source (from spherical coordinates),
        // so use it directly to position the celestial object
        sunDirectionForPosition.x = lightDirection.x;
        sunDirectionForPosition.y = lightDirection.y;
        sunDirectionForPosition.z = lightDirection.z;

        computeCelestialPosition(sunDirectionForPosition, CELESTIAL_DISTANCE, camera.position, sunPosition);

        // moonLightDirection points TOWARD the moon (from spherical coordinates),
        // so use it directly to position the celestial object
        moonDirectionForPosition.x = moonLightDirection.x;
        moonDirectionForPosition.y = moonLightDirection.y;
        moonDirectionForPosition.z = moonLightDirection.z;

        computeCelestialPosition(moonDirectionForPosition, CELESTIAL_DISTANCE, camera.position, moonPosition);

        // Compute transforms (simple translation + scaling for spheres)
        computeCelestialTransform(sunPosition, SUN_SIZE, sunTransform);
        computeCelestialTransform(moonPosition, MOON_SIZE, moonTransform);

        // Visibility already computed above for light direction selection, reuse values

        // Render sun (if visible)
        if (sunVisibility > 0) {
            // Apply visibility to color (write into pre-allocated object)
            sunColorWithVisibility.x = SUN_COLOR.x * sunVisibility;
            sunColorWithVisibility.y = SUN_COLOR.y * sunVisibility;
            sunColorWithVisibility.z = SUN_COLOR.z * sunVisibility;

            // Calculate MVP matrix (model * view * projection)
            const sunMVP = matrixMultiply(viewProj, sunTransform);

            // Draw sun mesh
            renderer.drawMesh(sunMesh, sunMVP, sunColorWithVisibility);
        }

        // Render moon (if visible)
        if (moonVisibility > 0) {
            // Apply visibility to color (write into pre-allocated object)
            moonColorWithVisibility.x = MOON_COLOR.x * moonVisibility;
            moonColorWithVisibility.y = MOON_COLOR.y * moonVisibility;
            moonColorWithVisibility.z = MOON_COLOR.z * moonVisibility;

            // Calculate MVP matrix (model * view * projection)
            const moonMVP = matrixMultiply(viewProj, moonTransform);

            // Draw moon mesh
            renderer.drawMesh(moonMesh, moonMVP, moonColorWithVisibility);
        }

        // Render world meshes
        const visibleMeshes = world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            const mvp = matrixMultiply(viewProj, sm.transform);
            renderer.drawMesh(sm.mesh, mvp, sm.color);
        });

        // Render debug HUD (if enabled)
        if (debugHUD && debugHUDVisible) {
            // Get full camera forward vector (including pitch) for viewing direction
            const rotation = quaternionFromYawPitch(camera.yaw, camera.pitch);
            const cameraForward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

            debugHUD.render({
                cameraPosition: camera.position,
                cameraForward,
                sunPosition,
                moonPosition,
                timeOfDay,
            });
        }

        renderer.endFrame();
    };

    const getCameraPosition = (): Vec3 => camera.position;

    // Exported getTimeOfDay for external use (takes simulationTime as parameter)
    const getTimeOfDayExported = (): number => getTimeOfDay(simulationTime);

    return {
        update,
        render,
        getCameraPosition,
        getTimeOfDay: getTimeOfDayExported,
    };
};

export default createGameLoop;
