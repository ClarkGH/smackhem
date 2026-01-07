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
import { matrixMultiply, normalizeVec3 } from './math/mathHelpers';
import { World } from './world';
import type { Vec3 } from '../types/common';

const FIXED_DT = 1 / 60;

const createGameLoop = (
    renderer: Renderer,
    input: Input,
    world: World,
    getAspectRatio: () => number,
) => {
    const camera = createCamera();
    const collisionContext = createCollisionContext();

    // PERFORMANCE: Pre-allocate objects once in gameLoop closure
    // eslint-disable-next-line
    let simulationTime = 0;
    let accumulator = 0;
    // eslint-disable-next-line
    const DAY_LENGTH_SECONDS = 120; // Seconds
    const HORIZON_THRESHOLD = 0.0; // Elevation threshold for horizon (radians)
    // eslint-disable-next-line
    const DECLINATION_OFFSET = 0.0; // Seasonal tilt offset (future)

    const updateSimulation = (dt: number) => {
        // Fixed timestep simulation updates
        const intent = input.getIntent();
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
            simulationTime += FIXED_DT;
            accumulator -= FIXED_DT;
        }
    };

    const render = () => {
        renderer.beginFrame();

        const aspect = getAspectRatio();
        const viewProj = getCameraMatrix(camera, aspect);
        // Keep everything in world space (model transforms are translation-only)
        // Using a more angled direction to make lighting direction more obvious
        const lightDirection = normalizeVec3({ x: -0.707, y: 0.5, z: -0.5 });
        if (renderer.setLightDirection) {
            renderer.setLightDirection(lightDirection);
        }

        const visibleMeshes = world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            const mvp = matrixMultiply(viewProj, sm.transform);
            renderer.drawMesh(sm.mesh, mvp, sm.color);
        });

        renderer.endFrame();
    };

    const getCameraPosition = (): Vec3 => camera.position;

    return { update, render, getCameraPosition };
};

export default createGameLoop;
