import type { Renderer, MeshHandle } from '../services/renderer';
import type { Mat4 } from '../types/common';

import { createCamera, getCameraMatrix } from './camera';
import { InputState } from './input';
import { matrixMultiply } from './math';
import { World } from './world';

// Helper to create identity matrix
export const createIdentityMatrix = (): Mat4 => {
    const elements = new Float32Array(16);

    elements[0] = 1;
    elements[5] = 1;
    elements[10] = 1;
    elements[15] = 1;

    return { elements };
}

export const createGameLoop = (
    renderer: Renderer,
    inputState: InputState,
    world: World,
    getAspectRatio: () => number
): () => void => {
    const camera = createCamera();
    const triangleMesh = (renderer as any).createTriangleMesh?.('test-triangle'); // TODO: Set Triangle Mesh Class
    const modelMatrix = createIdentityMatrix();
  
    return () => {
        // Update Camera
        const sensitivity = 0.005;
        camera.yaw += inputState.axes.lookX * sensitivity;
        camera.pitch -= inputState.axes.lookY * sensitivity;

        // Clamp pitch to prevent flipping (approx 90 degrees)
        const limit = Math.PI / 2 - 0.01;
        camera.pitch = Math.max(-limit, Math.min(limit, camera.pitch));

        // Render
        renderer.beginFrame();

        const aspect = getAspectRatio();
        const viewProj = getCameraMatrix(camera, aspect);
        const finalTransform = matrixMultiply(viewProj, modelMatrix);

        if (triangleMesh) {
            renderer.drawMesh(triangleMesh, finalTransform, { x: 1, y: 1, z: 1 });
        }

        for (const sm of world.getVisibleMeshes()) {
            renderer.drawMesh(sm.mesh, sm.transform, sm.color);
        }

        renderer.endFrame();

        // Reset transient input
        inputState.axes.lookX = 0;
        inputState.axes.lookY = 0;
  };
};
