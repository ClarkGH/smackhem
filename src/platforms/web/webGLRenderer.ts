// src/platforms/web/webGLRenderer.ts
import type { Renderer } from '../../services/renderer';

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
        this.gl.clearColor(0, 0, 0, 1);
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
