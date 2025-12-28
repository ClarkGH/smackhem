import type { Renderer, MeshHandle } from '../services/renderer';
import type { Mat4, Vec3 } from '../types/common';

// Helper to create identity matrix
function createIdentityMatrix(): Mat4 {
    const elements = new Float32Array(16);
    elements[0] = 1; elements[5] = 1; elements[10] = 1; elements[15] = 1;
    return { elements };
}

export function gameLoop(renderer: Renderer): void {
    // Create a test triangle mesh if renderer supports it
    let triangleMesh: MeshHandle | null = null;
    if ('createTriangleMesh' in renderer && typeof renderer.createTriangleMesh === 'function') {
        triangleMesh = (renderer as any).createTriangleMesh('test-triangle');
    }

    // Create identity transform matrix
    const transform = createIdentityMatrix();
    
    // White color for the triangle
    const color: Vec3 = { x: 1.0, y: 1.0, z: 1.0 };

    // Basic render loop
    function render() {
        renderer.beginFrame();
        
        // Draw triangle if we have one
        if (triangleMesh) {
            renderer.drawMesh(triangleMesh, transform, color);
        }
        
        renderer.endFrame();
        
        // Request next frame
        requestAnimationFrame(render);
    }
    
    // Start the render loop
    render();
}
