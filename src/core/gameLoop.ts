import type { Renderer, MeshHandle } from '../services/renderer';
import type { Mat4 } from '../types/common';

import { createCamera, getCameraMatrix } from './camera';

// Helper to create identity matrix
export const createIdentityMatrix = (): Mat4 => {
    const elements = new Float32Array(16);

    elements[0] = 1;
    elements[5] = 1;
    elements[10] = 1;
    elements[15] = 1;

    return { elements };
}

export const createGameLoop = (renderer: Renderer): () => void => {
    const camera = createCamera();
    const triangleMesh = (renderer as any).createTriangleMesh?.('test-triangle');
  
    return () => {
      renderer.beginFrame();
  
      const aspect = 800 / 600; // TEMP
      const cameraMatrix = getCameraMatrix(camera, aspect);
  
      if (triangleMesh) {
        renderer.drawMesh(triangleMesh, cameraMatrix, { x: 1, y: 1, z: 1 });
      }
  
      renderer.endFrame();
    };
};
