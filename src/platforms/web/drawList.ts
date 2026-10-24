import type { Mat4, Vec3 } from '../../types/common';

export type DrawKind = 'mesh' | 'texturedQuad' | 'screenQuad' | 'clear';

// One pooled struct for every kind; each kind reads only the fields it fills
export interface DrawCommand {
    kind: DrawKind;
    id: string; // mesh or texture id ('' for clear)
    matrix: Mat4; // model (mesh, texturedQuad) or full transform (screenQuad)
    color: Vec3; // mesh color, or clear rgb
    normal: Vec3; // texturedQuad lighting normal
    alpha: number; // clear alpha
    isLightSource: boolean;
}

const createCommand = (): DrawCommand => ({
    kind: 'clear',
    id: '',
    matrix: { elements: new Float32Array(16) },
    color: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    alpha: 0,
    isLightSource: false,
});

const copyVec3 = (src: Vec3, dst: Vec3): void => {
    dst.x = src.x; dst.y = src.y; dst.z = src.z;
};

/**
 * A frame's draws, recorded in call order and replayed later.
 * Everything is copied in, never referenced: core reuses scratch matrices
 * (one wall transform for every wall), so a stored reference would replay
 * every draw at the last value written.
 */
export default class DrawList {
    private readonly commands: DrawCommand[] = [];

    private count = 0;

    constructor(initialCapacity: number) {
        for (let i = 0; i < initialCapacity; i += 1) {
            this.commands.push(createCommand());
        }
    }

    reset(): void {
        this.count = 0;
    }

    size(): number {
        return this.count;
    }

    get(index: number): Readonly<DrawCommand> {
        return this.commands[index];
    }

    pushMesh(id: string, model: Mat4, color: Vec3, isLightSource: boolean): void {
        const cmd = this.next('mesh', id);
        cmd.matrix.elements.set(model.elements);
        copyVec3(color, cmd.color);
        cmd.isLightSource = isLightSource;
    }

    pushTexturedQuad(id: string, model: Mat4, normal: Vec3): void {
        const cmd = this.next('texturedQuad', id);
        cmd.matrix.elements.set(model.elements);
        copyVec3(normal, cmd.normal);
    }

    pushScreenQuad(id: string, transform: Mat4): void {
        const cmd = this.next('screenQuad', id);
        cmd.matrix.elements.set(transform.elements);
    }

    pushClear(r: number, g: number, b: number, a: number): void {
        const cmd = this.next('clear', '');
        cmd.color.x = r; cmd.color.y = g; cmd.color.z = b;
        cmd.alpha = a;
    }

    private next(kind: DrawKind, id: string): DrawCommand {
        // Grows only when a frame outdraws every frame before it, so allocation
        // stops once the pool fits the busiest scene (M-1)
        if (this.count === this.commands.length) {
            this.commands.push(createCommand());
        }
        const cmd = this.commands[this.count];
        this.count += 1;
        cmd.kind = kind;
        cmd.id = id;
        return cmd;
    }
}
