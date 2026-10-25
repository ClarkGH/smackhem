import { describe, it, expect } from 'vitest';
import DrawList from './drawList';
import { identity } from '../../../core/math/mathHelpers';

describe('DrawList', () => {
    it('copies a reused scratch matrix, so each draw keeps its own value', () => {
        // How renderBoundaryWireframe draws walls: one transform, rewritten per wall
        const list = new DrawList(4);
        const scratch = identity();
        const color = { x: 1, y: 0, z: 0 };

        scratch.elements[12] = 5;
        list.pushMesh('wall', scratch, color, true);
        scratch.elements[12] = -5;
        color.x = 0.5;
        list.pushMesh('wall', scratch, color, true);

        expect(list.get(0).matrix.elements[12]).toBe(5);
        expect(list.get(0).color.x).toBe(1);
        expect(list.get(1).matrix.elements[12]).toBe(-5);
        expect(list.get(1).color.x).toBe(0.5);
    });

    it('carries mesh opacity, solid by default', () => {
        // A pooled command reused from a see-through draw must not stay see-through
        const list = new DrawList(1);
        const m = identity();
        list.pushMesh('sun', m, { x: 1, y: 1, z: 0 }, true, 0.4);
        expect(list.get(0).alpha).toBe(0.4);
        list.reset();
        list.pushMesh('cube', m, { x: 1, y: 1, z: 1 }, false);
        expect(list.get(0).alpha).toBe(1);
    });

    it('keeps call order across kinds', () => {
        // scene_2d draws meshes, then clears over them, then the screen quad
        const list = new DrawList(4);
        const m = identity();
        list.pushMesh('floor', m, { x: 1, y: 1, z: 1 }, false);
        list.pushClear(1, 0.41, 0.71, 0.5);
        list.pushScreenQuad('sprite', m);
        list.pushTexturedQuad('billboard', m, { x: 0, y: 0, z: 1 });

        expect(list.size()).toBe(4);
        expect(list.get(0).kind).toBe('mesh');
        expect(list.get(1).kind).toBe('clear');
        expect(list.get(1).alpha).toBe(0.5);
        expect(list.get(2).kind).toBe('screenQuad');
        expect(list.get(3).kind).toBe('texturedQuad');
        expect(list.get(3).normal.z).toBe(1);
    });

    it('reuses pooled commands after reset, and grows past capacity', () => {
        const list = new DrawList(1);
        const m = identity();
        list.pushMesh('a', m, { x: 0, y: 0, z: 0 }, false);
        const first = list.get(0);

        list.reset();
        expect(list.size()).toBe(0);
        list.pushMesh('b', m, { x: 0, y: 0, z: 0 }, false);
        expect(list.get(0)).toBe(first);
        expect(list.get(0).id).toBe('b');

        list.pushMesh('c', m, { x: 0, y: 0, z: 0 }, false);
        expect(list.size()).toBe(2);
        expect(list.get(1).id).toBe('c');
    });
});
