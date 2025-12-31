import type { Renderer } from '../services/renderer';
import {
    createCamera,
    getCameraMatrix,
    PLAYER_SPEED,
    PLAYER_HEIGHT,
    getCameraForward,
    getCameraRight,
} from './camera';
import { InputState } from './input';
import { matrixMultiply } from './math';
import { World } from './world';

const FIXED_DT = 1 / 60;

const createGameLoop = (
    renderer: Renderer,
    inputState: InputState,
    world: World,
    getAspectRatio: () => number,
) => {
    const camera = createCamera();

    let accumulator = 0;

    const updateSimulation = (dt: number) => {
        // Fixed timestep simulation updates
        const sensitivity = 0.005;
        camera.yaw += inputState.axes.lookX * sensitivity;
        camera.pitch -= inputState.axes.lookY * sensitivity;

        // Clamp pitch to prevent flipping (approx 90 degrees)
        const limit = Math.PI / 2 - 0.01;
        camera.pitch = Math.max(-limit, Math.min(limit, camera.pitch));

        // Player movement
        const { moveX } = inputState.axes;
        const { moveY } = inputState.axes;

        if (moveX !== 0 || moveY !== 0) {
            const forward = getCameraForward(camera.yaw, camera.pitch);
            const right = getCameraRight(camera.yaw);

            // Combine movement vectors
            const movement = {
                x: (forward.x * moveY + right.x * moveX) * PLAYER_SPEED * dt,
                y: 0,
                z: (forward.z * moveY + right.z * moveX) * PLAYER_SPEED * dt,
            };

            camera.position.x += movement.x;
            camera.position.z += movement.z;
            // Keep player at ground level
            camera.position.y = PLAYER_HEIGHT;
        }

        // Update chunk loading/unloading based on player position
        world.updateActiveChunks(camera.position, renderer);

        // Reset transient input
        inputState.axes.lookX = 0;
        inputState.axes.lookY = 0;
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
