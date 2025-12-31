import type { Renderer, MeshHandle } from '../services/renderer';
import type { Mat4 } from '../types/common';

import { createCamera, getCameraMatrix } from './camera';
import { InputState } from './input';
import { matrixMultiply } from './math';
import { World } from './world';

export const createIdentityMatrix = (): Mat4 => {
    const elements = new Float32Array(16);

    elements[0] = 1;
    elements[5] = 1;
    elements[10] = 1;
    elements[15] = 1;

    return { elements };
}

const FIXED_DT = 1 / 60;

export const createGameLoop = (
    renderer: Renderer,
    inputState: InputState,
    world: World,
    getAspectRatio: () => number
) => {
    const camera = createCamera();
    // TODO: Consider typing more strictly
    const floorMesh = (renderer as any).createPlaneMesh(10);
    const cubeMesh  = (renderer as any).createCubeMesh(1);
    const modelMatrix = createIdentityMatrix();

    let accumulator = 0;

    const updateSimulation = (dt: number) => {
        // Fixed timestep simulation updates
        const sensitivity = 0.005;
        camera.yaw += inputState.axes.lookX * sensitivity;
        camera.pitch -= inputState.axes.lookY * sensitivity;

        // Clamp pitch to prevent flipping (approx 90 degrees)
        const limit = Math.PI / 2 - 0.01;
        camera.pitch = Math.max(-limit, Math.min(limit, camera.pitch));

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

        for (const sm of world.getVisibleMeshes()) {
            const mvp = matrixMultiply(viewProj, sm.transform);
            renderer.drawMesh(sm.mesh, mvp, sm.color);
        }

        renderer.endFrame();
    };

    return { update, render };
};
