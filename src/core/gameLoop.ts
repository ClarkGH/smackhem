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
import { resolveCollision } from './collision';
import { matrixMultiply } from './math/mathHelpers';
import { World } from './world';

const FIXED_DT = 1 / 60;

const createGameLoop = (
    renderer: Renderer,
    input: Input,
    world: World,
    getAspectRatio: () => number,
) => {
    const camera = createCamera();

    // Set light direction from east (westward with slight upward angle)
    const lightDirection = { x: -1, y: 0.2, z: 0 };
    if (renderer.setLightDirection) {
        renderer.setLightDirection(lightDirection);
    }

    let accumulator = 0;

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

            // Resolve collision by adjusting movement
            const resolvedMovement = resolveCollision(
                camera.position,
                proposedMovement,
                worldAABBs,
                PLAYER_HEIGHT,
                PLAYER_RADIUS,
            );

            camera.position.x += resolvedMovement.x;
            camera.position.z += resolvedMovement.z;
            // Keep player at ground level
            camera.position.y = PLAYER_HEIGHT;
        }

        // Update chunk loading/unloading based on player position
        world.updateActiveChunks(camera.position, renderer);
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

        const visibleMeshes = world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            const mvp = matrixMultiply(viewProj, sm.transform);
            renderer.drawMesh(sm.mesh, mvp, sm.color);
        });

        renderer.endFrame();
    };

    return { update, render };
};

export default createGameLoop;
