// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { InputState } from '../../core/input';
import createGameLoop from '../../core/gameLoop';
import NullRenderer from './nullRenderer';
import { World } from '../../core/world';

describe('Deletion test', () => {
    it('core compiles and runs with stub renderer', () => {
        globalThis.requestAnimationFrame = () => 0;

        const renderer = new NullRenderer();
        const mockCoreInput : InputState = {
            actions: { Look: true },
            axes: {
                lookX: 0,
                lookY: 0,
                moveX: 0,
                moveY: 0,
            },
        };
        const mockWorld : World = new World();

        expect(() => createGameLoop(
            renderer,
            mockCoreInput,
            mockWorld,
            () => 800 / 600,
        )).not.toThrow();
    });
});
