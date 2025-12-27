import type { Renderer, MeshHandle } from '../../services/renderer';
import type { Mat4, Vec3 } from 'src/types/common';

export class WebGLRenderer implements Renderer {
    private gl: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            throw new Error('WebGL2 not supported');
        }
        this.gl = gl;
        this.gl.clearColor(38/255, 151/255, 121/255, 1); // Neat teal color for now
    }

    beginFrame(): void {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    drawMesh(mesh: MeshHandle, transform: Mat4, color: Vec3): void {
        // Implementation here
    }

    endFrame(): void {
        // Implementation here
    }
}
