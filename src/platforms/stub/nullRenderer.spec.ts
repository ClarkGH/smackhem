import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import { GameLoop } from '../../core/gameLoop';
import NullRenderer from './nullRenderer';
import { World } from '../../core/world';
import StubInput from './stubInput';
import StubClock from './stubClock';
import { identity } from '../../core/math/mathHelpers';

describe('NullRenderer - Portability Validation (RULE P-1)', () => {
    let renderer: NullRenderer;
    let input: StubInput;
    let world: World;

    beforeEach(() => {
        renderer = new NullRenderer();
        input = new StubInput();
        world = new World();
        globalThis.requestAnimationFrame = () => 0;
    });

    it('core compiles and runs with stub renderer', () => {
        expect(() => new GameLoop(
            renderer,
            input,
            world,
            () => 16 / 9,
        )).not.toThrow();
    });

    it('can create all mesh types with unique handles', () => {
        const plane = renderer.createPlaneMesh(1);
        const cube = renderer.createCubeMesh(1);
        const pyramid = renderer.createPyramidMesh(1);
        const prism = renderer.createPrismMesh(1, 1, 1);
        const sphere = renderer.createSphereMesh(1, 16);

        expect(plane.id).toMatch(/^stub-plane-\d+$/);
        expect(cube.id).toMatch(/^stub-cube-\d+$/);
        expect(pyramid.id).toMatch(/^stub-pyramid-\d+$/);
        expect(prism.id).toMatch(/^stub-prism-\d+$/);
        expect(sphere.id).toMatch(/^stub-sphere-\d+$/);

        // All handles should be unique
        const ids = [plane.id, cube.id, pyramid.id, prism.id, sphere.id];
        expect(new Set(ids).size).toBe(5);
    });

    it('tracks mesh creation count', () => {
        expect(renderer.getMeshCount()).toBe(0);
        renderer.createCubeMesh(1);
        renderer.createCubeMesh(1);
        expect(renderer.getMeshCount()).toBe(2);
    });

    it('can load textures with unique handles', async () => {
        const texture1 = await renderer.loadTexture('test-asset');
        const texture2 = await renderer.loadTexture('test-asset');

        expect(texture1.id).toMatch(/^stub_texture_test-asset_\d+$/);
        expect(texture2.id).toMatch(/^stub_texture_test-asset_\d+$/);
        expect(texture1.id).not.toBe(texture2.id);
        expect(renderer.getTextureCount()).toBe(2);
    });

    it('supports optional lighting methods', () => {
        const direction = { x: 0.5, y: 0.5, z: -0.5 };
        const color = { x: 0.8, y: 0.9, z: 1.0 };

        expect(() => {
            renderer.setLightDirection?.(direction);
            renderer.setLightColor?.(color);
            renderer.setAmbientIntensity?.(0.4);
        }).not.toThrow();

        const state = renderer.getLightingState();
        expect(state.direction.x).toBe(direction.x);
        expect(state.direction.y).toBe(direction.y);
        expect(state.color.x).toBe(color.x);
        expect(state.ambient).toBe(0.4);
    });

    it('tracks frame rendering', () => {
        expect(renderer.getFrameCount()).toBe(0);
        renderer.beginFrame();
        renderer.endFrame();
        expect(renderer.getFrameCount()).toBe(1);

        renderer.beginFrame();
        renderer.endFrame();
        expect(renderer.getFrameCount()).toBe(2);
    });

    it('validates texture handles when drawing', async () => {
        const texture = await renderer.loadTexture('valid');
        const identityMatrix = identity();
        expect(() => renderer.drawTexturedQuad(texture, identityMatrix, 1.0)).not.toThrow();

        const invalidTexture = { id: 'invalid-handle' };
        expect(() => renderer.drawTexturedQuad(invalidTexture, identityMatrix, 1.0))
            .toThrow('Invalid texture handle');
    });

    it('can reset state', async () => {
        renderer.createCubeMesh(1);
        renderer.beginFrame();
        await renderer.loadTexture('test');

        renderer.reset();

        expect(renderer.getMeshCount()).toBe(0);
        expect(renderer.getTextureCount()).toBe(0);
        expect(renderer.getFrameCount()).toBe(0);
    });
});

describe('StubPlatform - Full Integration Test', () => {
    let renderer: NullRenderer;
    let input: StubInput;
    let clock: StubClock;
    let world: World;
    let gameLoop: GameLoop;

    beforeEach(() => {
        renderer = new NullRenderer();
        input = new StubInput();
        clock = new StubClock();
        world = new World();
        globalThis.requestAnimationFrame = () => 0;

        gameLoop = new GameLoop(
            renderer,
            input,
            world,
            () => 16 / 9,
        );
    });

    it('can run full game loop update and render cycles', () => {
        clock.setFixedDeltaTime(1 / 60);
        clock.step(60); // Simulate 1 second at 60fps

        expect(() => {
            for (let i = 0; i < 60; i += 1) {
                clock.update();
                input.update();
                gameLoop.update(clock.getDeltaTime());
                gameLoop.render();
            }
        }).not.toThrow();

        expect(renderer.getFrameCount()).toBe(60);
    });

    it('handles player input correctly', () => {
        input.setMove(1, 0); // Move forward
        const intent = input.getIntent();
        expect(intent.move.x).toBe(1);
        expect(intent.move.y).toBe(0);

        // Transient flag should reset after retrieval
        expect(intent.move.x).toBe(1); // Previous intent still has value
    });

    it('handles camera look input', () => {
        input.setLook(0.1, 0.05);
        const intent = input.getIntent();
        expect(intent.look.yaw).toBe(0.1);
        expect(intent.look.pitch).toBe(0.05);
    });

    it('supports deterministic time control', () => {
        clock.setTime(0);
        expect(clock.getTime()).toBe(0);

        clock.setFixedDeltaTime(0.016); // 60fps
        clock.step(30); // 30 frames
        expect(clock.getTime()).toBeCloseTo(0.016 * 30, 5);
    });

    it('supports pause/resume', () => {
        clock.setFixedDeltaTime(0.016);
        const initialTime = clock.getTime();

        clock.step(10);
        const timeAfterStep = clock.getTime();
        expect(timeAfterStep).toBeGreaterThan(initialTime);

        clock.pause();
        clock.step(10);
        expect(clock.getTime()).toBe(timeAfterStep); // Should not advance

        clock.resume();
        clock.step(10);
        expect(clock.getTime()).toBeGreaterThan(timeAfterStep);
    });
});
