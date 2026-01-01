import type { Renderer, MeshHandle } from '../../services/renderer';
import type { Mat4, Vec3 } from '../../types/common';
import { identity } from '../../core/math/mathHelpers';

interface WebGLMesh {
    vao: WebGLVertexArrayObject;
    vertexCount: number;
}

export default class WebGLRenderer implements Renderer {
    private gl: WebGL2RenderingContext;

    private canvas: HTMLCanvasElement;

    private program: WebGLProgram | null = null;

    private meshes: Map<string, WebGLMesh> = new Map();

    private wireframe: boolean = false;

    private meshCache = new Map<string, MeshHandle>();

    private lightDirection: Vec3 = { x: -1, y: 0, z: 0 };

    private lightColor: Vec3 = { x: 1, y: 1, z: 1 };

    private ambientIntensity: number = 0.3;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            throw new Error('WebGL2 not supported');
        }

        this.gl = gl;
        this.gl.clearColor(160 / 255, 160 / 255, 160 / 255, 1);

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
            in vec3 a_normal;
            
            uniform mat4 u_transform;
            uniform mat4 u_normalMatrix;
            
            out vec3 v_normal;
            out vec3 v_position;
            
            void main() {
                vec4 worldPos = u_transform * vec4(a_position, 1.0);
                v_position = worldPos.xyz;
                v_normal = normalize((u_normalMatrix * vec4(a_normal, 0.0)).xyz);
                gl_Position = worldPos;
            }
        `;

        const fragmentShaderSource = `#version 300 es
            precision mediump float;
            
            uniform vec3 u_color;
            uniform vec3 u_lightDirection;
            uniform vec3 u_lightColor;
            uniform float u_ambientIntensity;
            
            in vec3 v_normal;
            in vec3 v_position;
            
            out vec4 fragColor;
            
            void main() {
                // Normalize light direction (should be normalized on CPU, but safety check)
                vec3 lightDir = normalize(-u_lightDirection);
                
                // Calculate diffuse lighting (Lambertian)
                float diff = max(dot(v_normal, lightDir), 0.0);
                
                // Combine ambient and diffuse
                float lighting = u_ambientIntensity + diff * (1.0 - u_ambientIntensity);
                
                // Apply lighting to base color (grayscale)
                vec3 finalColor = u_color * u_lightColor * lighting;
                
                fragColor = vec4(finalColor, 1.0);
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

    private createProgram(
        vertexShader: WebGLShader,
        fragmentShader: WebGLShader,
    ): WebGLProgram | null {
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

    // eslint-disable-next-line class-methods-use-this
    private calculateNormals(vertices: Float32Array): Float32Array {
        const normals = new Float32Array(vertices.length);

        for (let i = 0; i < vertices.length; i += 9) {
            // Get triangle vertices
            const v0 = { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
            const v1 = { x: vertices[i + 3], y: vertices[i + 4], z: vertices[i + 5] };
            const v2 = { x: vertices[i + 6], y: vertices[i + 7], z: vertices[i + 8] };

            // Calculate edge vectors
            const edge1 = {
                x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z,
            };
            const edge2 = {
                x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z,
            };

            // Cross product for normal
            const normal = {
                x: edge1.y * edge2.z - edge1.z * edge2.y,
                y: edge1.z * edge2.x - edge1.x * edge2.z,
                z: edge1.x * edge2.y - edge1.y * edge2.x,
            };

            // Normalize
            const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
            if (len > 0.0001) {
                normal.x /= len;
                normal.y /= len;
                normal.z /= len;
            }

            // Apply to all three vertices of triangle
            for (let j = 0; j < 3; j += 1) {
                const idx = i + j * 3;
                normals[idx] = normal.x;
                normals[idx + 1] = normal.y;
                normals[idx + 2] = normal.z;
            }
        }

        return normals;
    }

    private createMesh(vertices: Float32Array, normals?: Float32Array): MeshHandle {
        const { gl } = this;

        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create VAO');

        gl.bindVertexArray(vao);

        // Position buffer
        const vbo = gl.createBuffer();
        if (!vbo) throw new Error('Failed to create VBO');
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(this.program!, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        // Normal buffer (calculate if not provided)
        const calculatedNormals = normals || this.calculateNormals(vertices);
        const normalVbo = gl.createBuffer();
        if (!normalVbo) throw new Error('Failed to create normal VBO');
        gl.bindBuffer(gl.ARRAY_BUFFER, normalVbo);
        gl.bufferData(gl.ARRAY_BUFFER, calculatedNormals, gl.STATIC_DRAW);

        const normalLoc = gl.getAttribLocation(this.program!, 'a_normal');
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        const id = crypto.randomUUID();

        this.meshes.set(id, {
            vao,
            vertexCount: vertices.length / 3,
        });

        return { id };
    }

    createPlaneMesh(size: number): MeshHandle {
        const key = `plane_${size}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const h = size / 2;

        // Two triangles, XZ plane, Y = 0
        const vertices = new Float32Array([
            -h, 0, -h,
            h, 0, -h,
            h, 0, h,

            -h, 0, -h,
            h, 0, h,
            -h, 0, h,
        ]);

        const mesh = this.createMesh(vertices);
        this.meshCache.set(key, mesh);

        return mesh;
    }

    createCubeMesh(size: number): MeshHandle {
        const key = `cube_${size}`;

        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const h = size / 2;

        // 6 faces × 2 triangles × 3 vertices
        const vertices = new Float32Array([
            // Front
            -h, -h, h, h, -h, h, h, h, h,
            -h, -h, h, h, h, h, -h, h, h,

            // Back
            -h, -h, -h, -h, h, -h, h, h, -h,
            -h, -h, -h, h, h, -h, h, -h, -h,

            // Left
            -h, -h, -h, -h, -h, h, -h, h, h,
            -h, -h, -h, -h, h, h, -h, h, -h,

            // Right
            h, -h, -h, h, h, -h, h, h, h,
            h, -h, -h, h, h, h, h, -h, h,

            // Top
            -h, h, -h, -h, h, h, h, h, h,
            -h, h, -h, h, h, h, h, h, -h,

            // Bottom
            -h, -h, -h, h, -h, -h, h, -h, h,
            -h, -h, -h, h, -h, h, -h, -h, h,
        ]);

        const mesh = this.createMesh(vertices);

        this.meshCache.set(key, mesh);

        return mesh;
    }

    createPyramidMesh(size: number): MeshHandle {
        const key = `pyramid_${size}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const h = size / 2;
        const apex = size; // Height of pyramid

        // Square base + 4 triangular faces
        const vertices = new Float32Array([
            // Base (square, two triangles)
            -h, 0, -h, h, 0, -h, h, 0, h,
            -h, 0, -h, h, 0, h, -h, 0, h,

            // Front face
            -h, 0, h, h, 0, h, 0, apex, 0,

            // Back face
            h, 0, -h, -h, 0, -h, 0, apex, 0,

            // Left face
            -h, 0, -h, -h, 0, h, 0, apex, 0,

            // Right face
            h, 0, h, h, 0, -h, 0, apex, 0,
        ]);

        const mesh = this.createMesh(vertices);
        this.meshCache.set(key, mesh);
        return mesh;
    }

    createPrismMesh(width: number, height: number, depth: number): MeshHandle {
        const key = `prism_${width}_${height}_${depth}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const w = width / 2;
        const h = height / 2;
        const d = depth / 2;

        // Rectangular prism (6 faces, 12 triangles)
        const vertices = new Float32Array([
            // Front
            -w, -h, d, w, -h, d, w, h, d,
            -w, -h, d, w, h, d, -w, h, d,

            // Back
            w, -h, -d, -w, -h, -d, -w, h, -d,
            w, -h, -d, -w, h, -d, w, h, -d,

            // Left
            -w, -h, -d, -w, -h, d, -w, h, d,
            -w, -h, -d, -w, h, d, -w, h, -d,

            // Right
            w, -h, d, w, -h, -d, w, h, -d,
            w, -h, d, w, h, -d, w, h, d,

            // Top
            -w, h, d, w, h, d, w, h, -d,
            -w, h, d, w, h, -d, -w, h, -d,

            // Bottom
            -w, -h, -d, w, -h, -d, w, -h, d,
            -w, -h, -d, w, -h, d, -w, -h, d,
        ]);

        const mesh = this.createMesh(vertices);
        this.meshCache.set(key, mesh);
        return mesh;
    }

    createSphereMesh(radius: number, segments: number = 16): MeshHandle {
        const key = `sphere_${radius}_${segments}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const vertices: number[] = [];

        for (let lat = 0; lat <= segments; lat += 1) {
            const theta = (lat * Math.PI) / segments;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= segments; lon += 1) {
                const phi = (lon * 2 * Math.PI) / segments;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = cosTheta;
                const z = sinPhi * sinTheta;

                vertices.push(radius * x, radius * y, radius * z);
            }
        }

        const indices: number[] = [];
        for (let lat = 0; lat < segments; lat += 1) {
            for (let lon = 0; lon < segments; lon += 1) {
                const first = lat * (segments + 1) + lon;
                const second = first + segments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        // Convert to triangle list (expand indices)
        const triangleVertices: number[] = [];
        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i] * 3;
            const i1 = indices[i + 1] * 3;
            const i2 = indices[i + 2] * 3;

            triangleVertices.push(
                vertices[i0],
                vertices[i0 + 1],
                vertices[i0 + 2],
                vertices[i1],
                vertices[i1 + 1],
                vertices[i1 + 2],
                vertices[i2],
                vertices[i2 + 1],
                vertices[i2 + 2],
            );
        }

        // Negate normals for spheres to fix lighting direction (invert column-wise)
        const verticesArray = new Float32Array(triangleVertices);
        const calculatedNormals = this.calculateNormals(verticesArray);
        for (let i = 0; i < calculatedNormals.length; i += 3) {
            calculatedNormals[i] *= -1;
            calculatedNormals[i + 1] *= -1;
            calculatedNormals[i + 2] *= -1;
        }

        const mesh = this.createMesh(verticesArray, calculatedNormals);
        this.meshCache.set(key, mesh);
        return mesh;
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
        this.gl.uniformMatrix4fv(transformLocation, false, transform.elements);

        // Use identity normal matrix (keep normals in world space since model transforms are translation-only)
        const normalMatrixLocation = this.gl.getUniformLocation(this.program, 'u_normalMatrix');
        const identityMatrix = identity();
        this.gl.uniformMatrix4fv(normalMatrixLocation, false, identityMatrix.elements);

        // Set lighting uniforms (light direction is in world space, matching normals)
        const lightDirLocation = this.gl.getUniformLocation(this.program, 'u_lightDirection');
        this.gl.uniform3f(
            lightDirLocation,
            this.lightDirection.x,
            this.lightDirection.y,
            this.lightDirection.z,
        );

        const lightColorLocation = this.gl.getUniformLocation(this.program, 'u_lightColor');
        this.gl.uniform3f(
            lightColorLocation,
            this.lightColor.x,
            this.lightColor.y,
            this.lightColor.z,
        );

        const ambientLocation = this.gl.getUniformLocation(this.program, 'u_ambientIntensity');
        this.gl.uniform1f(ambientLocation, this.ambientIntensity);

        // Set wireframe mode
        if (this.wireframe) {
            this.gl.polygonOffset(0, 0);
            this.gl.drawArrays(this.gl.LINE_LOOP, 0, webglMesh.vertexCount);
        } else {
            this.gl.drawArrays(this.gl.TRIANGLES, 0, webglMesh.vertexCount);
        }

        this.gl.bindVertexArray(null);
    }

    // eslint-disable-next-line class-methods-use-this
    endFrame(): void {
        // Present frame (WebGL handles this automatically)
    }

    setWireframe(enabled: boolean): void {
        this.wireframe = enabled;
    }

    setLightDirection(direction: Vec3): void {
        this.lightDirection = direction;
    }
}
