import type { Renderer, MeshHandle } from '../../services/renderer';
import type { Mat4, Vec3 } from '../../types/common';

interface WebGLMesh {
    vao: WebGLVertexArrayObject;
    vertexCount: number;
}

export class WebGLRenderer implements Renderer {
    private gl: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;
    private program: WebGLProgram | null = null;
    private meshes: Map<string, WebGLMesh> = new Map();
    private wireframe: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            throw new Error('WebGL2 not supported');
        }
        this.gl = gl;
        this.gl.clearColor(38/255, 151/255, 121/255, 1);
        
        // Set viewport
        this.gl.viewport(0, 0, canvas.width, canvas.height);
        
        // Enable depth testing
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        
        this.initShaders();
    }

    private initShaders(): void {
        const vertexShaderSource = `#version 300 es
            in vec3 a_position;
            uniform mat4 u_transform;
            
            void main() {
                gl_Position = u_transform * vec4(a_position, 1.0);
            }
        `;

        const fragmentShaderSource = `#version 300 es
            precision mediump float;
            uniform vec3 u_color;
            out vec4 fragColor;
            
            void main() {
                fragColor = vec4(u_color, 1.0);
            }
        `;

        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to compile shaders');
        }

        this.program = this.createProgram(vertexShader, fragmentShader);
        if (!this.program) {
            throw new Error('Failed to create shader program');
        }
    }

    private compileShader(type: number, source: string): WebGLShader | null {
        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            console.error('Shader compilation error:', info);
            return null;
        }

        return shader;
    }

    private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const info = this.gl.getProgramInfoLog(program);
            this.gl.deleteProgram(program);
            console.error('Program linking error:', info);
            return null;
        }

        return program;
    }

    createTriangleMesh(id: string): MeshHandle {
        // Create a simple 3D triangle
        const vertices = new Float32Array([
            // x, y, z
            0.0,  0.5,  0.0,  // Top
            -0.5, -0.5,  0.0,  // Bottom left
            0.5, -0.5,  0.0,  // Bottom right
        ]);

        const vao = this.gl.createVertexArray();
        if (!vao) {
            throw new Error('Failed to create vertex array object');
        }

        this.gl.bindVertexArray(vao);

        const buffer = this.gl.createBuffer();
        if (!buffer) {
            throw new Error('Failed to create buffer');
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program!, 'a_position');
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);

        this.gl.bindVertexArray(null);

        const mesh: WebGLMesh = {
            vao,
            vertexCount: 3
        };

        this.meshes.set(id, mesh);

        return { id };
    }

    beginFrame(): void {
        // Update viewport in case canvas was resized
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    drawMesh(mesh: MeshHandle, transform: Mat4, color: Vec3): void {
        const webglMesh = this.meshes.get(mesh.id);
        if (!webglMesh || !this.program) {
            return;
        }

        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(webglMesh.vao);

        // Set color uniform
        const colorLocation = this.gl.getUniformLocation(this.program, 'u_color');
        this.gl.uniform3f(colorLocation, color.x, color.y, color.z);

        // Set transform uniform
        const transformLocation = this.gl.getUniformLocation(this.program, 'u_transform');

        this.gl.uniformMatrix4fv(transformLocation, true, transform.elements);

        // Set wireframe mode
        if (this.wireframe) {
            this.gl.polygonOffset(0, 0);
            this.gl.drawArrays(this.gl.LINE_LOOP, 0, webglMesh.vertexCount);
        } else {
            this.gl.drawArrays(this.gl.TRIANGLES, 0, webglMesh.vertexCount);
        }

        this.gl.bindVertexArray(null);
    }

    endFrame(): void {
        // Present frame (WebGL handles this automatically)
    }

    setWireframe(enabled: boolean): void {
        this.wireframe = enabled;
    }
}
