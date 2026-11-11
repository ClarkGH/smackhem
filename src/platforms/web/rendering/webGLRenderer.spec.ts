import { describe, it, expect } from 'vitest';
import WebGLRenderer from './webGLRenderer';
import type { Mat4 } from '../../../types/common';
import { identity, orthographic } from '../../../core/math/mathHelpers';
import { createFakeWebGL } from '../../../testing/fakeWebGL';

// A frame as the render system drives it, with these meshes and nothing else.
// The camera is set after beginFrame, as RenderSystem does
const drawFrame = (renderer: WebGLRenderer, draw: () => void, viewProj: Mat4 = identity()): void => {
    renderer.beginFrame();
    renderer.setViewProjection(viewProj);
    draw();
    renderer.endFrame();
};

describe('WebGLRenderer on a fake GL context', () => {
    it('sets itself up without a real GPU', () => {
        const fake = createFakeWebGL();

        expect(() => new WebGLRenderer(fake.canvas)).not.toThrow();
        expect(fake.count('linkProgram')).toBeGreaterThan(0);
    });

    it('draws each mesh once, in its own colour', () => {
        const fake = createFakeWebGL();
        const renderer = new WebGLRenderer(fake.canvas);
        const cube = renderer.createCubeMesh(1);

        // The sky pass draws too, so measure against a frame with no meshes
        drawFrame(renderer, () => {});
        const emptyFrameDraws = fake.count('drawArrays');
        fake.calls.length = 0;

        drawFrame(renderer, () => {
            renderer.drawMesh(cube, identity(), { x: 1, y: 0, z: 0 });
            renderer.drawMesh(cube, identity(), { x: 0, y: 0, z: 1 });
        });

        expect(fake.count('drawArrays')).toBe(emptyFrameDraws + 2);
        expect(fake.sentTo('u_color').map((call) => call.args.slice(1))).toEqual([[1, 0, 0], [0, 0, 1]]);
    });

    it('sends frame-wide lighting to the lit program once per frame, not once per mesh', () => {
        const fake = createFakeWebGL();
        const renderer = new WebGLRenderer(fake.canvas);
        const cube = renderer.createCubeMesh(1);
        const lit = fake.programWith('u_isLightSource');
        renderer.setCelestialLighting(
            { direction: { x: 0, y: 1, z: 0 }, color: { x: 1, y: 1, z: 1 } },
            { direction: { x: 0, y: -1, z: 0 }, color: { x: 0, y: 0, z: 0 } },
        );
        fake.calls.length = 0;

        drawFrame(renderer, () => {
            renderer.drawMesh(cube, identity(), { x: 1, y: 0, z: 0 });
            renderer.drawMesh(cube, identity(), { x: 0, y: 1, z: 0 });
            renderer.drawMesh(cube, identity(), { x: 0, y: 0, z: 1 });
        });

        expect(fake.sentTo('u_sunDirection', lit).map((call) => call.args.slice(1))).toEqual([[0, 1, 0]]);
        expect(fake.sentTo('u_viewProj', lit)).toHaveLength(1);
        expect(fake.sentTo('u_eye', lit)).toHaveLength(1);
        expect(fake.sentTo('u_model', lit)).toHaveLength(3);
    });

    it('keeps the lighting it was given, even if the caller changes its vectors afterwards', () => {
        const fake = createFakeWebGL();
        const renderer = new WebGLRenderer(fake.canvas);
        const cube = renderer.createCubeMesh(1);
        const lit = fake.programWith('u_isLightSource');
        const sun = { direction: { x: 0, y: 1, z: 0 }, color: { x: 1, y: 1, z: 1 } };
        const moon = { direction: { x: 0, y: -1, z: 0 }, color: { x: 0, y: 0, z: 0 } };

        renderer.setCelestialLighting(sun, moon);
        sun.direction.x = 1;
        sun.direction.y = 0;
        fake.calls.length = 0;
        drawFrame(renderer, () => renderer.drawMesh(cube, identity(), { x: 1, y: 0, z: 0 }));

        expect(fake.sentTo('u_sunDirection', lit).map((call) => call.args.slice(1))).toEqual([[0, 1, 0]]);
    });

    it('sends this frame\'s camera, not the last frame\'s', () => {
        const fake = createFakeWebGL();
        const renderer = new WebGLRenderer(fake.canvas);
        const cube = renderer.createCubeMesh(1);
        const lit = fake.programWith('u_isLightSource');
        const lastFrame = identity();
        const thisFrame = identity();
        thisFrame.elements[12] = 5;

        drawFrame(renderer, () => renderer.drawMesh(cube, identity(), { x: 1, y: 0, z: 0 }), lastFrame);
        fake.calls.length = 0;
        drawFrame(renderer, () => renderer.drawMesh(cube, identity(), { x: 1, y: 0, z: 0 }), thisFrame);

        expect(fake.sentTo('u_viewProj', lit).map((call) => call.args[2])).toEqual([thisFrame.elements]);
    });

    it('fills a rect as a scissored clear, in whole pixels with y flipped for GL, and turns the scissor back off', () => {
        const fake = createFakeWebGL(800, 600);
        const renderer = new WebGLRenderer(fake.canvas);
        // The scene's projection: 800 x 600 logical units, y down
        const ortho = orthographic(0, 800, 600, 0, 0.1, 100);

        drawFrame(renderer, () => {}, ortho);
        fake.calls.length = 0;
        drawFrame(renderer, () => renderer.fillRect(100, 50, 200, 100, { x: 0.5, y: 0.25, z: 0 }), ortho);

        const names = fake.calls.map((call) => call.name);
        const at = (name: string): number => names.indexOf(name);
        const args = (name: string): unknown[] => fake.calls[at(name)].args;
        const { gl } = fake;

        expect(fake.calls.find((call) => call.name === 'enable' && call.args[0] === gl.SCISSOR_TEST)).toBeDefined();
        expect(args('scissor')).toEqual([100, 450, 200, 100]);
        // The fill's own clear comes after the scissor is set, and before it's turned off
        const fillClear = names.lastIndexOf('clearColor');
        expect(fake.calls[fillClear].args).toEqual([0.5, 0.25, 0, 1]);
        expect(fillClear).toBeGreaterThan(at('scissor'));
        const scissorOff = fake.calls.findIndex((call) => call.name === 'disable' && call.args[0] === gl.SCISSOR_TEST);
        expect(scissorOff).toBeGreaterThan(fillClear);
    });

    it('replays a clear and a fill in the order they were called', () => {
        const fake = createFakeWebGL(800, 600);
        const renderer = new WebGLRenderer(fake.canvas);
        const ortho = orthographic(0, 800, 600, 0, 0.1, 100);

        drawFrame(renderer, () => {}, ortho);
        fake.calls.length = 0;
        drawFrame(renderer, () => {
            renderer.clear(0.15, 0.15, 0.15, 1);
            renderer.fillRect(0, 0, 800, 600, { x: 0, y: 0, z: 0 });
        }, ortho);

        const colors = fake.calls.filter((call) => call.name === 'clearColor').map((call) => call.args);
        // beginFrame clears first, whatever color it uses, so look at the last two
        expect(colors.slice(-2)).toEqual([[0.15, 0.15, 0.15, 1], [0, 0, 0, 1]]);
    });
});
