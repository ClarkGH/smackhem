import type { Renderer, MeshHandle } from '../services/renderer';
import type { Mat4, Vec3 } from '../types/common';

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
    let triangleMesh: MeshHandle | null = null;
  
    if ('createTriangleMesh' in renderer && typeof renderer.createTriangleMesh === 'function') {
      triangleMesh = (renderer as any).createTriangleMesh('test-triangle');
    }
  
    const transform = createIdentityMatrix();
    const color: Vec3 = { x: 1, y: 1, z: 1 };
  
    return () => {
        renderer.beginFrame();
        if (triangleMesh) {
            renderer.drawMesh(triangleMesh, transform, color);
        }
        renderer.endFrame();
    }
}

//TODO: We want to get the identity matrix
